"""Bundled target descriptors and registry queries."""
from copy import deepcopy
from .compat import js_sort_key

NEUTRAL_KEYS = ('execution', 'capability', 'effort', 'tools', 'invocation', 'visibility', 'color')
REGISTRY_VERSION = {'version': '1.0.0', 'rulerParityRef': 'ruler@0.4.0', 'parityBaseline': 35}


class UnknownTargetError(ValueError):
    def __init__(self, target_id):
        self.targetId = target_id
        super().__init__(f'Unknown target: "{target_id}" is not in the target registry')


def _adapter(id, label, directory, *, command=False, **extra):
    descriptor = dict(id=id, label=label, destinationDir=directory, format='markdown',
                      extension='.md', argumentToken='$ARGUMENTS',
                      frontmatter=dict(strip=[], passthrough='*', inject={}),
                      capabilities=dict(rule=True, skill=False, subagent=False, command=command),
                      naming={'from': 'filename', 'casing': 'original'}, translations={})
    descriptor.update(extra)
    return descriptor


def _command_slot(directory, extension='.md'):
    return {'command': {'dir': directory, 'extension': extension}}


_DESCRIPTORS = [
    _adapter('claude-code', 'Claude Code', '.claude', command=True,
             capabilities=dict(rule=True, skill=True, subagent=True, command=True),
             slots={'command': {'dir': '.claude/commands', 'extension': '.md'},
                    'skill': {'dir': '.claude/skills', 'extension': '.md'},
                    'agent': {'dir': '.claude/agents', 'extension': '.md'}},
             translations={'tools': {'toKey': 'tools'}, 'color': {'toKey': 'color'}}),
    _adapter('cursor', 'Cursor', '.cursor/rules', command=True, extension='.mdc', slots=_command_slot('.cursor/commands')),
    _adapter('windsurf', 'Windsurf', '.windsurf/rules', command=True, slots=_command_slot('.windsurf/workflows')),
    _adapter('cline', 'Cline', '.clinerules'),
    _adapter('roo-code', 'Roo Code', '.roo/rules'),
    _adapter('kilo-code', 'Kilo Code', '.kilocode/rules', command=True, slots=_command_slot('.kilocode/workflows')),
    _adapter('continue', 'Continue', '.continue/rules'),
    _adapter('zed', 'Zed', '.rules'),
    _adapter('aider', 'Aider', '.aider/rules'),
    _adapter('amazon-q', 'Amazon Q Developer', '.amazonq/rules'),
    _adapter('codex-cli', 'OpenAI Codex CLI', '.codex/prompts', format='toml', extension='.toml', bodyField='prompt', capabilities=dict(rule=False, skill=False, subagent=False, command=True)),
    _adapter('gemini-cli', 'Gemini CLI', '.gemini/commands', format='toml', extension='.toml', bodyField='prompt', argumentToken='{{args}}', capabilities=dict(rule=False, skill=False, subagent=False, command=True)),
    _adapter('goose', 'Goose', '.goose/recipes', command=True, format='yaml', extension='.yaml', bodyField='instructions', argumentToken='{{args}}', frontmatter=dict(strip=[], passthrough='*', inject={'version': '1.0.0'})),
    _adapter('github-copilot', 'GitHub Copilot', '.github/instructions', command=True, extension='.instructions.md', slots=_command_slot('.github/prompts', '.prompt.md'), frontmatter=dict(strip=[], passthrough='*', inject={'applyTo': '**'}), companions=[{'nameTemplate': '{name}.metadata.json', 'content': '{\n  "source": "prosaic",\n  "name": "{name}"\n}\n'}]),
]
_LONGTAIL = [
    ('agents-md', 'AGENTS.md (generic)', '.'), ('openhands', 'OpenHands', '.openhands/microagents'),
    ('crush', 'Crush', '.crush/rules'), ('qwen-code', 'Qwen Code', '.qwen/rules'),
    ('opencode', 'OpenCode', '.opencode/rules'), ('kiro', 'Kiro', '.kiro/steering'),
    ('antigravity', 'Antigravity', '.antigravity/rules'), ('cody', 'Sourcegraph Cody', '.sourcegraph/rules'),
    ('tabnine', 'Tabnine', '.tabnine/rules'), ('pearai', 'PearAI', '.pearai/rules'),
    ('void', 'Void', '.void/rules'), ('augmentcode', 'Augment Code', '.augment/rules'),
    ('trae', 'Trae', '.trae/rules'), ('jules', 'Jules', '.jules/rules'),
    ('junie', 'Junie', '.junie/guidelines'), ('warp', 'Warp', '.warp/rules'),
    ('firebase-studio', 'Firebase Studio', '.idx/airules'), ('gemini-code-assist', 'Gemini Code Assist', '.gemini/rules'),
    ('bolt', 'Bolt', '.bolt/rules'), ('replit', 'Replit Agent', '.replit/rules'),
    ('aide', 'Aide', '.aide/rules'), ('melty', 'Melty', '.melty/rules'),
    ('windsurf-next', 'Windsurf Next', '.windsurf-next/rules'), ('devin', 'Devin', '.devin/rules'),
    ('sweep', 'Sweep', '.sweep/rules'), ('q-cli', 'Q CLI', '.q/rules'),
]
for _id, _label, _dir in _LONGTAIL:
    _commands = {'qwen-code': '.qwen/commands', 'opencode': '.opencode/command', 'q-cli': '.q/commands'}
    _DESCRIPTORS.append(_adapter(_id, _label, _dir, command=_id in _commands,
                                **({'slots': _command_slot(_commands[_id])} if _id in _commands else {})))


