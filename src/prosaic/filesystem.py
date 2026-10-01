"""Contained mutation, deterministic provenance, and prior-content backups."""
from pathlib import Path
import hashlib
import itertools
import json
import os
import re
import shutil
import errno
from .compat import js_sort_key

MANIFEST_FILENAME = '.prosaic-manifest.json'
BACKUP_DIR_NAME = '.prosaic-backups'
_counter = itertools.count(1)

class ContainmentError(Exception):
    def __init__(self, attempted, resolved, root):
        self.attemptedPath, self.resolvedPath, self.projectRoot = str(attempted), str(resolved), str(root)
        super().__init__(f'Refused: path escapes project root.\n  attempted: {attempted}\n  resolved:  {resolved}\n  root:      {root}')

def is_inside(child, parent):
    rel = os.path.relpath(child, parent)
    return rel == '.' or (not rel.startswith('..') and not os.path.isabs(rel))

def resolve_contained(target, project_root):
    root = Path(project_root).resolve(strict=True)
    absolute = Path(os.path.abspath(os.path.join(root, target)))
    existing, tail = absolute, []
    while not os.path.lexists(existing):
        if existing.parent == existing:
            break
        tail.insert(0, existing.name)
        existing = existing.parent
    resolved = existing.resolve(strict=False).joinpath(*tail)
    if not is_inside(resolved, root):
        raise ContainmentError(target, resolved, root)
    return resolved

def sha256(content):
    return hashlib.sha256(content.encode('utf-8') if isinstance(content, str) else content).hexdigest()

