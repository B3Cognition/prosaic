"""Preflight and execute the opt-in native output contract.

Legacy rendering and file-manifest bytes stay independent of this lifecycle.
All replacements finish before stale outputs can be removed.
"""
import os
from pathlib import Path

from .compat import js_sort_key
from .filesystem import Manifest, BackupManager, MANIFEST_FILENAME, sha256, to_rel_posix, is_inside
from .managed_blocks import (BLOCKS_FILENAME, BEGIN, END, BlockLedger,
                             OutputConflictError, plan_block)
from .lifecycle import empty_plan, preview_plan


def aggregate_rules(artifacts):
    from .enforcement import strip_tags
    sections = []
    for artifact in sorted(artifacts, key=lambda a: js_sort_key(a['id'])):
        body = strip_tags(artifact['body']).rstrip() + '\n'
        if BEGIN.decode() in body or END.decode() in body:
            raise OutputConflictError('Canonical rules must not contain managed-block markers.')
        # IDs are deterministic, unique headings; rule frontmatter is metadata,
        # not another document frontmatter block inside AGENTS.md.
        sections.append('## ' + artifact['id'] + '\n\n' + body)
    return BEGIN.decode() + '\n\n' + '\n'.join(sections) + '\n' + END.decode() + '\n'


def _snapshot(fs, path):
    return sha256(fs.read_file_buffer(path)) if fs.exists(path) else None


def _check_owned_file(fs, entry):
    current = _snapshot(fs, entry['path'])
    if current is not None and current != entry['hash']:
        raise OutputConflictError(f'Locally edited managed file "{entry["path"]}"; refusing replacement or removal.')
    return current


def _protect(fs, path, source):
    resolved = fs.assert_mutable(path)
    root = fs.assert_contained('.')
    reserved = [fs.assert_contained(p) for p in (MANIFEST_FILENAME, BLOCKS_FILENAME, '.prosaic-backups')]
    if is_inside(resolved, source) or resolved == root or any(is_inside(resolved, p) for p in reserved):
        raise OutputConflictError(f'Output "{path}" overlaps canonical source or reserved provenance.')
    return os.path.normcase(str(resolved))


