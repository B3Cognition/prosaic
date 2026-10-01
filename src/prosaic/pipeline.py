"""Pure artifact transformations and structured execution resolution."""
import math
import re
import datetime
from pathlib import Path

from .compat import dump_yaml, js_string
from .registry import NEUTRAL_KEYS, UnknownTargetError, get_target, slot_for

PIPELINE_STAGES = ('path-rewrite', 'name-rewrite', 'argument-rewrite', 'neutral-translate',
                   'neutral-strip', 'frontmatter-rewrite', 'format-conversion', 'deployment-route')
DEFAULT_PLACEHOLDERS = ('{{args}}', '{{ args }}', '$ARGUMENTS', '{{ARGS}}')
_JS_SPACE = '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'


class LossyTransformError(ValueError):
    pass


def canonical_order(fm):
    preferred = ('name', 'description', 'title', 'model', 'color', 'tools')
    keys = [k for k in preferred if k in fm]
    keys += sorted((k for k in fm if k not in preferred), key=lambda k: k.encode('utf-16-be', 'surrogatepass'))
    return {k: fm[k] for k in keys}


def resolve_deployment_type(artifact):
    execution = artifact['frontmatter'].get('execution')
    if isinstance(execution, str) and execution in ('command', 'skill', 'agent'):
        return execution
    return {'command': 'command', 'skill': 'skill', 'subagent': 'agent', 'rule': 'agent'}[artifact['type']]


