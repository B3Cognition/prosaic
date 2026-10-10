"""Pure authoring diagnostics; no provenance, mutation or execution admission."""
from pathlib import Path
import unicodedata

from .config import resolve_config
from .core import discover
from .pipeline import rewrite_references, run_pipeline, translate_neutral
from .registry import Registry

_MESSAGES = {
    'malformed-frontmatter': 'Canonical frontmatter cannot be parsed or read.',
    'classification': 'Artifact type is missing, invalid or ambiguous.',
    'schema-invalid': 'Canonical frontmatter does not satisfy the artifact schema.',
    'unresolved-reference': 'A local Markdown reference does not resolve to a bundle resource.',
    'unsupported-pair': 'The selected target does not support this artifact type.',
    'lossy-intent': 'The selected target cannot represent declared canonical intent.',
    'render-error': 'The artifact cannot be rendered for this target.',
}


def _bounded(value):
    return ''.join(c for c in str(value) if not unicodedata.category(c).startswith('C'))[:256]


def _issue(code, artifact, *, target=None, location='$.frontmatter', severity='error'):
    result = {'code': code, 'severity': severity, 'location': _bounded(location),
              'message': _MESSAGES[code], 'artifactId': _bounded(artifact)}
    if target is not None:
        result['targetId'] = _bounded(target)
    return result


def validate_project(project_root, cli=None, *, strict=False, registry=None, global_dir=None):
    """Return a new deterministic camelCase diagnostic report without writes.

    Canonical validity is independent of selected targets or artifact filters.
    Target warnings obey artifact selection; strict mode makes warnings fail.
    Configuration/registry/read failures outside canonical discovery remain
    operational exceptions rather than fabricated validation reports.
    """
    config = resolve_config(project_root, cli, global_dir)
    registry = Registry() if registry is None else registry
    descriptors = registry.resolve_selection(config['targets'])
    discovery = discover(Path(project_root) / config['source'], project_root)
    issues = []
    for warning in discovery['warnings']:
        code = warning['kind']
        if code in ('malformed-frontmatter', 'classification', 'schema-invalid'):
            issues.append(_issue(code, warning['artifact']))
    for artifact in discovery['artifacts']:
        resources = artifact.get('resources', [])
        primary_path = artifact['sourcePath'].rsplit('/', 1)[-1]
        texts = [('$.body', artifact['body'], primary_path),
                 *[(f'$.resources[{index}].content', resource['content'], resource['relPath'])
                   for index, resource in enumerate(resources)]]
        for location, text, resource_path in texts:
            for unused in rewrite_references(text, resources, artifact['id'], '',
                    resource_path=resource_path, primary_path=primary_path)['warnings']:
                issues.append(_issue('unresolved-reference', artifact['id'], location=location))
        if artifact['type'] not in config['artifactTypes']:
            continue
        for descriptor in descriptors:
            target = descriptor['id']
            if not descriptor['capabilities'].get(artifact['type'], False):
                issues.append(_issue('unsupported-pair', artifact['id'], target=target,
                                     location='$.type', severity='warning'))
                continue
            try:
                for key in translate_neutral(artifact['frontmatter'], descriptor)['dropped']:
                    issues.append(_issue('lossy-intent', artifact['id'], target=target,
                        location='$.frontmatter.' + key,
                        severity='error' if config['lossyPolicy'] == 'error' else 'warning'))
                run_pipeline(artifact, descriptor, lossy_policy='warn')
            except Exception:
                issues.append(_issue('render-error', artifact['id'], target=target, location='$'))
                continue
    issues.sort(key=lambda issue: (issue.get('artifactId', ''), issue.get('targetId', ''),
                                   issue['code'], issue['location']))
    errors = sum(issue['severity'] == 'error' for issue in issues)
    warnings = sum(issue['severity'] == 'warning' for issue in issues)
    return {'schemaVersion': 1, 'valid': errors == 0 and not (strict and warnings),
            'artifactCount': len(discovery['artifacts']), 'errorCount': errors,
            'warningCount': warnings, 'issues': issues}
