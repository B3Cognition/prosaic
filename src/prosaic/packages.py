"""Opaque package deployment with isolated staging and provenance."""
from pathlib import Path
import os
import posixpath
from .filesystem import GuardedFs, Manifest, BackupManager, ContainmentError, resolve_contained, is_inside, node_os_error
from .lifecycle import empty_plan, classify_write, plan_reconcile, plan_revert, preview_plan, execute_apply, execute_revert
from .compat import js_sort_key

PACKAGE_STAGING_ROOT = '.prosaic-package-staging'

class PackageValidationError(ValueError):
    pass

class UnknownPackageError(ValueError):
    def __init__(self, package_id):
        self.packageId = package_id
        super().__init__(f'Unknown package: "{package_id}" is not a declared package')

def resolve_declared_package(packages, package_id):
    for pkg in packages:
        if pkg['id'] == package_id:
            return pkg
    raise UnknownPackageError(package_id)

def _overlaps(a, b):
    return is_inside(a, b) or is_inside(b, a)

def validate_packages(packages, project_root, render_target_dirs):
    errors, destinations, sources = [], {}, {}
    for pkg in packages:
        source = Path(os.path.abspath(os.path.join(project_root, pkg['sourceRoot'])))
        if source.is_dir() and os.access(source, os.R_OK):
            sources[pkg['id']] = source
        else:
            errors.append(f'package "{pkg["id"]}": source root does not resolve to a readable directory: {pkg["sourceRoot"]}')
        try:
            destinations[pkg['id']] = resolve_contained(pkg['destinationRoot'], project_root)
        except ContainmentError:
            errors.append(f'package "{pkg["id"]}": destination root resolves outside the project root: {pkg["destinationRoot"]}')
    for i, a in enumerate(packages):
        for b in packages[i + 1:]:
            if a['id'] in destinations and b['id'] in destinations and _overlaps(destinations[a['id']], destinations[b['id']]):
                errors.append(f'packages "{a["id"]}" and "{b["id"]}": destination roots overlap')
    for pkg in packages:
        dest = destinations.get(pkg['id'])
        if dest is None:
            continue
        for target in render_target_dirs:
            if _overlaps(dest, target):
                errors.append(f'package "{pkg["id"]}": destination root overlaps a registered render target\'s destination directory: {target}')
    for pkg in packages:
        dest, source = destinations.get(pkg['id']), sources.get(pkg['id'])
        if dest is not None and source is not None and _overlaps(dest, source):
            errors.append(f'package "{pkg["id"]}": destination root overlaps its own source root')
    if errors:
        raise PackageValidationError('\n'.join(errors))

def enumerate_package_source(source_root):
    result = {'neutralFiles': [], 'runtimeFiles': [], 'warnings': []}
    root = Path(source_root)
    def walk(parent, prefix='', bucket=None, capture=True, ancestors=frozenset()):
        try:
            entries = sorted(parent.iterdir(), key=lambda p: js_sort_key(p.name))
        except OSError:
            return
        for entry in entries:
            rel = f'{prefix}/{entry.name}' if prefix else entry.name
            try:
                resolved = resolve_contained(entry, root)
            except ContainmentError:
                result['warnings'].append({'kind': 'package-path-rejected', 'artifact': rel,
                    'message': f'rejected (path traversal or symlink escape outside the package source root): {rel}'})
                continue
            try:
                stat = entry.stat()
            except OSError as e:
                result['warnings'].append({'kind': 'package-path-rejected', 'artifact': rel, 'message': f'unreadable entry: {rel} ({node_os_error(e, "stat", entry)})'})
                continue
            selected = bucket or ('neutralFiles' if entry.is_dir() and entry.name in ('commands', 'subagents') else 'runtimeFiles')
            preserve = capture if bucket else selected == 'runtimeFiles'
            if entry.is_dir():
                # A cyclic in-root directory symlink cannot produce a finite tree.
                if resolved in ancestors:
                    continue
                walk(entry, rel, selected, preserve, ancestors | {resolved})
            elif entry.is_file():
                file = {'relPath': rel, 'absPath': str(resolved)}
                if preserve:
                    file['mode'] = stat.st_mode
                result[selected].append(file)
    walk(root, ancestors=frozenset({root.resolve()}))
    return result

def staging_dir_for(package_id):
    return posixpath.normpath(PACKAGE_STAGING_ROOT + '/' + package_id)

def staging_path_for(package_id, dest_path):
    # Node's path.join retains preceding segments when a later argument is absolute.
    return posixpath.normpath(staging_dir_for(package_id) + '/' + dest_path)

def stage_package_writes(plan, fs_gate, package_id):
    fs_gate.remove_dir(staging_dir_for(package_id))
    for w in plan['writes']:
        if w['changeType'] != 'unchanged':
            fs_gate.write_file_atomic(staging_path_for(package_id, w['path']), w['content'])

def plan_package_deploy(fs_gate, manifest, package_id, destination_root, neutral_files, runtime_files):
    plan, produced = empty_plan(), set()
    for file in [*neutral_files, *runtime_files]:
        dest = posixpath.normpath(posixpath.join(destination_root, file['relPath']))
        w = classify_write(fs_gate, manifest, package_id, dest, Path(file['absPath']).read_bytes(), file.get('mode'), binary=True)
        produced.add((package_id, dest))
        if w:
            plan['writes'].append(w)
    plan['removals'] = plan_reconcile(manifest, produced, {package_id})
    return plan

def deploy_package(project_root, package_id, cli=None, dry_run=False, *, registry=None):
    from .config import resolve_config
    from .registry import Registry, slot_for
    fs_gate = GuardedFs(project_root)
    config = resolve_config(project_root, cli)
    registry = registry if registry is not None else Registry()
    target_dirs = []
    for descriptor in registry.all():
        for deployment_type in ('command', 'skill', 'agent'):
            dest = os.path.abspath(os.path.join(project_root, slot_for(descriptor, deployment_type)['dir']))
            if dest != os.path.abspath(project_root):
                target_dirs.append(dest)
    validate_packages(config['packages'], project_root, target_dirs)
    pkg = resolve_declared_package(config['packages'], package_id)
    enumeration = enumerate_package_source(Path(project_root) / pkg['sourceRoot'])
    manifest = Manifest.load_or_empty(fs_gate)
    manifest.registry_version = registry.version()['version']
    plan = plan_package_deploy(fs_gate, manifest, pkg['id'], pkg['destinationRoot'], enumeration['neutralFiles'], enumeration['runtimeFiles'])
    report = {'dryRun': bool(dry_run), 'packageId': pkg['id'], 'warnings': enumeration['warnings'], 'plan': plan,
              'preview': preview_plan(plan) if dry_run else [], **dict.fromkeys(('created', 'overwritten', 'unchanged', 'removed', 'backedUp'), 0)}
    if not dry_run:
        stage_package_writes(plan, fs_gate, pkg['id'])
        report.update(execute_apply(plan, fs_gate, manifest, BackupManager(fs_gate, config['backupRetention']), staged_package=pkg['id']))
    return report

def revert_package(project_root, package_id, cli=None, dry_run=False):
    from .config import resolve_config
    config = resolve_config(project_root, cli)
    resolve_declared_package(config['packages'], package_id)
    fs_gate = GuardedFs(project_root)
    manifest = Manifest.load(fs_gate)
    plan = plan_revert(manifest, [package_id])
    return {'dryRun': bool(dry_run), 'packageId': package_id,
            'removed': 0 if dry_run else execute_revert(plan, fs_gate, manifest),
            'preview': preview_plan(plan, 'revert') if dry_run else []}
