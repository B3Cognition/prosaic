"""Compatibility primitives for the frozen JavaScript serialization contracts."""
from __future__ import annotations

import copy
import base64
import datetime
from decimal import Decimal
import math
import re

import yaml
from pyuca import Collator


class Loader(yaml.SafeLoader):
    """js-yaml's default schema uses YAML 1.2 booleans, not YAML 1.1 yes/on."""


Loader.yaml_implicit_resolvers = copy.deepcopy(yaml.SafeLoader.yaml_implicit_resolvers)
for ch, resolvers in list(Loader.yaml_implicit_resolvers.items()):
    Loader.yaml_implicit_resolvers[ch] = [
        (tag, regex) for tag, regex in resolvers
        if tag not in {'tag:yaml.org,2002:bool', 'tag:yaml.org,2002:int', 'tag:yaml.org,2002:float'}
    ]
Loader.add_implicit_resolver('tag:yaml.org,2002:bool', re.compile(r'^(?:true|True|TRUE|false|False|FALSE)$'), list('tTfF'))


class _NumberPattern:
    def __init__(self, pattern, integer=False):
        self.pattern = re.compile(pattern)
        self.integer = integer

    def match(self, text):
        match = self.pattern.match(text)
        if not match:
            return None
        if text.lower() in ('.nan', '.inf', '+.inf', '-.inf'):
            return match
        try:
            if self.integer:
                unsigned = text.lstrip('+-')
                value = int(unsigned, 0 if unsigned.startswith(('0b', '0x', '0o')) else 10)
                number = float(value)
            else:
                number = float(text)
            return match if math.isfinite(number) else None
        except (ValueError, OverflowError):
            return None


Loader.add_implicit_resolver('tag:yaml.org,2002:int', _NumberPattern(r'^[-+]?(?:0b[01]+|0o[0-7]+|0x[0-9a-fA-F]+|[0-9]+)$', True), list('-+0123456789'))
Loader.add_implicit_resolver('tag:yaml.org,2002:float', _NumberPattern(r'^(?:[-+]?[0-9]+(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$'), list('-+0123456789.'))


def _integer(loader, node):
    pattern = next(pattern for tag,pattern in Loader.yaml_implicit_resolvers['0'] if tag == 'tag:yaml.org,2002:int')
    if not pattern.match(node.value):
        raise yaml.constructor.ConstructorError(None,None,'cannot resolve a node with !<tag:yaml.org,2002:int> explicit tag',node.end_mark)
    text = loader.construct_scalar(node).replace('_', '')
    sign = -1 if text.startswith('-') else 1
    text = text.lstrip('+-')
    value = sign * int(text, 0 if text.lower().startswith(('0b', '0o', '0x')) else 10)
    if sign < 0 and value == 0 and text != '0':
        return -0.0
    if abs(value) > 2**53:
        try:
            return int(float(value))
        except OverflowError:
            return math.inf * sign
    return value


def _mapping(loader, node, deep=False):
    # js-yaml rejects duplicate explicit keys, but allows merge overrides.
    explicit = set()
    for key_node, _ in node.value:
        if key_node.tag == 'tag:yaml.org,2002:merge':
            continue
        key = js_string(loader.construct_object(key_node, deep=deep))
        if key in explicit:
            raise yaml.constructor.ConstructorError(None, None, 'duplicated mapping key', key_node.start_mark)
        explicit.add(key)
    loader.flatten_mapping(node)
    result = {}
    for key_node, value_node in node.value:
        key = js_string(loader.construct_object(key_node, deep=deep))
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


Loader.add_constructor('tag:yaml.org,2002:int', _integer)
Loader.add_constructor('tag:yaml.org,2002:map', _mapping)


def _construct_float(loader,node):
    pattern=next(pattern for tag,pattern in Loader.yaml_implicit_resolvers['0'] if tag=='tag:yaml.org,2002:float')
    if not pattern.match(node.value):
        raise yaml.constructor.ConstructorError(None,None,'cannot resolve a node with !<tag:yaml.org,2002:float> explicit tag',node.end_mark)
    return loader.construct_yaml_float(node)


Loader.add_constructor('tag:yaml.org,2002:float',_construct_float)


def _set(loader, node):
    _tag_kind(node, yaml.MappingNode)
    value = _mapping(loader, node, deep=True)
    if any(item is not None for item in value.values()):
        _tag_error(node)
    return value


