"""Bounded, read-only neutral CLI-tool catalogue. Never execute manifests."""
from __future__ import annotations

import math
import os
from pathlib import Path
import re
import stat

from .compat import load_yaml


def _require(condition):
    if not condition:
        raise ValueError('invalid manifest contract')


def _text(value, minimum=0, maximum=None, pattern=None):
    _require(isinstance(value, str))
    length = len(value.encode('utf-16-le', errors='surrogatepass')) // 2
    _require(length >= minimum and (maximum is None or length <= maximum))
    _require(pattern is None or re.fullmatch(pattern, value, flags=re.ASCII) is not None)


def _validate(value):
    def visit(item, depth=0, ancestors=None):
        _require(depth <= 64)
        ancestors = set() if ancestors is None else ancestors
        if isinstance(item, (dict, list)):
            _require(id(item) not in ancestors)
            _require(not isinstance(item, dict) or not {'$ref', '$dynamicRef'} & item.keys())
            ancestors.add(id(item))
            for child in (item.values() if isinstance(item, dict) else item):
                visit(child, depth + 1, ancestors)
            ancestors.remove(id(item))
        else:
            _require(item is None or type(item) in (str, bool, int, float))
            _require(type(item) not in (int, float) or math.isfinite(item))
    visit(value)
    required = {'schema_version', 'name', 'description', 'tool_version', 'executable',
                'argv', 'parameters', 'output_format'}
    optional = {'path_parameters', 'version_probe', 'version_contains', 'timeout_s',
                'max_output_bytes', 'pass_env', 'success_exit_codes'}
    _require(isinstance(value, dict) and required <= value.keys() <= required | optional)
    _require(type(value['schema_version']) in (int, float) and value['schema_version'] == 1)
    _text(value['name'], pattern=r'[A-Za-z][A-Za-z0-9_-]{0,63}')
    _text(value['description'], 1, 4096)
    _text(value['tool_version'], 1, 40)
    _text(value['executable'], 1, 4096)
    _require(not any(char in value['executable'] for char in '\0{}'))
    _require(value['output_format'] == 'json')
    parameters = value['parameters']
    _require(isinstance(parameters, dict) and parameters.get('type') == 'object'
             and parameters.get('additionalProperties') is False)
    properties = parameters.get('properties', {})
    _require(isinstance(properties, dict))
    _require(all(isinstance(key, str) and isinstance(p, dict) and p.get('type') == 'string'
                 for key, p in properties.items()))
    names = parameters.get('required', [])
    _require(isinstance(names, list) and all(isinstance(name, str) for name in names))
    for field, limit in [('argv', 64), ('version_probe', 8)]:
        if field not in value:
            continue
        tokens = value[field]
        _require(isinstance(tokens, list) and len(tokens) <= limit)
        for token in tokens:
            _text(token, maximum=4096)
            _require('\0' not in token)
            if '{' in token or '}' in token:
                match = re.fullmatch(r'\{([A-Za-z][A-Za-z0-9_]*)\}', token, flags=re.ASCII)
                _require(field == 'argv' and match is not None)
                _require(match[1] in properties and match[1] in names)
    paths = value.get('path_parameters', {})
    _require(isinstance(paths, dict) and all(key in properties and mode == 'read'
                                            for key, mode in paths.items()))
    if 'version_contains' in value:
        _text(value['version_contains'], 1)
        _require(bool(value.get('version_probe')))
    for field, low, high, integer in [('timeout_s', 0, 3600, False),
                                      ('max_output_bytes', 128, 1048576, True)]:
        if field in value:
            number = value[field]
            _require(type(number) in (int, float))
            _require(not integer or number == int(number))
            _require(math.isfinite(number) and (number >= low if integer else number > low)
                     and number <= high)
    if 'pass_env' in value:
        env = value['pass_env']
        _require(isinstance(env, list) and len(env) <= 64)
        for name in env:
            _text(name, pattern=r'[A-Za-z_][A-Za-z0-9_]*')
        _require(len(set(env)) == len(env))
    if 'success_exit_codes' in value:
        codes = value['success_exit_codes']
        _require(isinstance(codes, list) and len(codes) > 0
                 and all(type(code) in (int, float) and math.isfinite(code)
                         and code == int(code) and 0 <= code <= 255 for code in codes))
    return value


def discover_tools(directory):
    """Return sorted manifests, without resolving executables or granting access."""
    root = Path(os.path.abspath(directory))
    if not root.exists():
        return {'schema_version': 1, 'tools': []}
    if root.is_symlink() or not root.is_dir():
        raise ValueError('invalid tool manifest directory')
    files = sorted((p for p in root.iterdir() if re.search(r'\.ya?ml$', p.name, re.I)),
                   key=lambda p: p.name.encode('utf-16-be', errors='surrogatepass'))
    if len(files) > 128:
        raise ValueError('too many tool manifests')
    names, tools = set(), []
    for file in files:
        try:
            _require(not file.is_symlink() and file.is_file())
            fd = os.open(file, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
            with os.fdopen(fd, 'rb') as stream:
                _require(stat.S_ISREG(os.fstat(stream.fileno()).st_mode))
                content = stream.read(65537)
            _require(len(content) <= 65536)
            manifest = _validate(load_yaml(content.decode('utf-8', errors='replace')))
            _require(manifest['name'] not in names)
            names.add(manifest['name'])
            tools.append({'path': str(file), 'manifest': manifest})
        except Exception:
            # Parser/schema diagnostics can leak private source; redact them.
            raise ValueError(f'Invalid or duplicate tool manifest: {file.name}') from None
    return {'schema_version': 1, 'tools': tools}
