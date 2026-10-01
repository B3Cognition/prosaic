"""Offline inverse distribution, preserving the reference import report contract."""
from __future__ import annotations

import json
import os
import posixpath
import re
import tempfile
from pathlib import Path

from .compat import load_yaml, dump_yaml, js_string, yaml_error_message, stringify_json
from .import_toml import parse_toml

NEUTRAL_KEYS = ('execution', 'capability', 'effort', 'tools', 'invocation', 'visibility', 'color')
IMPORT_STABLE_TARGETS = {'claude-code', 'cursor', 'windsurf', 'cline', 'roo-code', 'github-copilot', 'codex-cli', 'gemini-cli', 'goose'}
DEFAULT_PLACEHOLDERS = ('{{args}}', '{{ args }}', '$ARGUMENTS', '{{ARGS}}')
CANONICAL_NEUTRAL_PLACEHOLDER = '{{args}}'
SKIP_DIRS = {'.git', 'node_modules', 'dist', '.prosaic-backups'}


class NonInjectiveValueMapError(ValueError):
    def __init__(self, target_id, neutral_key):
        super().__init__(f'Target "{target_id}" has a non-injective valueMap for neutral key "{neutral_key}" without inverse metadata. Cannot safely invert — refusing import for this target.')


def _json(value):
    return stringify_json(value)


def _warning(kind, message, artifact=None, target=None, **extra):
    out = {'kind': kind}
    if artifact is not None:
        out['artifact'] = artifact
    if target is not None:
        out['target'] = target
    out['message'] = message
    return dict(out, **extra)


def _theme(theme, key, value=None):
    defaults = {'okMarker': '[ok]', 'dropMarker': '[drop]', 'arrow': '->'}
    member = theme.get(key) if isinstance(theme, dict) else getattr(theme, key, None)
    if value is None:
        return member or defaults[key]
    return member(value) if callable(member) else value


def build_import_report(files, opts, theme=None):
    warnings = [w for f in files for w in f['warnings']]
    preview = [f"format: {opts['resolvedFormat']} ({opts['resolutionMethod']})"]
    for f in files:
        outcome = f['outcome']
        if outcome['ok']:
            rt = f.get('roundTrip')
            suffix = f" [{rt['fidelity']}]" if rt else ''
            preview.append(f"  {_theme(theme, 'created', _theme(theme, 'okMarker'))} {_theme(theme, 'path', f['foreignPath'])} {_theme(theme, 'arrow')} {_theme(theme, 'path', outcome['artifactId'])}{suffix}")
        else:
            preview.append(f"  {_theme(theme, 'error', _theme(theme, 'dropMarker'))} {_theme(theme, 'path', f['foreignPath'])}: {outcome['reason']}")
        preview.extend(f"    {_theme(theme, 'warn', 'warning')}[{w['kind']}]: {w['message']}" for w in f['warnings'])
    result = {'resolvedFormat': opts['resolvedFormat'], 'resolutionMethod': opts['resolutionMethod'], 'files': files, 'portabilityWarnings': [w for w in warnings if w['kind'] == 'portability'], 'allWarnings': warnings, 'silentDropCount': sum(not f['outcome']['ok'] and not f['warnings'] for f in files), 'preview': preview, 'dryRun': opts['dryRun']}
    if len(opts.get('overriddenCandidates') or []) >= 2:
        result['ambiguityResolvedByOverride'] = {'candidates': opts['overriddenCandidates']}
    return result


def format_portability_report(report, theme=None):
    if not report['portabilityWarnings']:
        return []
    lines = ['=== Portability Report ===']
    for w in report['portabilityWarnings']:
        where = f" {_theme(theme, 'arrow')} ".join(str(w[k]) for k in ('artifact', 'target') if w.get(k))
        lines.append(f"  {_theme(theme, 'overwrite', '[' + w['kind'] + ']')} {where}: {w['message']}")
        lines.append(_theme(theme, 'dim', '    Remediation: ' + w.get('remediation', 'Review this warning; no automatic remediation available.')))
    return lines