def builtin_registry():
    return deepcopy(sorted(_DESCRIPTORS, key=lambda d: d['id']))


def get_target(target_id):
    for descriptor in _DESCRIPTORS:
        if descriptor['id'] == target_id:
            return deepcopy(descriptor)
    raise UnknownTargetError(target_id)


def runtime_capability_for(descriptor):
    declared = descriptor.get('runtimeCapability') or {}
    return {key: declared[key] if declared.get(key) is not None else 'unknown'
            for key in ('model', 'reasoningEffort', 'tools', 'executionType')}


def supports(descriptor, artifact_type):
    return descriptor['capabilities'].get(artifact_type) is True


def slot_for(descriptor, deployment_type):
    return (descriptor.get('slots') or {}).get(deployment_type) or {'dir': descriptor['destinationDir'], 'extension': descriptor['extension']}


class _DescriptorError(ValueError):
    def __init__(self, field, message):
        self.field, self.message = field, message
        super().__init__(f'descriptor field "{field or "(root)"}": {message}')


_MISSING = object()


def _received(value):
    if value is _MISSING: return 'undefined'
    if value is None: return 'null'
    if isinstance(value, bool): return 'boolean'
    if isinstance(value, (int, float)): return 'number'
    if isinstance(value, str): return 'string'
    if isinstance(value, list): return 'array'
    return 'object'


def _expect(value, kind, field, minimum=False):
    valid = {'string': isinstance(value, str), 'object': isinstance(value, dict),
             'array': isinstance(value, list), 'boolean': isinstance(value, bool)}[kind]
    if not valid:
        raise _DescriptorError(field, 'Required' if value is _MISSING else f'Expected {kind}, received {_received(value)}')
    if minimum and not value:
        raise _DescriptorError(field, 'String must contain at least 1 character(s)')
    return deepcopy(value)


def _enum(value, choices, field):
    if not isinstance(value, str):
        raise _DescriptorError(field, 'Required' if value is _MISSING else 'Expected ' + ' | '.join(repr(c) for c in choices) + ', received ' + _received(value))
    if value not in choices:
        raise _DescriptorError(field, 'Invalid enum value. Expected ' + ' | '.join(repr(c) for c in choices) + ', received ' + repr(value))
    return value


def _naming(raw, field, partial=False):
    raw = _expect(raw, 'object', field)
    out = {}
    for key, choices, default in [('from', ['name', 'filename'], 'filename'), ('casing', ['kebab', 'snake', 'original'], 'original')]:
        if key in raw or not partial:
            out[key] = _enum(raw.get(key, default), choices, field + '.' + key)
    for key in ('prefix', 'suffix'):
        if key in raw: out[key] = _expect(raw[key], 'string', field + '.' + key)
    return out


