"""Inert enforcement tags: parsed, validated, reported and stripped, never executed.

Core never registers, looks up or runs a guard. A tag only declares a check that a
host may enforce; see docs/rules.md.
"""

import re

STAGES = ('before_tool', 'after_tool', 'before_answer', 'final')
ACTIONS = ('fix', 'retry', 'fail')
_TAG = re.compile(r'<!--[ \t]*(?:enforce|prose-only)(?![A-Za-z0-9_-])')
_ENFORCE = re.compile(r'\s*enforce\s*:\s*([^\s(]*)\s*\((.*)\)\s*', re.DOTALL)
_PROSE = re.compile(r'\s*prose-only\s*:(.*)', re.DOTALL)
_NAME = re.compile(r'[a-z][a-z0-9_]*')
_TOKEN = re.compile(
    r'\s*(?:(?P<string>"(?:[^"\\]|\\["\\])*")|(?P<integer>-?[0-9]+)(?![A-Za-z0-9_])'
    r'|(?P<identifier>[A-Za-z_][A-Za-z0-9_]*)|(?P<punct>[(),=\[\]]))'
)
_MARKER = re.compile(r'^[ \t]*(?:>[ \t]?)*[ \t]*(?:(?:[-*+]|[0-9]{1,9}[.)])(?=[ \t]|$))?')
_SCALARS = ('string', 'integer', 'identifier')
_MALFORMED = (
    'malformed tag; expected <!-- enforce: NAME(key=value, ...) --> or '
    '<!-- prose-only: REASON -->, NAME matching [a-z][a-z0-9_]*'
)
_STAGE = 'unknown stage; accepted: ' + ', '.join(STAGES)
_ACTION = 'unknown on_violation; accepted: ' + ', '.join(ACTIONS)
_NO_RULE = 'tag has no rule sentence; place it on a rule line or the line directly after one'


class _Malformed(ValueError):
    pass


def _tokens(text):
    tokens, index = [], 0
    while match := _TOKEN.match(text, index):
        tokens.append((match.lastgroup, match[match.lastgroup]))
        index = match.end()
    if text[index:].strip():
        raise _Malformed
    return [*tokens, ('end', None)]


def _scalar(kind, text):
    if kind == 'string':
        return re.sub(r'\\(["\\])', r'\1', text[1:-1])
    return int(text) if kind == 'integer' else text


def _arguments(text):
    """Parse ``key=value`` pairs into ``{key: (kind, value)}`` without evaluation."""
    tokens, index, arguments = _tokens(text), 0, {}

    def expect(punct):
        nonlocal index
        if tokens[index] != ('punct', punct):
            raise _Malformed
        index += 1

    def value():
        nonlocal index
        kind, text = tokens[index]
        if kind in _SCALARS:
            index += 1
            return kind, _scalar(kind, text)
        expect('[')
        items = []
        while tokens[index] != ('punct', ']'):
            if items:
                expect(',')
            kind, text = tokens[index]
            if kind not in _SCALARS:
                raise _Malformed
            items.append(_scalar(kind, text))
            index += 1
        expect(']')
        return 'list', items

    while tokens[index][0] != 'end':
        if arguments:
            expect(',')
        kind, key = tokens[index]
        if kind != 'identifier' or not _NAME.fullmatch(key) or key in arguments:
            raise _Malformed
        index += 1
        expect('=')
        arguments[key] = value()
    return arguments


def _parse_tag(content):
    if content is None:
        raise _Malformed
    prose = _PROSE.fullmatch(content)
    if prose:
        if not prose[1].strip():
            raise _Malformed
        return {'kind': 'prose_only', 'reason': prose[1].strip()}
    enforce = _ENFORCE.fullmatch(content)
    if not enforce or not _NAME.fullmatch(enforce[1]):
        raise _Malformed
    return {'kind': 'enforce', 'guard': enforce[1], 'arguments': _arguments(enforce[2])}


def _code_spans(line):
    runs = [match.span() for match in re.finditer(r'`+', line)]
    spans, index = [], 0
    while index < len(runs):
        start, end = runs[index]
        close = next((j for j in range(index + 1, len(runs)) if runs[j][1] - runs[j][0] == end - start), None)
        if close is None:
            index += 1
            continue
        spans.append((start, runs[close][1]))
        index = close + 1
    return spans


def _candidates(line):
    """Return ``(start, end, content)`` per tag; unterminated tags run to line end."""
    spans = _code_spans(line) if '`' in line else []
    found, position = [], 0
    while match := _TAG.search(line, position):
        start, position = match.start(), match.end()
        if any(left <= start < right for left, right in spans):
            continue
        close = line.find('-->', position)
        position = len(line) if close < 0 else close + 3
        found.append((start, position, None if close < 0 else line[start + 4 : close]))
    return found