def format_run_summary(report, theme=None):
    files = report['files']
    lines = [f"import: format={report['resolvedFormat']} ({report['resolutionMethod']})"]
    rows = [('imported', sum(f['outcome']['ok'] for f in files)), ('dropped', sum(not f['outcome']['ok'] for f in files)), ('round-trip verified', sum(bool(f.get('roundTrip', {}).get('verified')) for f in files))]
    lines.extend(f'  {label:<19}  {count}' for label, count in rows)
    if report['dryRun']:
        lines.append('(dry-run: 0 files written)')
    levels = {}
    for f in files:
        if 'roundTrip' in f:
            values = levels.setdefault(f['targetId'], [])
            if f['roundTrip']['fidelity'] not in values:
                values.append(f['roundTrip']['fidelity'])
    lines.extend(f"  fidelity[{target}]: {', '.join(values)} (lossless-where-invertible with overrides fallback)" for target, values in levels.items())
    if report['portabilityWarnings']:
        lines.append(f"  {len(report['portabilityWarnings'])} portability warning(s) - see portability report")
    return lines


def _walk(directory, project_root):
    results = []
    def recurse(current):
        try:
            entries = sorted(os.scandir(current), key=lambda e: e.name.encode('utf-16-be', 'surrogatepass'))
        except OSError:
            return
        for entry in entries:
            if entry.is_dir(follow_symlinks=False):
                if entry.name not in SKIP_DIRS:
                    recurse(entry.path)
            elif entry.is_file(follow_symlinks=False):
                results.append({'abs': entry.path, 'relToRoot': os.path.relpath(entry.path, project_root)})
    recurse(directory)
    return results


def _dir_matches(file_dir, slot_dir):
    norm = lambda s: re.sub(r'/$', '', re.sub(r'^\./', '', s))
    file_dir, slot_dir = norm(file_dir), norm(slot_dir)
    if slot_dir in ('', '.'):
        return file_dir in ('', '.')
    return file_dir == slot_dir or file_dir.startswith(slot_dir + '/')


def match_file(file_path, descriptors):
    result = []
    directory, extension = posixpath.dirname(file_path) or '.', posixpath.splitext(file_path)[1]
    for desc in descriptors:
        slots = [{'dir': desc['destinationDir'], 'extension': desc['extension']}] + list((desc.get('slots') or {}).values())
        if any(_dir_matches(directory, slot['dir']) and (extension == slot.get('extension', desc['extension']) or slot.get('extension', desc['extension']).endswith(extension)) for slot in slots):
            result.append(desc['id'])
    return result


class SignatureIndex:
    """Read-only directory/extension index, matching the exported TS seam."""

    def __init__(self, entries):
        self.entries = entries

    @classmethod
    def build(cls, descriptors):
        entries = []
        for desc in descriptors:
            seen = set()
            slots = [{'dir': desc['destinationDir'], 'extension': desc['extension']}]
            slots.extend((desc.get('slots') or {})[kind] for kind in ('command', 'skill', 'agent') if kind in (desc.get('slots') or {}))
            for slot in slots:
                extension = slot.get('extension', desc['extension'])
                signature = (slot['dir'], extension)
                if signature not in seen:
                    seen.add(signature)
                    entries.append({'dir': slot['dir'], 'extension': extension, 'descriptorId': desc['id']})
        return cls(entries)

    def match_file(self, file_path):
        directory, extension = posixpath.dirname(file_path) or '.', posixpath.splitext(file_path)[1]
        matches = []
        for entry in self.entries:
            if (extension == entry['extension'] or entry['extension'].endswith(extension)) and _dir_matches(directory, entry['dir']) and entry['descriptorId'] not in matches:
                matches.append(entry['descriptorId'])
        return matches

    def all(self):
        return self.entries[:]


def scan_candidates(foreign_dir, project_root, descriptors):
    result = []
    for f in _walk(foreign_dir, project_root):
        for target in match_file(f['relToRoot'], descriptors):
            if target not in result:
                result.append(target)
    return result


def detect_format(foreign_dir, project_root, descriptors):
    candidates = scan_candidates(foreign_dir, project_root, descriptors)
    if not candidates:
        return {'outcome': {'kind': 'unrecognized'}, 'warnings': [_warning('unrecognized-format', f'No registered target matches the layout of "{foreign_dir}". Supply an explicit format with --format <id>.')]}
    if len(candidates) > 1:
        return {'outcome': {'kind': 'ambiguous', 'candidates': candidates}, 'warnings': [_warning('ambiguous-detection', f"Auto-detection matched {len(candidates)} targets: {', '.join(candidates)}. Neutralize 0 files until you supply --format <id> to resolve the ambiguity.")]}
    return {'outcome': {'kind': 'single', 'targetId': candidates[0], 'method': 'auto-detected'}, 'warnings': []}