def compute_name(artifact, rule):
    base = artifact['frontmatter'].get('name') if rule.get('from') == 'name' else None
    if isinstance(base, str) and base.strip(_JS_SPACE):
        base = base.strip(_JS_SPACE)
    elif artifact.get('bundleRoot'):
        base = artifact['bundleRoot'].split('/')[-1]
    else:
        base = re.sub(r'\.md$', '', artifact['sourcePath'].split('/')[-1], flags=re.I)
    if rule.get('casing') in ('kebab', 'snake'):
        words = re.split('[' + _JS_SPACE + r'._\-/]+', re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', base))
        base = ('-' if rule['casing'] == 'kebab' else '_').join(w.lower() for w in words if w)
    return rule.get('prefix', '') + base + rule.get('suffix', '')


def translate_neutral(fm, descriptor):
    concrete, dropped = {}, []
    for key in NEUTRAL_KEYS:
        if key not in fm:
            continue
        rule = descriptor.get('translations', {}).get(key)
        if not rule or rule.get('drop') or not rule.get('toKey'):
            if key != 'execution':
                dropped.append(key)
            continue
        value = fm[key]
        if isinstance(value, str) and value in rule.get('valueMap', {}):
            value = rule['valueMap'][value]
        concrete[rule['toKey']] = value
    return {'concrete': concrete, 'dropped': dropped}


def apply_overrides(concrete, fm, descriptor):
    out = dict(concrete)
    overrides = fm.get('overrides')
    if isinstance(overrides, dict):
        target = overrides.get(descriptor['id'])
        if isinstance(target, dict):
            out.update(target)
        elif isinstance(target, list):
            out.update({str(i): v for i, v in enumerate(target)})
    return out


def rewrite_references(text, resources, artifact_id, target_id):
    def normalize(target):
        return re.sub(r'^\./', '', target.split('#')[0].split('?')[0])
    known = {normalize(r['relPath']) for r in resources}
    warnings = []
    for match in re.finditer(r'(!?\[[^\]]*\]\()([^)' + _JS_SPACE + r']+)(\))', text):
        target = match[2]
        if re.match(r'^[a-z][a-z0-9+.-]*:', target, re.I) or target.startswith(('/', '#')):
            continue
        if normalize(target) and normalize(target) not in known:
            warnings.append({'kind': 'unresolved-reference', 'artifact': artifact_id, 'target': target_id,
                             'message': f'internal reference "{target}" does not resolve to a bundle resource'})
    return {'text': text, 'warnings': warnings}


def render_markdown(fm, body):
    body = body.rstrip(_JS_SPACE) + '\n'
    return ('---\n' + dump_yaml(canonical_order(fm)) + '---\n\n' if fm else '') + body


def _coerce(value):
    if callable(getattr(value, 'toml_enumerable', None)):
        return value.toml_enumerable()
    # JS Date has no enumerable properties and is coerced to an empty table.
    if isinstance(value, (datetime.date, datetime.datetime)):
        return {}
    if isinstance(value, dict):
        return {k: _coerce(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [_coerce(v) for v in value if v is not None]
    return value


def _toml_type(v):
    if isinstance(v, bool): return 'boolean'
    if isinstance(v, str): return 'string'
    if isinstance(v, int): return 'integer'
    if isinstance(v, float):
        return 'integer' if math.isfinite(v) and v.is_integer() and not (v == 0 and math.copysign(1, v) < 0) else 'float'
    if isinstance(v, list): return 'array'
    return 'table'


def _escape(v):
    for old, new in (('\\', '\\\\'), ('\b', '\\b'), ('\t', '\\t'), ('\n', '\\n'), ('\f', '\\f'), ('\r', '\\r')):
        v = v.replace(old, new)
    return re.sub(r'[\x00-\x1f\x7f]', lambda m: '\\u' + format(ord(m[0]), '04x'), v, count=1)


def _basic(v):
    return '"' + _escape(v).replace('"', '\\"') + '"'


def _toml_key(k):
    return k if re.fullmatch(r'[-A-Za-z0-9_]+', k) else _basic(k)


def _integer(v):
    return re.sub(r'\B(?=(\d{3})+(?!\d))', '_', js_string(v))


def _inline(v, multiline=False, forced=None):
    typ = forced or _toml_type(v)
    if typ == 'string':
        if forced == 'string':
            return _basic(v)
        if multiline and '\n' in v:
            escaped = '\n'.join(re.sub(r'"(?="")', r'\\"', _escape(line)) for line in v.split('\n'))
            if escaped.endswith('"'): escaped += '\\\n'
            return '"""\n' + escaped + '"""'
        if not re.search(r"[\b\t\n\f\r']", v) and '"' in v:
            return "'" + v + "'"
        return _basic(v)
    if typ == 'integer': return _integer(v)
    if typ == 'float':
        if math.isnan(v): return 'nan'
        if math.isinf(v): return 'inf' if v > 0 else '-inf'
        if v == 0 and math.copysign(1, v) < 0: return '-0.0'
        parts = js_string(v).split('.')
        return _integer(parts[0]) + '.' + (parts[1] if len(parts) > 1 else '0')
    if typ == 'boolean': return 'true' if v else 'false'
    if typ == 'array':
        types = {_toml_type(i) for i in v}
        if len(types) > 1 and not types <= {'integer', 'float'}:
            raise ValueError("Array values can't have mixed types")
        forced_type = 'float' if types == {'integer', 'float'} else next(iter(types), None)
        values = [_inline(i, forced=forced_type) for i in v]
        if len(', '.join(values).encode('utf-16-le', 'surrogatepass')) // 2 > 60 or '\n' in ','.join(values):
            return '[\n  ' + ',\n  '.join(values) + '\n]'
        return '[ ' + ', '.join(values) + (' ' if values else '') + ']'
    if typ == 'table':
        values = [_toml_key(k) + ' = ' + _inline(value) for k, value in v.items()]
        return '{ ' + ', '.join(values) + (' ' if values else '') + '}'
    raise ValueError('Can only stringify objects, not ' + typ)


def _is_inline(v):
    if isinstance(v, dict): return not v
    if isinstance(v, list): return not v or not isinstance(v[0], dict)
    return True


def _toml_object(obj, prefix='', indent=''):
    inline = [k for k in obj if _is_inline(obj[k])]
    result = [indent + _toml_key(k) + ' = ' + _inline(obj[k], True) for k in inline]
    if result: result.append('')
    complex_indent = indent + '  ' if prefix and inline else ''
    for k, v in obj.items():
        if k in inline: continue
        full_key = prefix + _toml_key(k)
        if isinstance(v, list):
            if any(not isinstance(i, dict) for i in v):
                raise ValueError("Array values can't have mixed types")
            result.append('\n'.join(complex_indent + '[[' + full_key + ']]\n' + _toml_object(i, full_key + '.', complex_indent) for i in v))
        else:
            heading = complex_indent + '[' + full_key + ']\n' if any(_is_inline(i) for i in v.values()) else ''
            result.append(heading + _toml_object(v, full_key + '.', complex_indent))
    return '\n'.join(result)


def render_toml_file(fm, body, body_field='prompt'):
    return _toml_object(_coerce(canonical_order({**fm, body_field: body.rstrip(_JS_SPACE) + '\n'})))


def render_yaml_file(fm, body, body_field='prompt'):
    return dump_yaml(canonical_order({**fm, body_field: body.rstrip(_JS_SPACE) + '\n'}))


def run_pipeline(artifact, descriptor, lossy_policy='warn', trace=None):
    deployment = resolve_deployment_type(artifact)
    fm = dict(artifact['frontmatter'])
    body = artifact['body']
    resources = [dict(r) for r in artifact.get('resources', [])]
    warnings = []
    warnings += rewrite_references(body, resources, artifact['id'], descriptor['id'])['warnings']
    for resource in resources:
        warnings += rewrite_references(resource['content'], resources, artifact['id'], descriptor['id'])['warnings']
    slot = slot_for(descriptor, deployment)
    name = compute_name(artifact, {**descriptor['naming'], **slot.get('naming', {})})
    if artifact['type'] == 'command' or deployment == 'command':
        for ph in descriptor.get('argumentPlaceholders', DEFAULT_PLACEHOLDERS):
            body = body.replace(ph, descriptor['argumentToken'])
    translation = translate_neutral(fm, descriptor)
    concrete = apply_overrides(translation['concrete'], fm, descriptor)
    dropped = translation['dropped']
    if dropped and lossy_policy == 'error':
        raise LossyTransformError(f'Artifact "{artifact["id"]}" declares intent [{", ".join(dropped)}] that target "{descriptor["id"]}" cannot represent (lossyPolicy=error)')
    warnings += [{'kind': 'lossy-intent', 'artifact': artifact['id'], 'target': descriptor['id'],
                  'message': f'dropped non-representable intent "{key}"'} for key in dropped]
    for key in (*NEUTRAL_KEYS, 'overrides', 'type'): fm.pop(key, None)
    rules = descriptor['frontmatter']
    passthrough = fm if rules['passthrough'] == '*' else rules['passthrough']
    fm = {k: fm[k] for k in passthrough if k in fm and k not in rules['strip']}
    fm.update(rules['inject'])
    fm.update(concrete)
    body_field = descriptor.get('bodyField', 'prompt')
    fmt = descriptor['format']
    content = render_markdown(fm, body) if fmt == 'markdown' else (render_toml_file(fm, body, body_field) if fmt == 'toml' else render_yaml_file(fm, body, body_field))
    route = {'dir': descriptor['destinationDir'], 'extension': descriptor['extension']} if artifact['type'] == 'rule' else slot
    directory = route['dir'].rstrip('/')
    path = (directory + '/' if directory else '') + name + route.get('extension', descriptor['extension'])
    directory = '/'.join(path.split('/')[:-1])
    def expand(template): return template.replace('{name}', name).replace('{body}', body)
    companions = [{'path': (directory.rstrip('/') + '/' if directory else '') + expand(r['nameTemplate']),
                   'content': expand(r['content'])} for r in descriptor.get('companions', [])]
    relocated = [{'path': (directory + '/' if directory else '') + r['relPath'], 'content': r['content']} for r in resources]
    if trace is not None: trace.extend(PIPELINE_STAGES)
    return {'targetId': descriptor['id'], 'path': path, 'content': content,
            'companions': companions, 'resources': relocated, 'warnings': warnings}


def resolve_execution(artifact, descriptor):
    translation = translate_neutral(artifact['frontmatter'], descriptor)
    concrete = apply_overrides(translation['concrete'], artifact['frontmatter'], descriptor)
    result = {'artifactId': artifact['id'], 'targetId': descriptor['id']}
    for field, key in (('model', 'capability'), ('reasoningEffort', 'effort'), ('tools', 'tools')):
        to_key = descriptor.get('translations', {}).get(key, {}).get('toKey')
        result[field] = ({'status': 'resolved', 'value': concrete[to_key]}
                         if key not in translation['dropped'] and to_key and to_key in concrete else {'status': 'unresolved'})
    result['executionType'] = {'status': 'resolved', 'value': resolve_deployment_type(artifact)}
    return result


def resolve_execution_data(project_root, artifact_id, target_id, cli=None, registry=None):
    try:
        descriptor = registry.get(target_id) if registry is not None else get_target(target_id)
        from .config import resolve_config
        from .core import discover
        config = resolve_config(project_root, cli or {})
        config = config.get('effective', config)
        discovery = discover(str((Path(project_root) / config['source']).resolve()), str(project_root))
        artifact = next((a for a in discovery['artifacts'] if a['id'] == artifact_id), None)
        if artifact is None:
            return {'ok': False, 'errorKind': 'artifact-not-found', 'artifactId': artifact_id,
                    'message': f'Unknown artifact: "{artifact_id}" was not found by discovery'}
        return {'ok': True, 'data': resolve_execution(artifact, descriptor)}
    except UnknownTargetError as e:
        return {'ok': False, 'errorKind': 'unregistered-target', 'targetId': e.targetId, 'message': str(e)}
    except Exception as e:
        return {'ok': False, 'errorKind': 'internal', 'message': str(e)}
