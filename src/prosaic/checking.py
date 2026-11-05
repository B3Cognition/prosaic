"""Read-only drift diagnostics for local and committed generated output."""
from .config import resolve_config
from .filesystem import GuardedFs, ManifestError, ContainmentError
from .registry import registry_for_config
from .validation import validate_project, _bounded


def check_project(project_root, cli=None, *, registry=None, global_dir=None):
    """Check expected output bytes without locks, adoption or provenance writes.

    Authoring warnings remain warnings. Invalid source, pending writes/removals
    and ownership conflicts fail the check. Matching committed output can pass
    without a machine-local manifest; check never grants ownership of it.
    """
    config = resolve_config(project_root, cli, global_dir)
    registry = registry_for_config(config, registry)
    validation = validate_project(project_root, cli, registry=registry, global_dir=global_dir)
    issues = list(validation['issues'])
    changed = 0
    if validation['valid']:
        try:
            if config['targets'] == []:
                plan = {'writes': [], 'removals': []}
            elif config.get('outputContracts') == 'native-v1':
                from .native import plan_native
                plan, unused_manifest, unused_ledger, unused_discovery = plan_native(
                    project_root, config, registry.resolve_selection(config['targets']), registry,
                    GuardedFs(project_root), check_only=True)
            else:
                from .lifecycle import apply
                plan = apply(project_root, cli, dry_run=True, registry=registry, global_dir=global_dir)['plan']
                for warning in plan['warnings']:
                    if 'refused to overwrite user-authored' in warning['message']:
                        issues.append({'code': 'output-conflict', 'severity': 'error',
                                       'message': _bounded(warning['message'])})
            for operation in [*plan['writes'], *plan['removals']]:
                if operation.get('changeType') == 'unchanged':
                    continue
                changed += 1
                issues.append({'code': 'output-drift', 'severity': 'error',
                    'path': operation['path'], 'targetId': operation['targetId'],
                    'message': 'Generated output differs, is missing, or is stale.'})
        except (ValueError, OSError, ManifestError, ContainmentError) as error:
            issues.append({'code': 'output-conflict', 'severity': 'error', 'message': _bounded(error)})
    return {'schemaVersion': 1, 'clean': not any(i['severity'] == 'error' for i in issues),
            'changedFiles': changed, 'issues': issues}