def resolve_explicit_format(format_id, descriptors):
    ids = sorted((d['id'] for d in descriptors))
    return {'ok': True, 'targetId': format_id} if format_id in ids else {'ok': False, 'error': f'Unknown format identifier "{format_id}". Accepted identifiers: {", ".join(ids)}'}


def resolve_scope(scope_dirs, project_root, descriptors, target_id=None):
    out = {'attributed': [], 'unattributed': []}
    for directory in scope_dirs:
        for f in _walk(directory, project_root):
            candidates = [target_id] if target_id else match_file(f['relToRoot'], descriptors)
            if len(candidates) == 1:
                out['attributed'].append(dict(f, targetId=candidates[0]))
            else:
                out['unattributed'].append(f)
    return out


def unverified_target_warning(target_id):
    if target_id in IMPORT_STABLE_TARGETS:
        return None
    return _warning('unverified-target', f'Target "{target_id}" has not been import-round-trip verified by a conformance sample. Results may be incomplete — verify the neutralized output manually.', target=target_id)


def unverified_targets(descriptors):
    return sorted(d['id'] for d in descriptors if d['id'] not in IMPORT_STABLE_TARGETS)


def build_inverse_map(desc):
    inverse = {}
    for key in NEUTRAL_KEYS:
        rule = (desc.get('translations') or {}).get(key)
        if not rule or rule.get('drop') or not rule.get('toKey'):
            continue
        reverse = {}
        concrete_key = rule['toKey']
        collision = concrete_key in inverse
        for neutral, concrete in (rule.get('valueMap') or {}).items():
            value = js_string(concrete)
            if value in reverse:
                collision = True
            reverse[value] = neutral
        if collision:
            raise NonInjectiveValueMapError(desc['id'], key)
        inverse[concrete_key] = {'neutralKey': key}
        if reverse:
            inverse[concrete_key]['reverseValue'] = lambda value, reverse=reverse: reverse.get(js_string(value), value)
    return inverse


def apply_inverse_map(frontmatter, inverse):
    neutral, remaining = {}, {}
    for key, value in frontmatter.items():
        if key in inverse:
            entry = inverse[key]
            reverse = entry.get('reverseValue')
            neutral[entry['neutralKey']] = reverse(value) if reverse else value
        else:
            remaining[key] = value
    return {'neutral': neutral, 'remaining': remaining}


def strip_inject(frontmatter, desc, foreign_path):
    result, warnings = {}, []
    inject = desc['frontmatter'].get('inject', {})
    for key, value in frontmatter.items():
        if key not in inject:
            result[key] = value
        elif _json(value) != _json(inject[key]):
            warnings.append(_warning('injected-strip', f'Stripping injected key "{key}" (descriptor-injected default: {_json(inject[key])}, found: {_json(value)}). Injected keys are never recorded as overrides (FR-012).', foreign_path))
    return {'frontmatter': result, 'warnings': warnings}


def recover_overrides(remaining, target_id, foreign_path):
    return {'overrides': dict(remaining), 'warnings': [_warning('override-recovered', f'Key "{key}" has no neutral origin in target "{target_id}". Preserved under overrides.{target_id} with value {_json(value)}.', foreign_path, target_id) for key, value in remaining.items()]}


def extract_body(frontmatter, inline_body, body_field, foreign_path):
    fm, warnings, body = dict(frontmatter), [], inline_body
    if body_field:
        if body_field in fm:
            value = fm.pop(body_field)
            body = value if isinstance(value, str) else _json(value)
        else:
            body = ''
            warnings.append(_warning('malformed-frontmatter', f'Target body field "{body_field}" is declared by the descriptor but absent from the imported file "{foreign_path}". Setting neutral body to empty.', foreign_path))
    return {'frontmatter': fm, 'body': body, 'warnings': warnings}


