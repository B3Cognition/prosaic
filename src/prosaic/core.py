"""Discover canonical prose, with the original case-sensitive inspection contract."""
from __future__ import annotations

import os
import re
from pathlib import Path

from .compat import js_sort_key, js_string, load_yaml, yaml_error_message
from .config import ARTIFACT_TYPES, _type_name, resolve_config

FRONTMATTER_RE = re.compile(r'^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$')
DIR_CONVENTION = {folder: kind for kind, folders in {
    'rule': ['rules', 'rule'], 'skill': ['skills', 'skill'],
    'subagent': ['subagents', 'subagent', 'agents', 'agent'],
    'command': ['commands', 'command']}.items() for folder in folders}
BUNDLE_FOLDERS = {'skills', 'skill', 'subagents', 'subagent', 'agents', 'agent'}
SKIP_DIRS = {'.git', 'node_modules', 'dist', '.prosaic-backups', '.prosaic-package-staging'}
PRIMARY_NAMES = ['SKILL.md', 'AGENT.md', 'SUBAGENT.md', 'index.md', 'README.md']


class ParseError(ValueError):
    pass


class ArtifactNotFoundError(ValueError):
    def __init__(self, artifact_id):
        self.artifact_id = artifact_id
        super().__init__(f'Unknown artifact: "{artifact_id}" was not found by discovery')


def parse_artifact(raw):
    raw = raw.removeprefix('\ufeff')
    match = FRONTMATTER_RE.match(raw)
    if not match:
        if re.match(r'^---\r?\n', raw):
            raise ParseError('frontmatter block is not closed with a terminating "---"')
        return {'frontmatter': {}, 'body': raw}
    text, body = match.groups()
    try:
        loaded = load_yaml(text)
    except Exception as error:
        raise ParseError(f'invalid YAML frontmatter: {yaml_error_message(error, text)}') from error
    if loaded is None:
        loaded = {}
    if not isinstance(loaded, dict):
        raise ParseError('frontmatter must be a YAML mapping')
    return {'frontmatter': loaded, 'body': body}


def classify(source_rel_path, frontmatter):
    candidates = set()
    if 'type' in frontmatter:
        value = frontmatter['type']
        if value not in ARTIFACT_TYPES:
            return {'ok': False, 'reason': f'frontmatter type "{js_string(value)}" is not one of rule|skill|subagent|command'}
        candidates.add(value)
    top_dir = source_rel_path.split('/')[0]
    if top_dir.lower() in DIR_CONVENTION:
        candidates.add(DIR_CONVENTION[top_dir.lower()])
    if not candidates:
        return {'ok': False, 'reason': f'matches 0 artifact types (no frontmatter "type" and directory "{top_dir}" is not a known artifact folder)'}
    if len(candidates) > 1:
        return {'ok': False, 'reason': f"matches more than 1 artifact type: {', '.join(sorted(candidates))}"}
    return {'ok': True, 'type': next(iter(candidates))}


def validate_frontmatter(kind, frontmatter):
    strings = ['type', 'name', 'description', 'color', 'effort', 'model_tier', 'invocation']
    # Preserve Zod field admission order so the first reported issue matches.
    order = ['type', 'name', 'description', 'execution', 'visibility', 'color', 'tools', 'effort', 'model_tier', 'invocation', 'capability', 'overrides']
    for field in order:
        if field not in frontmatter:
            if kind in ('skill', 'subagent') and field in ('name', 'description'):
                return {'ok': False, 'field': field, 'reason': f'{kind} requires a {field}'}
            continue
        value = frontmatter[field]
        reason = None
        if field in strings:
            if not isinstance(value, str):
                reason = f'Expected string, received {_type_name(value)}'
            elif kind in ('skill', 'subagent') and field in ('name', 'description') and not value:
                reason = 'String must contain at least 1 character(s)'
        elif field in ('execution', 'visibility'):
            values = ['command', 'skill', 'agent'] if field == 'execution' else ['user', 'hidden']
            if value not in values:
                if not isinstance(value, str):
                    reason = f"Expected {' | '.join(repr(v) for v in values)}, received {_type_name(value)}"
                else:
                    reason = f"Invalid enum value. Expected {' | '.join(repr(v) for v in values)}, received '{value}'"
        elif field in ('tools', 'capability'):
            if not isinstance(value, str) and not (isinstance(value, list) and all(isinstance(v, str) for v in value)):
                reason = 'Invalid input'
        elif field == 'overrides':
            if not isinstance(value, dict):
                reason = f'Expected object, received {_type_name(value)}'
            else:
                for target, overrides in value.items():
                    if not isinstance(overrides, dict):
                        return {'ok': False, 'field': f'overrides.{target}', 'reason': f'Expected object, received {_type_name(overrides)}'}
        if reason:
            return {'ok': False, 'field': field, 'reason': reason}
    return {'ok': True, 'frontmatter': frontmatter.copy()}