def _omap(loader, node):
    _tag_kind(node, yaml.SequenceNode)
    result, keys = [], set()
    for child in node.value:
        if not isinstance(child, yaml.MappingNode) or len(child.value) != 1:
            _tag_error(node)
        value = _mapping(loader, child, deep=True)
        key = next(iter(value))
        if key in keys:
            _tag_error(node)
        keys.add(key)
        result.append(value)
    return result


def _tag_error(node, unknown=False):
    message = f'unknown tag !<{node.tag}>' if unknown else f'cannot resolve a node with !<{node.tag}> explicit tag'
    raise yaml.constructor.ConstructorError(None, None, message, node.end_mark)


def _pairs(loader, node):
    _tag_kind(node, yaml.SequenceNode)
    result = []
    for child in node.value:
        if not isinstance(child, yaml.MappingNode) or len(child.value) != 1:
            _tag_error(node)
        value = _mapping(loader, child, deep=True)
        result.append(list(next(iter(value.items()))))
    return result


def _tag_kind(node, kind):
    if not isinstance(node, kind):
        _tag_error(node, unknown=True)


def _binary(loader, node):
    _tag_kind(node, yaml.ScalarNode)
    alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    raw = loader.construct_scalar(node)
    if any(ch not in alphabet + '=\r\n' for ch in raw) or len(raw.replace('\r', '').replace('\n', '')) % 4:
        _tag_error(node)
    data = raw.replace('\r', '').replace('\n', '').replace('=', '')
    result, bits = [], 0
    for index, ch in enumerate(data):
        if index and index % 4 == 0:
            result.extend(((bits >> 16) & 255, (bits >> 8) & 255, bits & 255))
        bits = (bits << 6) | alphabet.index(ch)
    tail = len(data) % 4
    if tail == 0:
        result.extend(((bits >> 16) & 255, (bits >> 8) & 255, bits & 255))
    elif tail == 3:
        result.extend(((bits >> 10) & 255, (bits >> 2) & 255))
    elif tail == 2:
        result.append((bits >> 4) & 255)
    return bytes(result)


def _timestamp(loader, node):
    value = loader.construct_yaml_timestamp(node)
    if isinstance(value, datetime.datetime):
        return (value if value.tzinfo else value.replace(tzinfo=datetime.timezone.utc)).astimezone(datetime.timezone.utc)
    return datetime.datetime.combine(value, datetime.time(), tzinfo=datetime.timezone.utc)


Loader.add_constructor('tag:yaml.org,2002:set', _set)
Loader.add_constructor('tag:yaml.org,2002:omap', _omap)
Loader.add_constructor('tag:yaml.org,2002:binary', _binary)
Loader.add_constructor('tag:yaml.org,2002:pairs', _pairs)
Loader.add_constructor('tag:yaml.org,2002:timestamp', _timestamp)


def load_yaml(raw):
    return yaml.load(raw, Loader=Loader)


def js_string(value):
    if value is None:
        return 'null'
    if value is True:
        return 'true'
    if value is False:
        return 'false'
    if isinstance(value, dict):
        return '[object Object]'
    if isinstance(value, (list, tuple)):
        return ','.join('' if v is None else js_string(v) for v in value)
    if isinstance(value, bytes):
        return ','.join(str(byte) for byte in value)
    if isinstance(value, float):
        if math.isnan(value):
            return 'NaN'
        if math.isinf(value):
            return 'Infinity' if value > 0 else '-Infinity'
        absolute = abs(value)
        if absolute == 0:
            return '0'
        if 1e-6 <= absolute < 1e21:
            decimal = format(Decimal(str(value)), 'f')
            return decimal.rstrip('0').rstrip('.') if '.' in decimal else decimal
        coefficient, exponent = format(value, '.15e').split('e') if 'e' not in str(value) else str(value).split('e')
        coefficient = coefficient.rstrip('0').rstrip('.')
        exponent = int(exponent)
        return f'{coefficient}e{"+" if exponent >= 0 else ""}{exponent}'
    return str(value)


_collator = None


def js_sort_key(value):
    """Unicode collation matching localeCompare, including punctuation and case."""
    global _collator
    if _collator is None:
        _collator = Collator()
    return _collator.sort_key(str(value))


def canonical_order(mapping):
    preferred = ['name', 'description', 'title', 'model', 'color', 'tools']
    keys = [key for key in preferred if key in mapping]
    keys += sorted((key for key in mapping if key not in preferred), key=lambda key: key.encode('utf-16-be', 'surrogatepass'))
    return {key: mapping[key] for key in keys}