def reconstruct_type(file_path, desc, foreign_path):
    directory = posixpath.dirname(file_path) or '.'
    slots = desc.get('slots') or {}
    for kind in ('command', 'skill'):
        if kind in slots and _dir_matches(directory, slots[kind]['dir']):
            return {'type': kind, 'warnings': [], 'defaultedChoices': []}
    agent = slots.get('agent')
    agent_dir = agent['dir'] if agent else desc['destinationDir']
    result = {'type': 'rule', 'warnings': [], 'defaultedChoices': []}
    if _dir_matches(directory, agent_dir):
        if agent and agent_dir != desc['destinationDir']:
            result['type'] = 'subagent'
        elif desc['capabilities']['subagent'] and desc['capabilities']['rule']:
            result['defaultedChoices'].append('artifact-type:rule (default over subagent; agent slot dir == destinationDir)')
            result['warnings'].append(_warning('defaulted-choice', f'File "{foreign_path}" is in the agent-slot directory that also serves as destinationDir. Artifact type is ambiguous (rule or subagent); defaulting to "rule". If this is a subagent, add type: subagent to the neutral frontmatter.', foreign_path, desc['id']))
    return result


def invert_args(body, token, foreign_path):
    result = {'body': body, 'warnings': [], 'defaultedChoices': []}
    if token and token in body:
        result['body'] = body.replace(token, '{{args}}')
        if token not in DEFAULT_PLACEHOLDERS:
            result['defaultedChoices'].append(f'placeholder:{token} → {{{{args}}}}')
            result['warnings'].append(_warning('defaulted-choice', f'Argument token "{token}" converted to canonical neutral placeholder "{{{{args}}}}". If a different placeholder was intended, edit the neutral body directly.', foreign_path))
    return result


def parse_format(content, format, foreign_path):
    if format == 'markdown':
        from .core import parse_artifact
        parsed = parse_artifact(content)
        return dict(parsed, body=re.sub(r'^\n', '', parsed['body']))
    if format == 'toml':
        try:
            return {'frontmatter': parse_toml(content), 'body': ''}
        except Exception as e:
            raise ValueError(f'invalid TOML in "{foreign_path}": {e}') from e
    if format == 'yaml':
        try:
            doc = load_yaml(content)
        except Exception as e:
            raise ValueError(f'invalid YAML in "{foreign_path}": {yaml_error_message(e, content)}') from e
        if doc is None:
            doc = {}
        if not isinstance(doc, dict):
            raise ValueError(f'YAML document in "{foreign_path}" must be a mapping')
        return {'frontmatter': doc, 'body': ''}
    raise ValueError(f'Unsupported format "{format}" for file "{foreign_path}"')


def primary_base_name(file_path, extension):
    name = Path(file_path).name
    return name[:-len(extension)] if name.endswith(extension) else posixpath.splitext(name)[0]


def consume_companion(file_path, base_name, desc, foreign_path):
    recovered, warnings = {}, []
    for rule in desc.get('companions') or []:
        companion = Path(file_path).parent / rule['nameTemplate'].replace('{name}', base_name)
        if not companion.exists():
            continue
        try:
            content = companion.read_bytes().decode('utf-8', errors='replace')
        except OSError as e:
            warnings.append(_warning('malformed-frontmatter', f'Could not read companion file "{companion}": {e}', foreign_path))
            continue
        try:
            parsed = json.loads(content)
        except ValueError:
            parsed = {'_companionContent': content}
        if isinstance(parsed, dict):
            recovered.update(parsed)
        elif isinstance(parsed, (list, str)):
            recovered.update({str(i): v for i, v in enumerate(parsed)})
    return {'recovered': recovered, 'warnings': warnings}


def reassociate_bundle(file_path, slot_dir, project_root, foreign_path):
    resources, warnings = [], []
    parent = Path(file_path).parent
    if str(parent) == slot_dir:
        return {'primaryAbs': file_path, 'resources': resources, 'warnings': warnings}
    try:
        entries = sorted(os.scandir(parent), key=lambda e: e.name.encode('utf-16-be', 'surrogatepass'))
    except OSError:
        entries = []
    for entry in entries:
        if not entry.is_file(follow_symlinks=False) or entry.path == str(file_path):
            continue
        try:
            resources.append({'relPath': entry.name, 'content': Path(entry.path).read_bytes().decode('utf-8', errors='replace')})
        except OSError as e:
            warnings.append(_warning('unresolved-reference', f'Bundle resource "{entry.name}" could not be read: {e}', foreign_path))
    names = {r['relPath'] for r in resources}
    for resource in resources:
        for href in re.findall(r'\[[^\]]*\]\(([^)]+)\)', resource['content']):
            if href.startswith(('http://', 'https://', '#')) or posixpath.basename(href) in names:
                continue
            if not href.startswith('http') and not posixpath.isabs(href):
                warnings.append(_warning('unresolved-reference', f'Intra-bundle reference "{href}" in resource "{resource["relPath"]}" cannot be resolved to a bundle resource.', foreign_path))
    return {'primaryAbs': file_path, 'resources': resources, 'warnings': warnings}


