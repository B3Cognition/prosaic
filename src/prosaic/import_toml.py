"""Reference TOML grammar and diagnostics for inverse distribution.

The frozen parser predates heterogeneous arrays. Its consumed-character
positions and typed inline arrays are part of the import warning contract.
"""
from __future__ import annotations

import re
import tomllib

from .toml_types import parse_toml_temporal


class TomlGrammarError(ValueError):
    pass


class _Table(dict):
    def __init__(self, inline=False):
        super().__init__()
        self.inline = inline
        self.declared = False


class _Array(list):
    def __init__(self, inline=False):
        super().__init__()
        self.inline = inline


class Parser:
    def __init__(self, content):
        self.text = content
        self.i = 0
        self.root = _Table()
        self.context = self.root

    @property
    def ch(self):
        return self.text[self.i:self.i + 1]

    def fail(self, message, extra=0):
        i = self.i + extra
        prefix = self.text[:min(i, len(self.text))]
        row = prefix.count('\n') + 1
        start = prefix.rfind('\n') + 1
        position = len(prefix.encode('utf-16-le', 'surrogatepass')) // 2 + max(i - len(self.text), 0)
        line_position = len(prefix[start:].encode('utf-16-le', 'surrogatepass')) // 2 + max(i - len(self.text), 0)
        column = line_position + (2 if row == 1 else 1)
        lines = self.text.split('\n')
        width = len(str(min(len(lines), row + 2)))
        parts = [f'{message} at row {row}, col {column}, pos {position + 1}:']
        for line in range(max(1, row - 1), min(len(lines), row + 1) + 1):
            parts.append(f'{line:>{width}}{">" if line == row else ":"} {lines[line - 1]}')
            if line == row:
                parts.append(' ' * (width + column + 1) + '^')
        raise TomlGrammarError('\n'.join(parts) + '\n\n')

    def space(self, newline=False, comments=False):
        chars = ' \t\r\n' if newline else ' \t'
        while self.ch:
            if self.ch in chars:
                self.i += 1
            elif comments and self.ch == '#':
                while self.ch and self.ch != '\n':
                    self.i += 1
            else:
                break

    def keyword(self):
        if self.ch in ('"', "'"):
            return self.string(key=True)
        start = self.i
        while self.ch and re.match(r'[A-Za-z0-9_-]', self.ch):
            self.i += 1
        if not self.ch:
            self.fail('Key ended without value', extra=1)
        if start == self.i:
            self.fail('Empty bare keys are not allowed')
        return self.text[start:self.i]

    def keys(self):
        keys = []
        while True:
            self.space()
            keys.append(self.keyword())
            self.space()
            if self.ch != '.':
                return keys
            self.i += 1

    def string(self, key=False):
        quote, start = self.ch, self.i
        multi = not key and self.text.startswith(quote * 3, self.i)
        delimiter = quote * (3 if multi else 1)
        self.i += len(delimiter)
        if not multi and self.ch == quote:
            self.i += 1
            return ''
        while True:
            ch = self.ch
            if self.text.startswith(delimiter, self.i) and ch:
                self.i += len(delimiter)
                raw = self.text[start:self.i]
                try:
                    return tomllib.loads('x=' + raw)['x']
                except Exception:
                    return raw[len(delimiter):-len(delimiter)]
            if not ch:
                self.fail('Unterminated multi-line string' if multi else 'Unterminated string', extra=1)
            if not multi and ch in '\r\n':
                self.fail('Unterminated string')
            if ord(ch) == 127 or (ord(ch) <= 31 and ch not in ('\t\r\n' if multi else '\t')):
                self.fail(f'Control characters (codes < 0x1f and 0x7f) are not allowed in strings, use \\u{ord(ch):04x} instead')
            if quote == '"' and ch == '\\':
                self.i += 1
                escape = self.ch
                if multi and escape and escape in ' \t\r\n':
                    while self.ch and self.ch in ' \t':
                        self.i += 1
                    if self.ch and self.ch not in '\r\n':
                        self.fail("Can't escape whitespace")
                    self.space(newline=True)
                    continue
                if escape in ('u', 'U'):
                    length = 4 if escape == 'u' else 8
                    self.i += 1
                    digits = ''
                    for _ in range(length):
                        if not self.ch or not re.match('[0-9a-fA-F]', self.ch):
                            self.fail('Invalid character in unicode sequence, expected hex')
                        digits += self.ch
                        self.i += 1
                    code = int(digits, 16)
                    if 0xD800 <= code <= 0xDFFF:
                        self.fail('Invalid unicode, character in range 0xD800 - 0xDFFF is reserved')
                    if code > 0x10FFFF:
                        self.fail(f'Invalid code point {code}')
                    continue
                if escape not in ('b', 't', 'n', 'f', 'r', '"', '\\'):
                    self.fail('Unknown escape character: ' + str(ord(escape) if escape else 0x110000))
            self.i += 1

    def assign(self, target):
        keys = self.keys()
        if self.ch != '=':
            self.fail('Invalid character, expected "="')
        self.i += 1
        self.space()
        value, kind = self.value()
        for key in keys[:-1]:
            if key in target and (not isinstance(target[key], _Table) or target[key].inline or target[key].declared):
                self.fail("Can't redefine existing key")
            target = target.setdefault(key, _Table())
        if keys[-1] in target:
            self.fail("Can't redefine existing key")
        target[keys[-1]] = value
        return kind

    def table(self):
        self.i += 1
        array = self.ch == '['
        if array:
            self.i += 1
        target = self.root
        while True:
            self.space()
            key = self.keyword()
            self.space()
            ch = self.ch
            if ch not in ('.', ']'):
                self.fail('Unexpected character, expected whitespace, . or ]')
            current = target.get(key)
            if ch == '.':
                if current is None:
                    target[key] = current = _Table()
                elif isinstance(current, _Array):
                    if current.inline:
                        self.fail("Can't extend an inline array" if array else "Can't redefine existing key")
                    current = current[-1]
                elif not isinstance(current, _Table) or current.inline:
                    if array and isinstance(current, _Table):
                        self.fail("Can't extend an inline table")
                    self.fail("Can't redefine an existing key" if array else "Can't redefine existing key")
                target = current
                self.i += 1
                continue
            if array:
                if current is None:
                    target[key] = current = _Array()
                if isinstance(current, _Array) and current.inline:
                    self.fail("Can't extend an inline array")
                if not isinstance(current, _Array):
                    self.fail("Can't redefine an existing key")
                child = _Table()
                current.append(child)
                self.context = child
                self.i += 1
                if self.ch != ']':
                    self.fail('Unexpected character, expected whitespace, . or ]')
            else:
                if current is not None and (not isinstance(current, _Table) or current.inline or current.declared):
                    self.fail("Can't redefine existing key")
                target[key] = current = current if current is not None else _Table()
                current.declared = True
                self.context = current
            self.i += 1
            return

    def value(self):
        ch = self.ch
        if not ch:
            self.fail('Key without value')
        if ch in ('"', "'"):
            return self.string(), 'string'
        if ch == '[':
            self.i += 1
            values = _Array(inline=True)
            kind = None
            while True:
                self.space(newline=True, comments=True)
                if not self.ch:
                    self.fail('Unterminated inline array')
                if self.ch == ']':
                    self.i += 1
                    return values, 'inline-list'
                value, item_kind = self.value()
                if kind and kind != item_kind:
                    self.fail(f'Inline lists must be a single type, not a mix of {kind} and {item_kind}')
                kind = item_kind
                values.append(value)
                self.space(newline=True, comments=True)
                if self.ch == ',':
                    self.i += 1
                elif self.ch != ']':
                    self.fail('Invalid character, expected whitespace, comma (,) or close bracket (])')
        if ch == '{':
            self.i += 1
            values = _Table(inline=True)
            while True:
                self.space()
                if not self.ch or self.ch in '#\r\n':
                    self.fail('Unterminated inline array')
                if self.ch == '}':
                    self.i += 1
                    return values, 'inline-table'
                self.assign(values)
                self.space()
                if not self.ch or self.ch in '#\r\n':
                    self.fail('Unterminated inline array')
                if self.ch == ',':
                    self.i += 1
                elif self.ch != '}':
                    self.fail('Invalid character, expected whitespace, comma (,) or close bracket (])')
        if ch in 'tf':
            word = 'true' if ch == 't' else 'false'
            for letter in word:
                if self.ch != letter:
                    self.fail('Invalid boolean, expected true or false')
                self.i += 1
            return word == 'true', 'boolean'
        if ch in '+-' or ch.isascii() and ch.isdigit() or ch in 'in':
            return self.number()
        self.fail('Unexpected character, expecting string, number, datetime, boolean, inline array or inline table')

    def no_under(self, base=False):
        if self.ch in (('_', '.') if base else ('_', '.', 'E', 'e')):
            self.fail('Unexpected character, expected digit')
        if not self.ch or self.ch in ' \t\r\n#':
            self.fail('Incomplete number')

    def number(self):
        start = self.i
        signed = self.ch in '+-'
        if signed:
            self.i += 1
        if self.ch in ('i', 'n'):
            word = 'inf' if self.ch == 'i' else 'nan'
            for letter in word:
                if self.ch != letter:
                    self.fail('Unexpected character, expected "inf", "+inf" or "-inf"' if word == 'inf' else 'Unexpected character, expected "nan"')
                self.i += 1
            return float('-inf' if signed and self.text[start] == '-' and word == 'inf' else word), 'float'
        if signed:
            self.no_under()
        if not signed and self.ch == '0' and self.text[self.i + 1:self.i + 2] in ('x', 'o', 'b'):
            base_char = self.text[self.i + 1]
            self.i += 2
            self.no_under(base=True)
            allowed = {'x': '0123456789abcdefABCDEF', 'o': '01234567', 'b': '01'}[base_char]
            while self.ch:
                if self.ch in allowed:
                    self.i += 1
                elif self.ch == '_':
                    self.i += 1
                    self.no_under(base=True)
                else:
                    break
            raw = self.text[start:self.i].replace('_', '')
            try:
                return int(raw, 0), 'integer'
            except ValueError:
                self.fail('Invalid number')
        digits = ''
        leading_zero = self.ch == '0'
        while self.ch and self.ch.isascii() and self.ch.isdigit():
            if not signed and leading_zero and len(digits) == 4:
                self.fail('Expected hyphen (-) while parsing year part of date')
            digits += self.ch
            self.i += 1
            if signed and leading_zero:
                break
        if leading_zero and len(digits) == 1 and self.ch not in ('.',) and (not signed or self.ch not in ('e', 'E')):
            return 0, 'integer'
        if not signed and leading_zero and len(digits) > 1:
            if len(digits) < 4 and self.ch != ':':
                self.fail('Expected digit while parsing year part of a date')
            if len(digits) >= 4 and self.ch != '-':
                self.fail('Expected hyphen (-) while parsing year part of date')
        if not signed and len(digits) <= 4 and self.ch in ('-', ':'):
            return self.temporal(start, digits)
        floating = False
        while self.ch:
            if self.ch == '_':
                self.i += 1
                self.no_under()
            elif self.ch.isascii() and self.ch.isdigit():
                self.i += 1
            elif self.ch == '.' and not floating:
                floating = True
                self.i += 1
                self.no_under()
            elif self.ch in 'eE':
                floating = True
                self.i += 1
                if self.ch in ('+', '-'):
                    self.i += 1
                    self.no_under()
                elif not self.ch or not self.ch.isascii() or not self.ch.isdigit():
                    self.fail('Unexpected character, expected -, + or digit')
                while self.ch and (self.ch.isascii() and self.ch.isdigit() or self.ch == '_'):
                    if self.ch == '_':
                        self.i += 1
                        self.no_under()
                    else:
                        self.i += 1
                break
            else:
                break
        raw = self.text[start:self.i].replace('_', '')
        try:
            return (float(raw), 'float') if floating else (int(raw), 'integer')
        except ValueError:
            if floating:
                return float('nan'), 'float'
            self.fail('Invalid number')

    def temporal(self, start, digits):
        only_time = self.ch == ':'
        if only_time:
            if len(digits) < 2:
                self.fail('Hours less than 10 must be zero padded to two characters')
        else:
            if len(digits) < 4:
                self.fail('Years less than 1000 must be zero padded to four characters')
            self.i += 1
            month = self.read_digits()
            if self.ch != '-':
                self.fail('Incomplete datetime')
            if len(month) < 2:
                self.fail('Months less than 10 must be zero padded to two characters')
            self.i += 1
            day = self.read_digits()
            if self.ch not in ('T', ' ') and (not self.ch or self.ch in '\t\r\n#'):
                return parse_toml_temporal(self.text[start:self.i]), 'datetime'
            if self.ch not in ('T', ' '):
                self.fail('Incomplete datetime')
            if len(day) < 2:
                self.fail('Days less than 10 must be zero padded to two characters')
            self.i += 1
            if not self.ch or self.ch in ' \t\r\n#':
                return parse_toml_temporal(self.text[start:self.i].strip()), 'datetime'
            hour = self.read_digits()
            if self.ch != ':':
                self.fail('Incomplete datetime')
            if len(hour) < 2:
                self.fail('Hours less than 10 must be zero padded to two characters')
        self.i += 1
        incomplete = 'Incomplete time' if only_time else 'Incomplete datetime'
        for _ in range(2):
            if not self.ch or not self.ch.isascii() or not self.ch.isdigit():
                self.fail(incomplete)
            self.i += 1
        if self.ch != ':':
            self.fail(incomplete)
        self.i += 1
        for _ in range(2):
            if not self.ch or not self.ch.isascii() or not self.ch.isdigit():
                self.fail(incomplete)
            self.i += 1
        if only_time and self.ch != '.':
            value = parse_toml_temporal(self.text[start:self.i])
            # The reference returns from this state after consuming the next
            # character, including an inline-array delimiter.
            self.i += 1
            return value, 'datetime'
        if self.ch == '.':
            self.i += 1
            if not self.read_digits():
                self.fail('Expected digit in milliseconds')
        if not only_time and self.ch in ('+', '-'):
            self.i += 1
            for _ in range(2):
                if not self.ch or not self.ch.isascii() or not self.ch.isdigit():
                    self.fail('Unexpected character in datetime, expected digit')
                self.i += 1
            if self.ch != ':':
                self.fail('Unexpected character in datetime, expected colon')
            self.i += 1
            for _ in range(2):
                if not self.ch or not self.ch.isascii() or not self.ch.isdigit():
                    self.fail('Unexpected character in datetime, expected digit')
                self.i += 1
        elif not only_time and self.ch == 'Z':
            self.i += 1
        elif self.ch and self.ch not in ' \t\r\n#':
            self.fail('Unexpected character in datetime, expected period (.), minus (-), plus (+) or Z')
        return parse_toml_temporal(self.text[start:self.i]), 'datetime'

    def read_digits(self):
        start = self.i
        while self.ch and self.ch.isascii() and self.ch.isdigit():
            self.i += 1
        return self.text[start:self.i]

    def parse(self):
        while self.ch:
            self.space(newline=True, comments=True)
            if not self.ch:
                break
            if self.ch == '[':
                self.table()
            elif re.match(r'[A-Za-z0-9_\-\'\"]', self.ch):
                self.assign(self.context)
            else:
                self.fail(f'Unknown character "{ord(self.ch)}"')
            self.space()
            if self.ch == '#':
                self.space(comments=True)
            if self.ch and self.ch not in '\r\n':
                self.fail('Unexpected character, expected only whitespace or comments till end of line')
            if self.ch:
                self.i += 1
        return self.root


def validate_toml_grammar(content):
    Parser(content).parse()


def parse_toml(content):
    def unbox(value):
        if isinstance(value, dict):
            return {key: unbox(item) for key, item in value.items()}
        if isinstance(value, list):
            return [unbox(item) for item in value]
        return value
    return unbox(Parser(content).parse())