def plan_native(project_root, config, descriptors, registry, fs, *, check_only=False):
    from .core import _discover
    from .pipeline import run_pipeline
    from .validation import validate_project
    report = validate_project(project_root, registry=registry, cli={k: config[k] for k in
        ('source', 'targets', 'artifactTypes', 'lossyPolicy')})
    if report['errorCount']:
        raise OutputConflictError('Canonical validation failed; run prosaic validate --json for diagnostics.')
    manifest = Manifest.load_or_empty(fs)
    ledger = BlockLedger.load(fs)
    selected = {descriptor['id'] for descriptor in descriptors}
    source = fs.assert_contained(config['source'])
    discovery = _discover(Path(project_root) / config['source'], project_root, fail_io=True,
        allow_missing_source=not any(e['target'] in selected for e in manifest.all()))
    plan, produced, destinations = empty_plan(), set(), {}
    # Whole-file owners (including packages and unselected targets) cannot share
    # a physical path. Resolve symlinks before testing aliases and containment.
    owners = {}
    for entry in manifest.all():
        resolved = _protect(fs, entry['path'], source)
        owners.setdefault(resolved, []).append((entry['target'], entry['path'], 'file'))
    for entry in ledger.entries.values():
        resolved = _protect(fs, entry['path'], source)
        owners.setdefault(resolved, []).append((entry['target'], entry['path'], 'block'))

    def claim(target, path, ownership='file'):
        key = _protect(fs, path, source)
        if key in destinations:
            raise OutputConflictError(f'Duplicate output path "{path}".')
        if any(owner != (target, path, ownership) for owner in owners.get(key, [])):
            raise OutputConflictError(f'Output "{path}" belongs to another target or ownership mode.')
        for other in destinations:
            if is_inside(key, other) or is_inside(other, key):
                raise OutputConflictError(f'Overlapping output paths at "{path}".')
        destinations[key] = (target, path)
        produced.add((target, path))

    for descriptor in descriptors:
        target = descriptor['id']
        rules = []
        for artifact in discovery['artifacts']:
            if artifact['type'] not in config['artifactTypes']:
                continue
            if not descriptor['capabilities'].get(artifact['type'], False):
                plan['warnings'].append({'kind': 'unsupported-pair', 'artifact': artifact['id'], 'target': target,
                    'message': f'target "{target}" does not natively support artifact type "{artifact["type"]}"; skipped'})
                continue
            if artifact['type'] == 'rule' and descriptor.get('aggregate'):
                rendered = run_pipeline(artifact, descriptor, lossy_policy=config['lossyPolicy'])
                plan['warnings'].extend(rendered['warnings'])
                rules.append(artifact)
                continue
            rendered = run_pipeline(artifact, descriptor, lossy_policy=config['lossyPolicy'])
            plan['warnings'].extend(rendered['warnings'])
            for file in [{'path': rendered['path'], 'content': rendered['content']}, *rendered['companions'], *rendered['resources']]:
                path = to_rel_posix(fs.root, file['path'])
                claim(target, path)
                content = file['content']
                old = _snapshot(fs, path)
                entry = manifest.entries.get((target, path))
                if old is not None:
                    if entry:
                        _check_owned_file(fs, entry)
                    elif not (check_only and old == sha256(content)):
                        raise OutputConflictError(f'User-authored destination "{path}"; refusing adoption or overwrite.')
                plan['writes'].append({'targetId': target, 'path': path, 'content': content,
                    'hash': sha256(content), 'beforeHash': old,
                    'changeType': 'unchanged' if old == sha256(content) else ('create' if old is None else 'overwrite'),
                    'backupNeeded': old is not None and old != sha256(content)})
        if descriptor.get('aggregate') and 'rule' in config['artifactTypes']:
            path = to_rel_posix(fs.root, str(Path(descriptor['destinationDir']) / descriptor['aggregate']['file']))
            claim(target, path, 'block')
            operation = plan_block(fs, ledger, target, path, aggregate_rules(rules) if rules else None,
                                   check_only=check_only)
            if operation:
                plan['writes'].append(operation)
    # A partial type selection does not grant deletion rights over omitted types
    # in the old file-only manifest, which has no artifact-type metadata.
    full_selection = set(config['artifactTypes']) == {'rule', 'skill', 'subagent', 'command'}
    if full_selection:
        for entry in manifest.all():
            if entry['target'] in selected and (entry['target'], entry['path']) not in produced:
                _protect(fs, entry['path'], source)
                old = _check_owned_file(fs, entry)
                plan['removals'].append({'targetId': entry['target'], 'path': entry['path'], 'beforeHash': old})
    manifest.registry_version = registry.version()['version']
    return plan, manifest, ledger, discovery