def neutralize(file_path, foreign_path, desc, project_root):
    warnings, choices, overrides = [], [], {}
    try:
        content = Path(file_path).read_bytes().decode('utf-8', errors='replace')
    except OSError as e:
        reason = f'Could not read file "{foreign_path}": {e}'
        return {'ok': False, 'dropped': {'reason': reason, 'warnings': [_warning('malformed-frontmatter', reason, foreign_path)]}}
    try:
        parsed = parse_format(content, desc['format'], foreign_path)
    except Exception as e:
        return {'ok': False, 'dropped': {'reason': str(e), 'warnings': [_warning('malformed-frontmatter', str(e), foreign_path)]}}
    extraction = extract_body(parsed['frontmatter'], parsed['body'], desc.get('bodyField'), foreign_path)
    fm, body = extraction['frontmatter'], extraction['body']
    warnings.extend(extraction['warnings'])
    base = primary_base_name(file_path, desc['extension'])
    stripped = strip_inject(fm, desc, foreign_path)
    fm = stripped['frontmatter']
    warnings.extend(stripped['warnings'])
    try:
        inverted = apply_inverse_map(fm, build_inverse_map(desc))
    except ValueError as e:
        reason = f'Cannot import from target "{desc["id"]}": {e}'
        return {'ok': False, 'dropped': {'reason': reason, 'warnings': [_warning('unrecognized-format', reason, foreign_path, desc['id'])]}}
    neutral = inverted['neutral']
    passthrough = desc['frontmatter']['passthrough']
    for key, value in inverted['remaining'].items():
        if passthrough == '*' or key in passthrough:
            neutral[key] = value
        else:
            recovered = recover_overrides({key: value}, desc['id'], foreign_path)
            overrides.update(recovered['overrides'])
            warnings.extend(recovered['warnings'])
    reconstructed = reconstruct_type(foreign_path, desc, foreign_path)
    kind = reconstructed['type']
    warnings.extend(reconstructed['warnings'])
    choices.extend(reconstructed['defaultedChoices'])
    deployment = {'rule': 'agent', 'subagent': 'agent', 'skill': 'skill', 'command': 'command'}[kind]
    if deployment == 'command':
        args = invert_args(body, desc['argumentToken'], foreign_path)
        body = args['body']
        warnings.extend(args['warnings'])
        choices.extend(args['defaultedChoices'])
    companion = consume_companion(file_path, base, desc, foreign_path)
    warnings.extend(companion['warnings'])
    for key, value in companion['recovered'].items():
        overrides.setdefault(key, value)
    slot = (desc.get('slots') or {}).get(deployment, {'dir': desc['destinationDir']})
    bundle = reassociate_bundle(file_path, f'{project_root}/{slot["dir"]}', project_root, foreign_path)
    warnings.extend(bundle['warnings'])
    artifact_id = f'{kind}s/{base}.md'
    if overrides:
        neutral['overrides'] = {desc['id']: overrides}
    artifact = {'id': artifact_id, 'type': kind, 'frontmatter': neutral, 'body': body, 'sourcePath': artifact_id}
    if bundle['resources']:
        artifact.update(resources=bundle['resources'], bundleRoot=f'{kind}s/{base}')
    return {'ok': True, 'result': {'artifact': artifact, 'overrides': overrides, 'defaultedChoices': choices, 'warnings': warnings}}


def validate_gate(artifact, foreign_path):
    from .core import validate_frontmatter
    result = validate_frontmatter(artifact['type'], artifact['frontmatter'])
    if result['ok']:
        return {'ok': True, 'artifact': dict(artifact, frontmatter=result['frontmatter'])}
    return {'ok': False, 'warnings': [_warning('schema-invalid', f'Reconstructed neutral artifact from "{foreign_path}" failed {artifact["type"]} frontmatter validation at field "{result["field"]}": {result["reason"]}. Dropping artifact (0 files written).', foreign_path)]}


