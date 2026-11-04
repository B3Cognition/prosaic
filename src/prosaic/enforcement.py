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
_IN_RESOURCE = 'tag in a bundle resource; place tags in the primary document'


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
    if kind == 'integer':
        try:
            return int(text)
        except ValueError:  # Beyond the interpreter's integer string conversion limit.
            raise _Malformed from None
    return text


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


def _candidates(line, position=0):
    """Return ``(start, end, content)`` per tag; unterminated tags run to line end."""
    spans = _code_spans(line) if '`' in line else []
    found = []
    while match := _TAG.search(line, position):
        start, position = match.start(), match.end()
        if any(left <= start < right for left, right in spans):
            continue
        close = line.find('-->', position)
        position = len(line) if close < 0 else close + 3
        found.append((start, position, None if close < 0 else line[start + 4 : close]))
    return found


def is_markdown(path):
    """Whether a resource path is Markdown, the only kind of file tags are read from."""
    return path.lower().endswith('.md')


def _closing(texts, start, code):
    """Find where an open tag ends: the next ``-->``, unless code or another ``<!--`` comes first."""
    for later in range(start, len(texts)):
        if later in code:
            return None
        close, opening = texts[later].find('-->'), texts[later].find('<!--')
        if opening >= 0 and (close < 0 or opening < close):
            return None
        if close >= 0:
            return later, close + 3
    return None


def _lines(body):
    """Split on ``\\n`` and classify lines with CommonMark; code is never tagged.

    A tag left open runs to the next ``-->``: the lines it covers record that
    span in ``consumed`` so stripping removes all of it. If no ``-->`` follows,
    or code or another ``<!--`` comes first, only the opening line is affected,
    so a later rule, tag or code fence is never swallowed.
    """
    from markdown_it import MarkdownIt

    code, headings = set(), set()
    for token in MarkdownIt('commonmark').parse(body.replace('\r', '')):
        if token.map and token.type in ('fence', 'code_block'):
            code.update(range(*token.map))
        elif token.map and token.type == 'heading_open':
            headings.update(range(*token.map))
    pieces = body.split('\n')
    texts = [piece.removesuffix('\r') for piece in pieces]
    lines, close = [], None
    for index, text in enumerate(texts):
        ending = pieces[index][len(text) :] + ('\n' if index < len(pieces) - 1 else '')
        kind = 'code' if index in code else 'heading' if index in headings else 'blank' if not text.strip() else 'text'
        consumed, position = [], 0
        if close is not None:
            if index < close[0]:
                consumed, position = [(0, len(text), None)], len(text)
            else:
                consumed, position, close = [(0, close[1], None)], close[1], None
        tags = [] if kind == 'code' else _candidates(text, position)
        if tags and tags[-1][2] is None:
            close = _closing(texts, index + 1, code)
        lines.append({'text': text, 'ending': ending, 'kind': kind, 'tags': tags, 'consumed': consumed})
    return lines


def _spans(line):
    return line['consumed'] + line['tags']


def _remove(text, spans):
    kept, position = [], 0
    for start, end, _ in spans:
        kept.append(text[position:start].rstrip(' \t'))
        position = end
    return ''.join(kept) + text[position:]


def _sentence(line):
    return _MARKER.sub('', _remove(line['text'], _spans(line)), count=1).strip()


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
        spans = _spans(line)
        text = _remove(line['text'], spans) if spans else line['text']
        if not spans or text.strip():
            kept.append(text + line['ending'])
    return ''.join(kept)


def _reporter(issues, prefix, location='$.body'):
    def report(code, message):
        issues.append({'code': code, 'severity': 'error', 'location': location, 'message': prefix + message})

    return report


def resource_issues(bundle_root, resources):
    """Report each tag in a bundle resource; tags are read only from the primary body."""
    issues = []
    for index, resource in enumerate(resources):
        if not is_markdown(resource['relPath']) or not has_tags(resource['content']):
            continue
        for number, line in enumerate(_lines(resource['content']), 1):
            report = _reporter(
                issues, f'{bundle_root}/{resource["relPath"]}:{number}: ', f'$.resources[{index}].content'
            )
            for _ in line['tags']:
                report('enforce-in-resource', _IN_RESOURCE)
    return issues


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
        elif _remove(line['text'], _spans(line)).strip():
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