def parse_descriptor(raw):
    """Apply descriptor defaults and strip unknown schema keys, as Zod does."""
    raw = _expect(raw, 'object', '')
    out = {}
    for key in ('id', 'label', 'destinationDir', 'format', 'extension', 'argumentToken'):
        if key == 'label' and key not in raw: continue
        value = raw.get(key, _MISSING)
        out[key] = (_enum(value, ['markdown', 'toml', 'yaml'], key) if key == 'format'
                    else _expect(value, 'string', key, minimum=key != 'label'))
    rules = _expect(raw.get('frontmatter', _MISSING), 'object', 'frontmatter')
    strip = _expect(rules.get('strip', []), 'array', 'frontmatter.strip')
    strip = [_expect(v, 'string', f'frontmatter.strip.{i}') for i, v in enumerate(strip)]
    passthrough = rules.get('passthrough', '*')
    if passthrough != '*':
        if not isinstance(passthrough, list) or any(not isinstance(v, str) for v in passthrough):
            raise _DescriptorError('frontmatter.passthrough', 'Invalid input')
        passthrough = list(passthrough)
    out['frontmatter'] = {'strip': strip, 'passthrough': passthrough,
                          'inject': _expect(rules.get('inject', {}), 'object', 'frontmatter.inject')}
    caps = _expect(raw.get('capabilities', _MISSING), 'object', 'capabilities')
    out['capabilities'] = {k: _expect(caps.get(k, _MISSING), 'boolean', 'capabilities.' + k) for k in ('rule', 'skill', 'subagent', 'command')}
    out['naming'] = _naming(raw.get('naming', {'from': 'filename', 'casing': 'original'}), 'naming')
    if 'slots' in raw:
        slots = _expect(raw['slots'], 'object', 'slots')
        out['slots'] = {}
        for key in ('command', 'skill', 'agent'):
            if key not in slots: continue
            slot = _expect(slots[key], 'object', 'slots.' + key)
            parsed = {'dir': _expect(slot.get('dir', _MISSING), 'string', 'slots.' + key + '.dir')}
            if 'extension' in slot: parsed['extension'] = _expect(slot['extension'], 'string', 'slots.' + key + '.extension')
            if 'naming' in slot: parsed['naming'] = _naming(slot['naming'], 'slots.' + key + '.naming', True)
            out['slots'][key] = parsed
    translations = _expect(raw.get('translations', {}), 'object', 'translations')
    out['translations'] = {}
    for key in NEUTRAL_KEYS:
        if key not in translations: continue
        rule = _expect(translations[key], 'object', 'translations.' + key)
        parsed = {}
        for prop, kind in [('toKey', 'string'), ('valueMap', 'object'), ('drop', 'boolean')]:
            if prop in rule: parsed[prop] = _expect(rule[prop], kind, 'translations.' + key + '.' + prop)
        out['translations'][key] = parsed
    if 'companions' in raw:
        companions = _expect(raw['companions'], 'array', 'companions')
        out['companions'] = []
        for i, value in enumerate(companions):
            value = _expect(value, 'object', f'companions.{i}')
            out['companions'].append({k: _expect(value.get(k, _MISSING), 'string', f'companions.{i}.{k}') for k in ('nameTemplate', 'content')})
    if 'bodyField' in raw: out['bodyField'] = _expect(raw['bodyField'], 'string', 'bodyField')
    if 'argumentPlaceholders' in raw:
        values = _expect(raw['argumentPlaceholders'], 'array', 'argumentPlaceholders')
        out['argumentPlaceholders'] = [_expect(v, 'string', f'argumentPlaceholders.{i}') for i, v in enumerate(values)]
    if 'runtimeCapability' in raw:
        caps = _expect(raw['runtimeCapability'], 'object', 'runtimeCapability')
        out['runtimeCapability'] = {k: _enum(caps[k], ['accepts', 'rejects', 'unknown'], 'runtimeCapability.' + k)
                                    for k in ('model', 'reasoningEffort', 'tools', 'executionType') if k in caps}
    return out


def validate_descriptor(raw):
    try:
        parse_descriptor(raw)
        return {'ok': True}
    except _DescriptorError as e:
        return {'ok': False, 'error': str(e)}


class StaticRegistrySource:
    def __init__(self, descriptors, version=None):
        self._descriptors = descriptors
        self._version = version or REGISTRY_VERSION

    def descriptors(self): return self._descriptors
    def version(self): return deepcopy(self._version)


class BuiltinRegistrySource(StaticRegistrySource):
    def __init__(self): super().__init__(deepcopy(_DESCRIPTORS))


class Registry:
    def __init__(self, source=None):
        self.source = source or BuiltinRegistrySource()
        self.by_id = {}
        for descriptor in self.source.descriptors():
            if descriptor['id'] in self.by_id:
                raise ValueError('Duplicate target id in registry: ' + descriptor['id'])
            self.by_id[descriptor['id']] = descriptor

    def version(self): return self.source.version()
    def has(self, id): return id in self.by_id
    def get(self, id):
        if id not in self.by_id: raise UnknownTargetError(id)
        return self.by_id[id]
    def all(self): return sorted(self.by_id.values(), key=lambda d: js_sort_key(d['id']))
    def ids(self): return [d['id'] for d in self.all()]
    def supports(self, id, type): return supports(self.get(id), type)
    def runtime_capability(self, id): return runtime_capability_for(self.get(id))
    def resolve_selection(self, selection): return self.all() if selection == 'all' else [self.get(id) for id in selection]


def register_target(existing, descriptor, version=None):
    validation = validate_descriptor(descriptor)
    if not validation['ok']:
        raise ValueError('Cannot register target: ' + validation['error'])
    parsed = parse_descriptor(descriptor)
    if any(d['id'] == parsed['id'] for d in existing):
        raise ValueError(f'Cannot register target: id "{parsed["id"]}" already exists')
    return Registry(StaticRegistrySource([*existing, parsed], version))


def load_catalog_or_fallback(loader):
    try:
        raw = loader()
        if not isinstance(raw, dict) or not isinstance(raw.get('descriptors'), list): raise ValueError()
        if 'version' in raw and not isinstance(raw['version'], str): raise ValueError()
        descriptors = [parse_descriptor(d) for d in raw['descriptors']]
        version = {**REGISTRY_VERSION, **({'version': raw['version']} if raw.get('version') else {})}
        return {'descriptors': descriptors, 'version': version, 'usedFallback': False}
    except Exception:
        return {'descriptors': deepcopy(_DESCRIPTORS), 'version': deepcopy(REGISTRY_VERSION), 'usedFallback': True}


class CatalogRegistrySource:
    def __init__(self, loader): self.result = load_catalog_or_fallback(loader)
    @property
    def usedFallback(self): return self.result['usedFallback']
    def descriptors(self): return self.result['descriptors']
    def version(self): return self.result['version']