def classify_path_value(value, field_name, artifact_path):
    if re.match(r'^[a-z][a-z0-9+.-]*://', value, re.I) or not (value.startswith(('./', '../', '/')) or '/' in value):
        return None
    if posixpath.isabs(value) or posixpath.normpath(value).startswith('..'):
        return _warning('portability', f'Field "{field_name}" contains an absolute or root-escaping path: "{value}".', artifact_path, remediation='Use a path relative to the project root instead of an absolute path, or reference a resource by name without a filesystem path.')
    if value.startswith('./') or '/' in value:
        return _warning('portability', f'Field "{field_name}" contains a project-relative path: "{value}". This path may not resolve after distribution to other targets.', artifact_path, remediation='Project-relative paths may not resolve after distribution to other targets or machines. Consider embedding the content inline or referencing a public URL if the resource must travel.')
    return None


def scan_portability_issues(frontmatter, body, artifact_path):
    warnings = []
    refs = [(key, value) for key, value in frontmatter.items() if isinstance(value, str)]
    for line in body.split('\n'):
        line = line.strip()
        refs.extend(('body', ref) for ref in re.findall(r'\[.*?\]\(([^)]+)\)', line))
        refs.extend(('body', ref) for ref in re.findall(r'''((?:\.\./|\./|/)[^\s"'`]+)''', line))
    for field, value in refs:
        warning = classify_path_value(value, field, artifact_path)
        if warning:
            warnings.append(warning)
    return warnings


def _normalize_content(content, desc):
    try:
        if desc['format'] == 'toml':
            # @iarna/toml retains key insertion order during parse/stringify.
            return _json(parse_toml(content))
        if desc['format'] == 'yaml':
            def sorted_values(value):
                if isinstance(value, dict):
                    return {key: sorted_values(value[key]) for key in sorted(value, key=lambda key: key.encode('utf-16-be', 'surrogatepass'))}
                if isinstance(value, list):
                    return [sorted_values(item) for item in value]
                return value
            return dump_yaml(sorted_values(load_yaml(content)))
    except Exception:
        return content
    return re.sub(r'[ \t]+$', '', content.strip().replace('\r\n', '\n'), flags=re.M)


def compute_diff_regions(original, redeployed):
    a, b = original.split('\n'), redeployed.split('\n')
    regions, oa, ob = [], [], []
    for i in range(max(len(a), len(b))):
        left, right = a[i] if i < len(a) else '', b[i] if i < len(b) else ''
        if left != right:
            oa.append(left)
            ob.append(right)
        elif oa:
            regions.append({'original': '\n'.join(oa), 'redeployed': '\n'.join(ob)})
            oa, ob = [], []
    if oa:
        regions.append({'original': '\n'.join(oa), 'redeployed': '\n'.join(ob)})
    return regions


def round_trip(artifact, desc, original_content, foreign_path):
    from .pipeline import run_pipeline
    warnings = []
    try:
        output = run_pipeline(artifact, desc, lossy_policy='warn')
        redeployed = output['content']
        warnings.extend(output['warnings'])
    except Exception as e:
        warnings.append(_warning('round-trip-mismatch', f'Round-trip re-deploy failed: {e}', foreign_path))
        return {'result': {'verified': False, 'fidelity': 'mismatch', 'diffRegions': [{'original': original_content, 'redeployed': ''}]}, 'warnings': warnings}
    if original_content == redeployed:
        return {'result': {'verified': True, 'fidelity': 'fully-invertible', 'diffRegions': []}, 'warnings': warnings}
    if _normalize_content(original_content, desc) == _normalize_content(redeployed, desc):
        return {'result': {'verified': False, 'fidelity': 'normalized-equivalent', 'diffRegions': []}, 'warnings': warnings}
    regions = compute_diff_regions(original_content, redeployed)
    warnings.append(_warning('round-trip-mismatch', f'Round-trip mismatch for "{foreign_path}": re-deployed output differs from original. {len(regions)} differing region(s) identified.', foreign_path))
    return {'result': {'verified': False, 'fidelity': 'mismatch', 'diffRegions': regions}, 'warnings': warnings}


def fidelity_level(result, has_overrides):
    return ('invertible-with-overrides' if has_overrides else 'fully-invertible') if result['verified'] else result['fidelity']