def execute_native(plan, fs, manifest, ledger, retention):
    """Validate snapshots, write every replacement, then reconcile stale files."""
    from .locking import verify_project_lock
    entries = [*plan['writes'], *plan['removals']]
    for operation in entries:
        fs.assert_mutable(operation['path'])
        if _snapshot(fs, operation['path']) != operation['beforeHash']:
            raise OutputConflictError(f'Output "{operation["path"]}" changed after planning.')
    for path in (MANIFEST_FILENAME, BLOCKS_FILENAME):
        fs.assert_mutable(path)
    result = dict.fromkeys(('created', 'overwritten', 'unchanged', 'removed', 'backedUp'), 0)
    backups = BackupManager(fs, retention)
    def save_manifest():
        content = manifest.serialize().encode()
        if not fs.exists(MANIFEST_FILENAME) or fs.read_file_buffer(MANIFEST_FILENAME) != content:
            manifest.save()
    completed = []
    # Preserve provenance too if a later write fails. Rollback only bytes still
    # matching our write; an intervening local edit always wins.
    original_provenance = {p: fs.read_file_buffer(p) if fs.exists(p) else None
                           for p in (MANIFEST_FILENAME, BLOCKS_FILENAME)}
    def track_native_targets():
        candidates = ledger.native_targets | {w['targetId'] for w in plan['writes']}
        owned = {e['target'] for e in manifest.all()} | {e['target'] for e in ledger.entries.values()}
        ledger.native_targets = candidates & owned
    try:
        writes = sorted(plan['writes'], key=lambda w: w.get('ownership') == 'block' and w['blockEntry'] is None)
        for operation in writes:
            path, target = operation['path'], operation['targetId']
            if _snapshot(fs, path) != operation['beforeHash']:
                raise OutputConflictError(f'Output "{path}" changed before replacement.')
            if operation['changeType'] == 'unchanged':
                result['unchanged'] += 1
            else:
                old = fs.read_file_buffer(path) if fs.exists(path) else None
                if operation['backupNeeded']:
                    backups.backup(path)
                    result['backedUp'] += 1
                fs.write_file_atomic(path, operation['content'])
                completed.append((operation, old))
                result['created' if operation['changeType'] == 'create' else 'overwritten'] += 1
            if operation.get('ownership') == 'block':
                if operation['blockEntry'] is None:
                    ledger.entries.pop((target, path), None)
                else:
                    ledger.entries[target, path] = operation['blockEntry']
                if operation['deleteFile']:
                    fs.delete_file(path)
            else:
                manifest.record(target, path, operation['hash'])
        # Persist completed replacements before cleanup. No legacy output can be
        # deleted if a replacement or provenance write above fails.
        track_native_targets()
        ledger.save()
        save_manifest()
    except Exception as error:
        for operation, old in reversed(completed):
            path = operation['path']
            current = _snapshot(fs, path)
            if current == operation['hash'] or (operation.get('deleteFile') and current is None):
                try:
                    fs.delete_file(path) if old is None else fs.write_file_atomic(path, old)
                except OSError:
                    error.add_note(f'Could not roll back "{path}"; retained backup/provenance requires review.')
        for path, old in original_provenance.items():
            if (fs.read_file_buffer(path) if fs.exists(path) else None) != old:
                try:
                    fs.delete_file(path) if old is None else fs.write_file_atomic(path, old)
                except OSError:
                    error.add_note(f'Could not restore provenance "{path}".')
        raise
    for operation in plan['removals']:
        verify_project_lock(fs.root)
        if _snapshot(fs, operation['path']) != operation['beforeHash']:
            raise OutputConflictError(f'Output "{operation["path"]}" changed before removal.')
        fs.delete_file(operation['path'])
        manifest.remove(operation['targetId'], operation['path'])
        result['removed'] += 1
    save_manifest()
    track_native_targets()
    ledger.save()
    return result


def apply_native(project_root, config, descriptors, registry, fs, base, dry_run, theme):
    plan, manifest, ledger, discovery = plan_native(project_root, config, descriptors, registry, fs)
    base.update(empty=discovery['report']['empty'], warnings=[*discovery['warnings'], *plan['warnings']], plan=plan,
                changedFiles=sum(w['changeType'] != 'unchanged' for w in plan['writes']) + len(plan['removals']))
    if dry_run:
        base['preview'] = preview_plan(plan, theme=theme)
    else:
        base.update(execute_native(plan, fs, manifest, ledger, config['backupRetention']))
    return base


def revert_native(fs, config, dry_run, theme):
    from .lifecycle import plan_revert
    if config['targets'] == []:
        plan = empty_plan()
        return {'dryRun': bool(dry_run), 'removed': 0,
                'preview': preview_plan(plan, 'revert', theme) if dry_run else [], 'plan': plan}
    manifest, ledger = Manifest.load_or_empty(fs), BlockLedger.load(fs)
    plan = plan_revert(manifest, config['targets'])
    source = fs.assert_contained(config['source'])
    whole_paths = {_protect(fs, entry['path'], source) for entry in manifest.all()}
    if any(_protect(fs, entry['path'], source) in whole_paths for entry in ledger.entries.values()):
        raise OutputConflictError('Conflicting whole-file and block ownership; refusing revert.')
    for operation in plan['removals']:
        entry = manifest.entries[operation['targetId'], operation['path']]
        operation['beforeHash'] = _check_owned_file(fs, entry)
    for entry in list(ledger.entries.values()):
        if config['targets'] == 'all' or entry['target'] in config['targets']:
            plan['writes'].append(plan_block(fs, ledger, entry['target'], entry['path']))
    removed = len(plan['removals']) + len(plan['writes'])
    if not dry_run:
        execute_native(plan, fs, manifest, ledger, config['backupRetention'])
    return {'dryRun': bool(dry_run), 'removed': 0 if dry_run else removed,
            'preview': preview_plan(plan, 'revert', theme) if dry_run else [], 'plan': plan}