def walk_source(source_root, project_root):
    source = Path(os.path.abspath(source_root))
    backup = Path(os.path.abspath(project_root)) / '.prosaic-backups'
    if not source.exists():
        return []
    files = []
    stack = [source]
    while stack:
        directory = stack.pop()
        try:
            entries = list(os.scandir(directory))
        except OSError:
            continue
        for entry in entries:
            path = Path(entry.path)
            if path == backup or backup in path.parents:
                continue
            if entry.is_dir(follow_symlinks=False):
                if entry.name not in SKIP_DIRS:
                    stack.append(path)
                continue
            if not entry.is_file(follow_symlinks=False) or not path.name.lower().endswith('.md'):
                continue
            files.append({'abs': str(path), 'rel': path.relative_to(source).as_posix()})
    return sorted(files, key=lambda file: js_sort_key(file['rel']))


def discover(source_root, project_root):
    files = walk_source(source_root, project_root)
    bundles = {}
    standalone = []
    warnings, artifacts = [], []
    for file in files:
        parts = file['rel'].split('/')
        if len(parts) >= 3 and parts[0].lower() in BUNDLE_FOLDERS:
            bundles.setdefault('/'.join(parts[:2]), []).append(file)
        else:
            standalone.append(file)

    def build(file, bundle=None, group=None):
        try:
            raw = Path(file['abs']).read_bytes().decode('utf-8', errors='replace')
        except OSError as error:
            from .filesystem import node_os_error
            warnings.append({'kind': 'malformed-frontmatter', 'artifact': file['rel'], 'message': f'unreadable: {node_os_error(error,"open",file["abs"])}'})
            return
        try:
            parsed = parse_artifact(raw)
        except ParseError as error:
            warnings.append({'kind': 'malformed-frontmatter', 'artifact': file['rel'], 'message': str(error)})
            return
        classified = classify(file['rel'], parsed['frontmatter'])
        if not classified['ok']:
            warnings.append({'kind': 'classification', 'artifact': file['rel'], 'message': classified['reason']})
            return
        validated = validate_frontmatter(classified['type'], parsed['frontmatter'])
        if not validated['ok']:
            warnings.append({'kind': 'schema-invalid', 'artifact': file['rel'], 'message': f'field "{validated["field"]}": {validated["reason"]}'})
            return
        artifact = {'id': file['rel'], 'type': classified['type'], 'frontmatter': validated['frontmatter'],
                    'body': parsed['body'], 'sourcePath': file['rel']}
        if bundle:
            artifact['bundleRoot'] = bundle
            artifact['resources'] = sorted([
                {'relPath': item['rel'][len(bundle)+1:], 'content': Path(item['abs']).read_bytes().decode('utf-8', errors='replace')}
                for item in group if item['abs'] != file['abs']], key=lambda resource: js_sort_key(resource['relPath']))
        artifacts.append(artifact)

    for bundle, group in bundles.items():
        direct = [file for file in group if str(Path(file['rel']).parent) == bundle]
        primary = next((file for preferred in PRIMARY_NAMES for file in direct if Path(file['rel']).name.lower() == preferred.lower()), None)
        if primary is None:
            primary = next((file for file in direct if file['rel'].lower().endswith('.md')), None)
        if primary:
            build(primary, bundle, group)
    for file in standalone:
        build(file)
    artifacts.sort(key=lambda artifact: js_sort_key(artifact['id']))
    report = {'empty': not artifacts, 'message': f'{len(artifacts)} artifact(s) discovered.' if artifacts else 'Empty run: 0 discoverable artifacts found; 0 files written.'}
    return {'artifacts': artifacts, 'warnings': warnings, 'report': report}


def inspect_artifact(project_root, artifact_id, cli=None):
    try:
        config = resolve_config(project_root, cli)
        source = Path(os.path.abspath(os.path.join(project_root, config['source'])))
        artifact = next((a for a in discover(source, project_root)['artifacts'] if a['id'] == artifact_id), None)
        if artifact is None:
            raise ArtifactNotFoundError(artifact_id)
        return {'ok': True, 'data': {'id': artifact['id'], 'type': artifact['type'],
                'frontmatter': artifact['frontmatter'], 'body': artifact['body'],
                'bundleRoot': str(source / artifact['bundleRoot']) if artifact.get('bundleRoot') else None,
                'resources': artifact.get('resources', [])}}
    except ArtifactNotFoundError as error:
        return {'ok': False, 'errorKind': 'artifact-not-found', 'artifactId': artifact_id, 'message': str(error)}
    except Exception as error:
        return {'ok': False, 'errorKind': 'internal', 'message': str(error)}