def _contained(target, project_root):
    real_root = os.path.realpath(project_root)
    absolute = os.path.abspath(os.path.join(real_root, target))
    existing, tail = absolute, []
    while not os.path.exists(existing):
        parent = os.path.dirname(existing)
        if parent == existing:
            break
        tail.insert(0, os.path.basename(existing))
        existing = parent
    resolved = os.path.join(os.path.realpath(existing), *tail)
    rel = os.path.relpath(resolved, real_root)
    if rel.startswith('..') or os.path.isabs(rel):
        raise ValueError(f'Refused: path escapes project root.\n  attempted: {target}\n  resolved:  {resolved}\n  root:      {real_root}')
    return resolved


def _atomic_write(target, content, project_root):
    destination = _contained(target, project_root)
    Path(destination).parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.' + Path(destination).name + '.tmp-', dir=Path(destination).parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='') as stream:
            stream.write(content)
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def write_source(artifact, source_root, project_root, options=None):
    from .pipeline import render_markdown
    options = options or {}
    destination = os.path.normpath(os.path.join(os.path.relpath(source_root, project_root), artifact['sourcePath']))
    result = {'written': False, 'destPath': destination, 'collision': False, 'warnings': []}
    try:
        absolute = _contained(destination, project_root)
    except ValueError as e:
        result['warnings'].append(_warning('malformed-frontmatter', f'Write refused: destination "{destination}" escapes project root. {e}', artifact['id']))
        return result
    exists = os.path.exists(absolute)
    if exists and not options.get('overwrite'):
        result.update(collision=True, preview=f'[skip] {destination} (collision — existing user-authored file)')
        result['warnings'].append(_warning('malformed-frontmatter', f'Collision: source file "{destination}" already exists and was authored by the user. Skipping write. Use --overwrite to replace it.', artifact['id']))
        return result
    content = render_markdown(artifact['frontmatter'], artifact['body'])
    result['preview'] = f'{"[overwrite]" if exists else "[create]"} {destination}'
    if options.get('dryRun'):
        return result
    _atomic_write(destination, content, project_root)
    for resource in artifact.get('resources') or []:
        resource_path = f'{posixpath.dirname(destination)}/{resource["relPath"]}'
        try:
            _atomic_write(resource_path, resource['content'], project_root)
        except Exception:
            result['warnings'].append(_warning('unresolved-reference', f'Bundle resource "{resource["relPath"]}" write refused: path escapes project root.', artifact['id']))
    result['written'] = True
    return result


def idempotency_check(artifact, desc, source_root, project_root):
    from .core import parse_artifact
    warnings, divergences = [], []
    source = artifact['sourcePath']
    written = os.path.join(source_root, source)
    if not os.path.exists(written):
        return {'idempotent': True, 'divergences': [], 'warnings': [_warning('malformed-frontmatter', f'Idempotency check skipped: written source file "{written}" not found.', source)]}
    try:
        raw = Path(written).read_bytes().decode('utf-8', errors='replace')
    except OSError as e:
        return {'idempotent': False, 'divergences': [{'sourcePath': source, 'reason': f'Could not read written source: {e}'}], 'warnings': []}
    try:
        fm = parse_artifact(raw)['frontmatter']
    except Exception as e:
        return {'idempotent': False, 'divergences': [{'sourcePath': source, 'reason': f'Could not parse written neutral source: {e}'}], 'warnings': []}
    before = artifact['frontmatter']
    for key in dict.fromkeys([*before, *fm]):
        v1, v2 = _json(before[key]) if key in before else 'undefined', _json(fm[key]) if key in fm else 'undefined'
        if v1 != v2:
            reason = f'key "{key}" changed: {v1} → {v2}'
            divergences.append({'sourcePath': source, 'reason': reason})
            warnings.append(_warning('round-trip-mismatch', f'Source-level idempotency divergence in "{source}": {reason}', source))
    return {'idempotent': not divergences, 'divergences': divergences, 'warnings': warnings}