def stable_stringify(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'))

def to_rel_posix(root, target):
    return os.path.relpath(os.path.abspath(os.path.join(root, target)), root).replace(os.sep, '/')

def node_os_error(error, syscall, path=None):
    """Render the stable errno wording used by Node's filesystem errors."""
    code = errno.errorcode.get(error.errno, 'UNKNOWN')
    descriptions = {'EISDIR': 'illegal operation on a directory', 'ENOENT': 'no such file or directory',
        'EACCES': 'permission denied', 'EPERM': 'operation not permitted', 'ENOTDIR': 'not a directory',
        'ELOOP': 'too many symbolic links encountered', 'EEXIST': 'file already exists',
        'ENOTEMPTY': 'directory not empty', 'EINVAL': 'invalid argument', 'ENOSPC': 'no space left on device'}
    description = descriptions.get(code, os.strerror(error.errno).lower())
    return f'{code}: {description}, {syscall}' + (f" '{path}'" if path is not None else '')

def json_parse_error(raw):
    """V8 JSON grammar diagnostics, without requiring a JavaScript runtime.

    This parser is used only to diagnose rejected JSON; Python's decoder remains
    the data parser. Positions use UTF-16 units just like JavaScript strings.
    """
    source = raw.encode('utf-16-le', errors='surrogatepass')
    text = ''.join(chr(int.from_bytes(source[i:i + 2], 'little')) for i in range(0, len(source), 2))
    n, i = len(text), 0
    def display(value):
        return value.encode('utf-16-le', errors='surrogatepass').decode('utf-16-le', errors='surrogatepass')
    def fail(reason, position=None):
        pos = i if position is None else position
        before = text[:pos]
        lines = re.split(r'\r\n|\r|\n', before)
        context = '' if reason.endswith('JSON') else ' in JSON'
        raise ValueError(f'{reason}{context} at position {pos} (line {len(lines)} column {len(lines[-1]) + 1})')
    def unexpected():
        if i >= n:
            raise ValueError('Unexpected end of JSON input')
        if text in ('undefined', 'NaN', 'Infinity', '[object Object]'):
            raise ValueError(f'"{text}" is not valid JSON')
        if n < 21:
            snippet = f'"{text}"'
        else:
            start, end = max(0, i - 10), min(n, i + 10)
            snippet = ('...' if i >= 10 else '') + f'"{text[start:end]}"' + ('...' if end < n else '')
        raise ValueError(display(f"Unexpected token '{text[i]}', {snippet} is not valid JSON"))
    def whitespace():
        nonlocal i
        while i < n and text[i] in ' \t\r\n':
            i += 1
    def string():
        nonlocal i
        i += 1
        while i < n:
            char = text[i]
            if char == '"':
                i += 1
                return
            if ord(char) < 32:
                fail('Bad control character in string literal')
            if char == '\\':
                i += 1
                if i >= n:
                    unexpected()
                if text[i] == 'u':
                    i += 1
                    for _ in range(4):
                        if i >= n or text[i] not in '0123456789abcdefABCDEF':
                            fail('Bad Unicode escape')
                        i += 1
                    continue
                if text[i] not in '"\\/bfnrt':
                    fail('Bad escaped character')
            i += 1
        fail('Unterminated string')
    def number():
        nonlocal i
        if text[i] == '-':
            i += 1
            if i >= n or not text[i].isascii() or not text[i].isdigit():
                fail('No number after minus sign')
        if text[i] == '0':
            i += 1
            if i < n and text[i] in '0123456789':
                fail('Unexpected number')
        else:
            while i < n and text[i] in '0123456789':
                i += 1
        if i < n and text[i] == '.':
            i += 1
            if i >= n or text[i] not in '0123456789':
                fail('Unterminated fractional number')
            while i < n and text[i] in '0123456789':
                i += 1
        if i < n and text[i] in 'eE':
            i += 1
            if i < n and text[i] in '+-':
                i += 1
            if i >= n or text[i] not in '0123456789':
                fail('Exponent part is missing a number')
            while i < n and text[i] in '0123456789':
                i += 1
    def value():
        nonlocal i
        whitespace()
        if i >= n:
            unexpected()
        char = text[i]
        if char == '"':
            string()
        elif char == '{':
            i += 1
            whitespace()
            if i < n and text[i] == '}':
                i += 1
                return
            if i >= n or text[i] != '"':
                fail("Expected property name or '}'")
            while True:
                string()
                whitespace()
                if i >= n or text[i] != ':':
                    fail("Expected ':' after property name")
                i += 1
                value()
                whitespace()
                if i < n and text[i] == '}':
                    i += 1
                    return
                if i >= n or text[i] != ',':
                    fail("Expected ',' or '}' after property value")
                i += 1
                whitespace()
                if i >= n or text[i] != '"':
                    fail('Expected double-quoted property name')
        elif char == '[':
            i += 1
            whitespace()
            if i < n and text[i] == ']':
                i += 1
                return
            while True:
                value()
                whitespace()
                if i < n and text[i] == ']':
                    i += 1
                    return
                if i >= n or text[i] != ',':
                    fail("Expected ',' or ']' after array element")
                i += 1
        elif char in '-0123456789':
            number()
        elif char in 'tfn':
            literal = {'t': 'true', 'f': 'false', 'n': 'null'}[char]
            for wanted in literal:
                if i >= n or text[i] != wanted:
                    unexpected()
                i += 1
        else:
            unexpected()
    try:
        value()
        whitespace()
        if i < n:
            fail('Unexpected non-whitespace character after JSON')
    except ValueError as error:
        return str(error)
    return 'Unexpected end of JSON input'

class GuardedFs:
    def __init__(self, project_root):
        self.root = str(project_root)
        if not os.path.isabs(self.root):
            raise ValueError(f'projectRoot must be absolute: {self.root}')
    def assert_contained(self, target):
        return resolve_contained(target, self.root)
    def contains(self, target):
        try:
            self.assert_contained(target)
            return True
        except (OSError, ContainmentError):
            return False
    def exists(self, target):
        return self.assert_contained(target).exists()
    def read_file(self, target):
        return self.assert_contained(target).read_bytes().decode('utf-8', errors='replace')
    def read_file_buffer(self, target):
        return self.assert_contained(target).read_bytes()
    def write_file(self, target, content):
        p = self.assert_contained(target)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content.encode('utf-8') if isinstance(content, str) else content)
    def write_file_atomic(self, target, content):
        p = self.assert_contained(target)
        p.parent.mkdir(parents=True, exist_ok=True)
        temp = p.parent / f'.{p.name}.tmp-{os.getpid()}-{next(_counter)}'
        temp.write_bytes(content.encode('utf-8') if isinstance(content, str) else content)
        os.replace(temp, p)
    def delete_file(self, target):
        p = self.assert_contained(target)
        if p.exists():
            p.unlink()
    def copy_file(self, source, dest):
        src, dst = self.assert_contained(source), self.assert_contained(dest)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
    def list_dir(self, target):
        p = self.assert_contained(target)
        return sorted(x.name for x in p.iterdir()) if p.exists() else []
    def mkdirp(self, target):
        self.assert_contained(target).mkdir(parents=True, exist_ok=True)
    def remove_dir(self, target):
        p = self.assert_contained(target)
        if p.is_dir():
            shutil.rmtree(p)
        elif p.exists():
            p.unlink()
    def move_file_atomic(self, source, dest):
        src, dst = self.assert_contained(source), self.assert_contained(dest)
        dst.parent.mkdir(parents=True, exist_ok=True)
        os.replace(src, dst)