class Dumper(yaml.SafeDumper):
    def ignore_aliases(self, data):
        return True

    def increase_indent(self, flow=False, indentless=False):
        return super().increase_indent(flow, False)

    def determine_block_hints(self, text):
        hints = str(self.best_indent) if re.match(r'^\n* ', text) else ''
        if not text.endswith('\n'):
            hints += '-'
        elif len(text) == 1 or text.endswith('\n\n'):
            hints += '+'
        return hints

    def choose_scalar_style(self):
        if self.event.tag == 'tag:yaml.org,2002:binary':
            return ''
        if self.event.style == '|':
            return '|'
        # PyYAML interprets yes/on as bool. js-yaml noCompatMode emits them plain.
        style = super().choose_scalar_style()
        return '"' if style == "'" else style


Dumper.yaml_implicit_resolvers = copy.deepcopy(Loader.yaml_implicit_resolvers)


def _str(dumper, value):
    style = None
    if '\n' in value and not any(ord(ch) < 32 and ch != '\n' for ch in value):
        style = '|'
    elif any(ord(ch) < 32 for ch in value):
        style = '"'
    elif (not value or value.strip() != value or re.match(r'^(?:null$|Null$|NULL$|~$|true$|false$|True$|False$|TRUE$|FALSE$|[\[\]{}#&*!|>\'"%@`])', value)
          or ': ' in value or ' #' in value or value.endswith(':')):
        style = '"'
    elif any(regex.match(value) for tag, regex in Loader.yaml_implicit_resolvers.get(value[0], []) if tag != 'tag:yaml.org,2002:str'):
        style = '"'
    return dumper.represent_scalar('tag:yaml.org,2002:str', value, style=style)


Dumper.add_representer(str, _str)


def _float(dumper, value):
    text = '.nan' if math.isnan(value) else ('.inf' if value > 0 else '-.inf') if math.isinf(value) else js_string(value)
    if value == 0 and math.copysign(1, value) < 0:
        text = '-0.0'
    if math.isfinite(value) and value.is_integer() and not (value==0 and math.copysign(1,value)<0):
        tag='tag:yaml.org,2002:int' if 'e' not in text else 'tag:yaml.org,2002:float'
        return dumper.represent_scalar(tag,text)
    if 'e' in text and '.' not in text.split('e')[0]:
        text = text.replace('e', '.e', 1)
    tag = 'tag:yaml.org,2002:int' if re.match(r'^-?\d+$', text) else 'tag:yaml.org,2002:float'
    return dumper.represent_scalar(tag, text)


Dumper.add_representer(float, _float)


def _dump_integer(dumper,value):
    text=js_string(float(value)) if abs(value)>2**53 else str(value)
    return dumper.represent_scalar('tag:yaml.org,2002:float' if 'e' in text else 'tag:yaml.org,2002:int',text)


Dumper.add_representer(int,_dump_integer)
Dumper.add_representer(datetime.datetime, lambda dumper, value: dumper.represent_scalar('tag:yaml.org,2002:timestamp', json_compatible(value)))
Dumper.add_multi_representer(datetime.datetime, lambda dumper, value: dumper.represent_scalar('tag:yaml.org,2002:timestamp', json_compatible(value)))
Dumper.add_multi_representer(datetime.date, lambda dumper, value: dumper.represent_scalar('tag:yaml.org,2002:timestamp', json_compatible(value)))
Dumper.add_multi_representer(datetime.time, lambda dumper, value: dumper.represent_scalar('tag:yaml.org,2002:str', json_compatible(value)))
Dumper.add_representer(bytes, lambda dumper, value: dumper.represent_scalar('tag:yaml.org,2002:binary', base64.b64encode(value).decode('ascii')))


def dump_yaml(mapping):
    if not mapping:
        return ''
    text = yaml.dump(canonical_order(mapping), Dumper=Dumper, sort_keys=False, allow_unicode=True, width=2**31-1, default_flow_style=False)
    return text[:-4] if text.endswith('...\n') else text