def import_run(project_root, foreign_dir=None, format=None, source_dir=None, dry_run=False, overwrite=False, theme=None, registry=None):
    from .config import resolve_config
    from .registry import builtin_registry
    descriptors = registry if registry is not None else builtin_registry()
    project_root = os.path.abspath(project_root)
    cli = {'source': source_dir} if source_dir is not None else {}
    config = resolve_config(project_root, cli)
    config = config.get('effective', config)
    source_root = os.path.abspath(os.path.join(project_root, config['source']))
    foreign_dir = os.path.abspath(os.path.join(project_root, foreign_dir)) if foreign_dir else project_root
    warnings, overridden = [], None
    method = 'explicitly-specified' if format else 'auto-detected'
    def failed(target, reason, failure_warnings, resolved):
        return build_import_report([{'foreignPath': foreign_dir, 'targetId': target, 'outcome': {'ok': False, 'reason': reason}, 'warnings': failure_warnings}], {'resolvedFormat': resolved, 'resolutionMethod': method, 'dryRun': dry_run})
    if format:
        explicit = resolve_explicit_format(format, descriptors)
        if not explicit['ok']:
            return failed(format, explicit['error'], [_warning('unrecognized-format', explicit['error'])], format)
        target = explicit['targetId']
        candidates = scan_candidates(foreign_dir, project_root, descriptors)
        if len(candidates) >= 2:
            overridden = candidates
            warnings.append(_warning('ambiguous-detection', f'Foreign layout was ambiguous — matched {len(candidates)} targets: {", ".join(candidates)}. Ambiguity resolved by explicit --format "{target}".'))
    else:
        detection = detect_format(foreign_dir, project_root, descriptors)
        outcome = detection['outcome']
        warnings.extend(detection['warnings'])
        if outcome['kind'] == 'unrecognized':
            return failed('', 'Unrecognized layout — no matching target', warnings, 'unknown')
        if outcome['kind'] == 'ambiguous':
            return failed('', f'Ambiguous: {", ".join(outcome["candidates"])} — supply --format', warnings, 'ambiguous')
        target = outcome['targetId']
    desc = next(d for d in descriptors if d['id'] == target)
    parity = unverified_target_warning(target)
    scope = resolve_scope([foreign_dir], project_root, descriptors, target if format else None)
    files = []
    for f in scope['unattributed']:
        foreign = f['relToRoot']
        files.append({'foreignPath': foreign, 'targetId': '', 'outcome': {'ok': False, 'reason': f'File "{foreign}" could not be attributed to exactly 1 target within the run scope.'}, 'warnings': [_warning('unrecognized-format', f'File "{foreign}" matches 0 or 2+ targets — skipped with a warning (0 silent skips).', foreign)]})
    for f in scope['attributed']:
        if f['targetId'] != target:
            continue
        foreign = f['relToRoot']
        file_warnings = ([parity] if parity else []) + warnings[:]
        neutral = neutralize(f['abs'], foreign, desc, project_root)
        if not neutral['ok']:
            files.append({'foreignPath': foreign, 'targetId': target, 'outcome': {'ok': False, 'reason': neutral['dropped']['reason']}, 'warnings': file_warnings + neutral['dropped']['warnings']})
            continue
        recovered = neutral['result']
        file_warnings.extend(recovered['warnings'])
        gated = validate_gate(recovered['artifact'], foreign)
        if not gated['ok']:
            files.append({'foreignPath': foreign, 'targetId': target, 'outcome': {'ok': False, 'reason': 'Neutral frontmatter validation failed'}, 'warnings': file_warnings + gated['warnings']})
            continue
        artifact = gated['artifact']
        file_warnings.extend(scan_portability_issues(artifact['frontmatter'], artifact['body'], foreign))
        try:
            original = Path(f['abs']).read_bytes().decode('utf-8', errors='replace')
        except OSError:
            original = ''
        rt = round_trip(artifact, desc, original, foreign)
        file_warnings.extend(rt['warnings'])
        written = write_source(artifact, source_root, project_root, {'dryRun': dry_run, 'overwrite': overwrite})
        file_warnings.extend(written['warnings'])
        if written['written']:
            file_warnings.extend(idempotency_check(artifact, desc, source_root, project_root)['warnings'])
        files.append({'foreignPath': foreign, 'targetId': target, 'outcome': {'ok': True, 'artifactId': artifact['id'], 'type': artifact['type'], 'fidelity': fidelity_level(rt['result'], bool(recovered['overrides']))}, 'roundTrip': rt['result'], 'warnings': file_warnings})
    return build_import_report(files, {'resolvedFormat': target, 'resolutionMethod': method, 'dryRun': dry_run, 'overriddenCandidates': overridden}, theme)