class ManifestError(Exception):
    def __init__(self, message, kind):
        self.kind = kind
        super().__init__(message)

class Manifest:
    def __init__(self, fs_gate, entries=None, registry_version='unversioned'):
        self.fs_gate, self.entries, self.registry_version = fs_gate, entries or {}, registry_version
    @classmethod
    def load(cls, fs_gate):
        p = Path(fs_gate.root) / MANIFEST_FILENAME
        if not p.exists():
            raise ManifestError(f'Manifest absent: {MANIFEST_FILENAME}', 'absent')
        try:
            raw = p.read_bytes().decode('utf-8', errors='replace')
        except OSError as e:
            message = node_os_error(e, 'read' if e.errno == errno.EISDIR else 'open', None if e.errno == errno.EISDIR else p)
            raise ManifestError(f'Manifest unreadable: {message}', 'unreadable') from e
        try:
            def reject_constant(value):
                raise ValueError(value)
            data = json.loads(raw, parse_constant=reject_constant)
        except ValueError as e:
            raise ManifestError(f'Manifest corrupt (parse): {json_parse_error(raw)}', 'unreadable') from e
        if not isinstance(data, dict) or not isinstance(data.get('entries'), list):
            raise ManifestError('Manifest corrupt: missing entries', 'unreadable')
        payload = {k: v for k, v in data.items() if k != 'integrity'}
        if data.get('integrity') != sha256(stable_stringify(payload)):
            raise ManifestError('Manifest failed integrity check', 'integrity')
        return cls(fs_gate, {(e['target'], e['path']): e for e in data['entries']}, data.get('registryVersion', 'unversioned'))
    @classmethod
    def load_or_empty(cls, fs_gate):
        try:
            return cls.load(fs_gate)
        except ManifestError as e:
            if e.kind == 'absent':
                return cls(fs_gate)
            raise
    def record(self, target, path, hash):
        path = str(path).replace(os.sep, '/')
        self.entries[target, path] = {'target': target, 'path': path, 'hash': hash}
    def remove(self, target, path):
        self.entries.pop((target, str(path).replace(os.sep, '/')), None)
    def is_managed(self, target, path):
        return (target, str(path).replace(os.sep, '/')) in self.entries
    def is_managed_path(self, path):
        return any(e['path'] == path for e in self.entries.values())
    def all(self):
        return sorted(self.entries.values(), key=lambda e: (js_sort_key(e['target']), js_sort_key(e['path'])))
    def serialize(self):
        payload = {'version': 1, 'registryVersion': self.registry_version, 'entries': self.all()}
        return stable_stringify({**payload, 'integrity': sha256(stable_stringify(payload))}) + '\n'
    def save(self):
        self.fs_gate.write_file_atomic(MANIFEST_FILENAME, self.serialize())

class BackupManager:
    def __init__(self, fs_gate, max_backups=3):
        self.fs_gate, self.max_backups = fs_gate, max_backups
    def list_backups(self, managed_path):
        rel = Path(os.path.relpath(managed_path, self.fs_gate.root))
        parent = Path(self.fs_gate.root) / BACKUP_DIR_NAME / rel.parent
        if not parent.exists():
            return []
        result = []
        for p in parent.iterdir():
            match = re.search(r'\.bak\.(\d+)$', p.name)
            if p.name.startswith(rel.name + '.bak.') and match:
                result.append({'seq': int(match[1]), 'abs': p})
        return sorted(result, key=lambda x: x['seq'])
    def backup(self, managed_path):
        old = self.list_backups(managed_path)
        sequence = old[-1]['seq'] + 1 if old else 1
        rel = os.path.relpath(managed_path, self.fs_gate.root)
        dest = Path(self.fs_gate.root) / BACKUP_DIR_NAME / f'{rel}.bak.{sequence}'
        self.fs_gate.write_file(dest, Path(managed_path).read_bytes())
        for entry in self.list_backups(managed_path)[:-self.max_backups or None]:
            self.fs_gate.delete_file(entry['abs'])
        return dest