def yaml_error_message(error, raw):
    """Translate shared parser failures into js-yaml's public reason/snippet."""
    problem = getattr(error, 'problem', str(error))
    context = getattr(error, 'context', '') or ''
    mark = getattr(error, 'problem_mark', None)
    if 'single document' in context:
        return 'expected a single document in the stream, but found more'
    if mark is None:
        return str(error)
    buffer = raw.removeprefix('\ufeff')
    if not buffer.endswith(('\n', '\r')):
        buffer += '\n'
    line, column = mark.line, mark.column
    lines = re.split(r'\r?\n|\r', buffer)
    reason = problem
    if 'stream end' in problem or 'end of stream' in problem:
        line, column = len(lines) - 1, 0
        if 'quoted scalar' in context:
            quote = 'single' if re.search(r"(?:^|[:\s])'[^']*$", raw) else 'double'
            reason = f'unexpected end of the stream within a {quote} quoted scalar'
        else:
            reason = 'unexpected end of the stream within a flow collection'
    elif 'undefined alias' in problem:
        alias = re.search(r"alias '(.*?)'", problem).group(1)
        reason = f'unidentified alias "{alias}"'
        column += len(alias) + 1
    elif 'constructor for the tag' in problem:
        tag = re.search(r"tag '(.*?)'", problem).group(1)
        reason = f'unknown tag !<{tag}>'
        column = len(lines[line])
    elif 'mapping values are not allowed' in problem or 'block end' in problem:
        reason = 'bad indentation of a mapping entry'
    elif "character '\\t'" in problem:
        reason = 'end of the stream or a document separator is expected'
        column = max(0, lines[line].find(':'))
    elif "expected ',' or ']'" in problem:
        reason = 'missed comma between flow collection entries'
    elif "expected ',' or '}'" in problem:
        reason = 'missed comma between flow collection entries'
    digits = len(str(min(line + 2, len(lines)-1)))
    max_half = (79 - (1 + digits + 3)) // 2 - 1

    def get_line(text):
        start, end, head, tail = 0, len(text), '', ''
        if column > max_half:
            head = ' ... '
            start = column - max_half + len(head)
        if end-column > max_half:
            tail = ' ...'
            end = column+max_half-len(tail)
        return head + text[start:end].replace('\t', '→') + tail, column-start+len(head)

    snippet = []
    for index in range(max(0, line-3), min(len(lines)-1, line+2)+1):
        if index > line and index == len(lines)-1:
            break
        text, position = get_line(lines[index])
        snippet.append(f' {index+1:>{digits}} | {text}')
        if index == line:
            snippet.append('-' * (1+digits+3+position) + '^')
    return f'{reason} ({line+1}:{column+1})\n\n' + '\n'.join(snippet)


def json_compatible(value):
    if callable(getattr(value, 'toml_json', None)):
        return value.toml_json()
    if isinstance(value, bytes):
        return {str(index): byte for index, byte in enumerate(value)}
    if isinstance(value, (datetime.datetime, datetime.date)):
        if isinstance(value, datetime.date) and not isinstance(value, datetime.datetime):
            return value.isoformat() + 'T00:00:00.000Z'
        date = value if value.tzinfo else value.replace(tzinfo=datetime.timezone.utc)
        return date.astimezone(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {key: json_compatible(v) for key, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_compatible(v) for v in value]
    return value


def stringify_json(value, *, sort_keys=False, indent=None):
    """JSON.stringify-compatible number spelling and property enumeration."""
    import json

    def string(text):
        rendered = json.dumps(str(text), ensure_ascii=False)
        return ''.join(f'\\u{ord(char):04x}' if 0xD800 <= ord(char) <= 0xDFFF else char for char in rendered)

    def encode(item, depth=0):
        if callable(getattr(item, 'toml_json', None)):
            return string(item.toml_json())
        if isinstance(item, (datetime.date, datetime.datetime, bytes)):
            item = json_compatible(item)
        if item is None:
            return 'null'
        if item is True:
            return 'true'
        if item is False:
            return 'false'
        if isinstance(item, (int, float)):
            if isinstance(item, float) and not math.isfinite(item):
                return 'null'
            if isinstance(item, int) and abs(item)>2**53:
                return js_string(float(item))
            return js_string(item)
        if isinstance(item, str):
            return string(item)
        if isinstance(item, dict):
            keys = list(item)
            if sort_keys:
                keys.sort(key=lambda key: str(key).encode('utf-16-be','surrogatepass'))
            numeric = [key for key in keys if isinstance(key,str) and re.match(r'^(?:0|[1-9]\d*)$',key) and int(key)<2**32-1]
            keys = sorted(numeric, key=int) + [key for key in keys if key not in numeric]
            parts = [string(key) + (': ' if indent is not None else ':') + encode(item[key],depth+1) for key in keys]
            opening, closing = '{','}'
        elif isinstance(item, (list,tuple)):
            parts = [encode(element,depth+1) for element in item]
            opening, closing = '[',']'
        else:
            raise TypeError(f'Object of type {type(item).__name__} is not JSON serializable')
        if indent is not None and parts:
            space = ' ' * indent
            return opening+'\n'+space*(depth+1)+(',\n'+space*(depth+1)).join(parts)+'\n'+space*depth+closing
        return opening+','.join(parts)+closing

    return encode(value)