def _lines(body):
    """Split on ``\\n`` and classify lines with CommonMark; code is never tagged."""
    from markdown_it import MarkdownIt

    code, headings = set(), set()
    for token in MarkdownIt('commonmark').parse(body.replace('\r', '')):
        if token.map and token.type in ('fence', 'code_block'):
            code.update(range(*token.map))
        elif token.map and token.type == 'heading_open':
            headings.update(range(*token.map))
    pieces = body.split('\n')
    lines = []
    for index, piece in enumerate(pieces):
        text = piece.removesuffix('\r')
        ending = piece[len(text) :] + ('\n' if index < len(pieces) - 1 else '')
        kind = 'code' if index in code else 'heading' if index in headings else 'blank' if not text.strip() else 'text'
        lines.append(
            {'text': text, 'ending': ending, 'kind': kind, 'tags': [] if kind == 'code' else _candidates(text)}
        )
    return lines


def _remove(text, tags):
    kept, position = [], 0
    for start, end, _ in tags:
        kept.append(text[position:start].rstrip(' \t'))
        position = end
    return ''.join(kept) + text[position:]


def _sentence(line):
    return _MARKER.sub('', _remove(line['text'], line['tags']), count=1).strip()


def has_tags(body):
    """Cheap lexical pre-check; true also for tags in code, which parsing ignores."""
    return bool(_TAG.search(body))


def strip_tags(body):
    """Return ``body`` without enforcement tags, exactly as every target receives it.

    Each tag, well-formed or not, is removed with the spaces or tabs before it,
    and a line left blank is removed with its line ending. Tags in code are kept.
    A body without tags is returned unchanged (the same object).
    """
    if not has_tags(body):
        return body
    lines = _lines(body)
    if not any(line['tags'] for line in lines):
        return body
    kept = []
    for line in lines:
        text = _remove(line['text'], line['tags']) if line['tags'] else line['text']
        if not line['tags'] or text.strip():
            kept.append(text + line['ending'])
    return ''.join(kept)


def _reporter(issues, prefix):
    def report(code, message):
        issues.append({'code': code, 'severity': 'error', 'location': '$.body', 'message': prefix + message})

    return report


def parse_rules(body, file, line_offset=0):
    """Return ``{'rules': [...], 'issues': [...]}`` in line, then column, order.

    ``file`` names the source in ids and messages; ``line_offset`` counts source
    lines before the body, such as frontmatter. Both lists are empty when the
    body has no tag outside code. Messages name ``file:line`` and accepted
    values, never rejected values. Guards are neither looked up nor executed.
    """
    rules, issues = [], []
    if not has_tags(body):
        return {'rules': rules, 'issues': issues}
    lines = _lines(body)
    guards, bound = {}, {}
    for index, line in enumerate(lines):
        if not line['tags']:
            continue
        number = index + 1 + line_offset
        report = _reporter(issues, f'{file}:{number}: ')
        rule = None
        if line['kind'] == 'heading':
            pass
        elif _remove(line['text'], line['tags']).strip():
            rule = index if _sentence(line) else None
        elif index and lines[index - 1]['kind'] == 'text' and _sentence(lines[index - 1]):
            rule = index - 1
        for _, _, content in line['tags']:
            try:
                tag = _parse_tag(content)
            except _Malformed:
                report('enforce-malformed', _MALFORMED)
                continue
            if rule is None:
                report('enforce-no-rule', _NO_RULE)
                continue
            entry = {
                'kind': tag['kind'],
                'guard': None,
                'stage': None,
                'action': None,
                'settings': {},
                'reason': tag.get('reason'),
            }
            if tag['kind'] == 'enforce':
                arguments = tag['arguments']
                stage = arguments.pop('stage', ('identifier', 'final'))
                action = arguments.pop('on_violation', ('identifier', 'retry'))
                valid = True
                if stage[0] != 'identifier' or stage[1] not in STAGES:
                    report('enforce-unknown-stage', _STAGE)
                    valid = False
                if action[0] != 'identifier' or action[1] not in ACTIONS:
                    report('enforce-unknown-action', _ACTION)
                    valid = False
                if not valid:
                    continue
                if tag['guard'] in guards:
                    report(
                        'enforce-duplicate-guard',
                        f'guard already bound in this file at line '
                        f'{guards[tag["guard"]]}; bind each guard once per file',
                    )
                    continue
                entry.update(
                    guard=tag['guard'],
                    stage=stage[1],
                    action=action[1],
                    settings={key: value for key, (_, value) in arguments.items()},
                )
            if bound.get(rule) == 'prose_only' or (tag['kind'] == 'prose_only' and rule in bound):
                report(
                    'enforce-duplicate-guard',
                    f'rule at line {rule + 1 + line_offset} is already '
                    'bound; a rule takes enforce tags or one prose-only tag, not both',
                )
                continue
            bound[rule] = tag['kind']
            if entry['guard']:
                guards[entry['guard']] = number
            rules.append(
                {
                    'id': f'{file}:{number}:{entry["guard"] or "prose-only"}',
                    **entry,
                    'source': {'file': file, 'line': number},
                    'text': _sentence(lines[rule]),
                }
            )
    return {'rules': rules, 'issues': issues}
