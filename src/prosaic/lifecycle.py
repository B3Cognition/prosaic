"""Plan and execute render-target apply and provenance-guarded revert."""
from pathlib import Path
from .filesystem import GuardedFs, Manifest, BackupManager, sha256, to_rel_posix

def empty_plan():
    return {'writes': [], 'removals': [], 'warnings': []}

def classify_write(fs_gate, manifest, target, path, content, mode=None, binary=False):
    base = {'targetId': target, 'path': path, 'content': content, 'hash': sha256(content)}
    if mode is not None:
        base['mode'] = mode
    if not fs_gate.exists(path):
        return {**base, 'changeType': 'create', 'backupNeeded': False}
    existing = fs_gate.read_file_buffer(path) if binary else fs_gate.read_file(path)
    if sha256(existing) == base['hash']:
        return {**base, 'changeType': 'unchanged', 'backupNeeded': False}
    if not manifest.is_managed(target, path):
        return None
    return {**base, 'changeType': 'overwrite', 'backupNeeded': True}

def plan_reconcile(manifest, produced, selected):
    return [{'targetId': e['target'], 'path': e['path']} for e in manifest.all()
            if e['target'] in selected and (e['target'], e['path']) not in produced]

def plan_revert(manifest, selection):
    plan = empty_plan()
    plan['removals'] = [{'targetId': e['target'], 'path': e['path']} for e in manifest.all()
                        if selection == 'all' or e['target'] in selection]
    return plan

def preview_plan(plan, mode='apply', theme=None):
    def wrap(key, text):
        if theme is None:
            return text
        return (theme[key] if isinstance(theme, dict) else getattr(theme, key))(text)
    counts = {k: sum(w['changeType'] == k for w in plan['writes']) for k in ('create', 'overwrite', 'unchanged')}
    backups = sum(w['backupNeeded'] for w in plan['writes'])
    n = len(plan['removals'])
    header = (f"Dry run (apply): {counts['create']} create, {counts['overwrite']} overwrite, {backups} backup, {n} remove, {counts['unchanged']} unchanged. 0 files written, 0 files deleted."
              if mode == 'apply' else f'Dry run (revert): {n} remove. 0 files deleted.')
    lines = [header]
    for w in plan['writes']:
        if w['changeType'] != 'unchanged':
            label = 'create ' if w['changeType'] == 'create' else 'update '
            label = wrap('created' if w['changeType'] == 'create' else 'overwrite', label)
            lines.append(f"{label} {wrap('path', w['path'])} [{w['targetId']}]" + (' (backup prior content)' if w['backupNeeded'] else ''))
    lines.extend(f"{wrap('error', 'remove ')} {wrap('path', r['path'])} [{r['targetId']}]" for r in plan['removals'])
    return lines

def execute_revert(plan, fs_gate, manifest):
    for r in plan['removals']:
        fs_gate.delete_file(r['path'])
        manifest.remove(r['targetId'], r['path'])
    manifest.save()
    return len(plan['removals'])

def execute_apply(plan, fs_gate, manifest, backups, staged_package=None):
    result = dict.fromkeys(('created', 'overwritten', 'unchanged', 'removed', 'backedUp'), 0)
    for w in plan['writes']:
        if w['changeType'] == 'unchanged':
            result['unchanged'] += 1
        else:
            if w['backupNeeded']:
                backups.backup(fs_gate.assert_contained(w['path']))
                result['backedUp'] += 1
            if staged_package is None:
                fs_gate.write_file(w['path'], w['content'])
            else:
                import os
                from .packages import staging_path_for
                fs_gate.move_file_atomic(staging_path_for(staged_package, w['path']), w['path'])
                if 'mode' in w and os.name != 'nt':
                    os.chmod(fs_gate.assert_contained(w['path']), w['mode'])
            result['created' if w['changeType'] == 'create' else 'overwritten'] += 1
        manifest.record(w['targetId'], w['path'], w['hash'])
    for r in plan['removals']:
        fs_gate.delete_file(r['path'])
        manifest.remove(r['targetId'], to_rel_posix(fs_gate.root, r['path']))
        result['removed'] += 1
    manifest.save()
    return result

def apply(project_root, cli=None, dry_run=False, *, registry=None, global_dir=None, theme=None):
    from .config import resolve_config
    from .core import discover
    from .registry import Registry
    from .pipeline import run_pipeline
    fs_gate = GuardedFs(project_root)
    config = resolve_config(project_root, cli, global_dir)
    registry = registry if registry is not None else Registry()
    descriptors = registry.resolve_selection(config['targets'])
    base = {'dryRun': bool(dry_run), 'empty': False, 'zeroTargets': False, 'warnings': [], 'preview': [], 'changedFiles': 0,
            **dict.fromkeys(('created', 'overwritten', 'unchanged', 'removed', 'backedUp'), 0), 'plan': empty_plan()}
    if config['targets'] == []:
        return {**base, 'zeroTargets': True, 'preview': ['0 targets selected; no-op run. 0 files written.']}
    discovery = discover(Path(project_root) / config['source'], project_root)
    manifest = Manifest.load_or_empty(fs_gate)
    manifest.registry_version = registry.version()['version']
    plan = empty_plan()
    produced = set()
    for descriptor in descriptors:
        for artifact in discovery['artifacts']:
            if artifact['type'] not in config['artifactTypes']:
                continue
            target = descriptor['id']
            if not descriptor['capabilities'].get(artifact['type'], False):
                plan['warnings'].append({'kind': 'unsupported-pair', 'artifact': artifact['id'], 'target': target,
                    'message': f'target "{target}" does not natively support artifact type "{artifact["type"]}"; skipped'})
                continue
            rendered = run_pipeline(artifact, descriptor, lossy_policy=config['lossyPolicy'])
            plan['warnings'].extend(rendered['warnings'])
            for file in [{'path': rendered['path'], 'content': rendered['content']}, *rendered['companions'], *rendered['resources']]:
                w = classify_write(fs_gate, manifest, target, file['path'], file['content'])
                produced.add((target, file['path']))
                if w:
                    plan['writes'].append(w)
                else:
                    plan['warnings'].append({'kind': 'unsupported-pair', 'artifact': artifact['id'], 'target': target,
                        'message': f'refused to overwrite user-authored file "{file["path"]}" (not recorded as tool-generated)'})
    plan['removals'] = plan_reconcile(manifest, produced, {d['id'] for d in descriptors})
    base.update(empty=discovery['report']['empty'], warnings=[*discovery['warnings'], *plan['warnings']], plan=plan,
                changedFiles=sum(w['changeType'] != 'unchanged' for w in plan['writes']) + len(plan['removals']))
    if dry_run:
        base['preview'] = preview_plan(plan, theme=theme)
    else:
        base.update(execute_apply(plan, fs_gate, manifest, BackupManager(fs_gate, config['backupRetention'])))
    return base

def revert(project_root, cli=None, dry_run=False, *, registry=None, global_dir=None, theme=None):
    from .config import resolve_config
    fs_gate = GuardedFs(project_root)
    config = resolve_config(project_root, cli, global_dir)
    manifest = Manifest.load(fs_gate)
    plan = plan_revert(manifest, config['targets'])
    return {'dryRun': bool(dry_run), 'removed': 0 if dry_run else execute_revert(plan, fs_gate, manifest),
            'preview': preview_plan(plan, 'revert', theme) if dry_run else [], 'plan': plan}
