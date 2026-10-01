"""The existing prosaic command line, with Python operation dispatch."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import sys

from . import __version__
from .compat import json_compatible, stringify_json
from .core import inspect_artifact


def styled(stream, color=None):
    if color is not None:
        return color
    if 'NO_COLOR' in os.environ:
        return False
    if 'FORCE_COLOR' in os.environ:
        return os.environ['FORCE_COLOR'] != '0'
    return stream.isatty()


def paint(text, code, enabled):
    return f'\x1b[{code}m{text}\x1b[0m' if enabled else text


def theme(style):
    return {**{key: (lambda value, code=code: paint(value, code, style)) for key, code in
               [('created', 32), ('overwrite', 33), ('error', 31), ('unchanged', 90), ('path', 4), ('warn', 33), ('errorPrefix', 31), ('dim', 2)]},
            'okMarker': '✓' if style else '[ok]', 'dropMarker': '✗' if style else '[drop]', 'arrow': '→' if style else '->'}


class ParserError(ValueError):
    pass


def warning_line(warning, style=False):
    where = (' → ' if style else ' -> ').join(str(warning[key]) for key in ('artifact', 'target') if warning.get(key))
    head = f'{paint("warning", 33, style)}[{warning["kind"]}]'
    return f'{head} {where}: {warning["message"]}' if where else f'{head} {warning["message"]}'


def style_preview(line, style=False):
    if not style:
        return line
    match = re.match(r'^(create |update |remove |noop   ) (.+?)( \[.*)$', line)
    if not match:
        return line
    label, path, tail = match.groups()
    code = {'create ': 32, 'update ': 33, 'remove ': 31, 'noop   ': 90}[label]
    return f'{paint(label, code, True)} {paint(path, 4, True)}{tail}'


def _parse(args):
    values, positional = {}, []
    arrays = {'targets', 'types'}
    strings = {'source', 'lossy', 'target', 'format', 'directory'}
    boolean = {'dry-run', 'overwrite', 'json', 'color', 'help', 'version'}
    index = 0
    while index < len(args):
        token = args[index]
        if token == '--':
            positional += args[index+1:]
            break
        if not token.startswith('-'):
            positional.append(token)
            index += 1
            continue
        name, equal, inline = token.lstrip('-').partition('=')
        negative = name.startswith('no-') and name[3:] in boolean
        if negative:
            name = name[3:]
        if name in boolean:
            values[name] = not negative and (not equal or inline != 'false')
            if not equal and index+1 < len(args) and args[index+1] in ('true', 'false'):
                index += 1
                values[name] = args[index] == 'true'
        elif name in arrays:
            items = [inline] if equal else []
            while index + 1 < len(args) and not args[index+1].startswith('-'):
                index += 1
                items.append(args[index])
            values.setdefault(name, []).extend(items)
        elif name in strings:
            if equal:
                values[name] = inline
            elif index + 1 < len(args) and not args[index+1].startswith('-'):
                index += 1
                values[name] = args[index]
            else:
                values[name] = ''
        else:
            values.setdefault('_unknown', []).append(name)
            if not equal and index+1 < len(args) and not args[index+1].startswith('-'):
                index += 1
        index += 1
    return values, positional


def _help(command=''):
    # The frozen help is contract data, independent of Python's parser formatting.
    file = Path(__file__).parent / 'data' / 'help.json'
    if file.exists():
        data = json.loads(file.read_text())
        return data.get(command, data[''])
    return 'prosaic [command]\n\nCommands: apply, import, revert, resolve, inspect, package deploy, package revert\n'


def main(args=None):
    args = sys.argv[1:] if args is None else args
    out_style = err_style = False
    help_command = ''
    try:
        flags, positional = _parse(list(args))
        out_style, err_style = styled(sys.stdout, flags.get('color')), styled(sys.stderr, flags.get('color'))
        command = positional[0] if positional else 'apply'
        help_command = ' '.join(positional[:2]) if command == 'package' and len(positional)>1 and positional[1] in ('deploy', 'revert') else (command if positional and command in ('apply', 'revert', 'inspect', 'resolve', 'import', 'package', 'tools') else '')
        if flags.get('version'):
            print(__version__)
            return 0
        if flags.get('help'):
            print(_help(' '.join(positional[:2]) if command == 'package' else (command if positional else '')), end='')
            return 0
        if 'lossy' in flags and flags['lossy'] not in ('warn', 'error'):
            raise ParserError(f"Invalid values:\n  Argument: lossy, Given: \"{flags['lossy']}\", Choices: \"warn\", \"error\"")
        if command in ('inspect', 'resolve') and len(positional) < 2:
            raise ParserError('Not enough non-option arguments: got 0, need at least 1')
        if command == 'resolve' and 'target' not in flags:
            raise ParserError('Missing required argument: target')
        if command == 'package' and (len(positional)<2 or (len(positional)<3 and positional[1] in ('deploy', 'revert'))):
            raise ParserError('Not enough non-option arguments: got 0, need at least 1')
        allowed = {'version', 'help', 'targets', 'types', 'source', 'lossy', 'color'}
        allowed |= {'apply': {'dry-run'}, 'revert': {'dry-run'}, 'import': {'format', 'dry-run', 'overwrite'}, 'inspect': {'json'}, 'resolve': {'target'}, 'package': {'dry-run'}, 'tools': {'directory'}}.get(command, {'dry-run'})
        unknown = flags.get('_unknown', []) + [key for key in flags if key not in allowed and key != '_unknown']
        count = {'apply': 1, 'revert': 1, 'inspect': 2, 'resolve': 2, 'import': 2, 'package': 3, 'tools': 1}.get(command, 0)
        if command == 'package' and len(positional)>1 and positional[1] not in ('deploy', 'revert'):
            unknown += positional[1:]
        else:
            unknown += positional[count:]
        if unknown:
            raise ParserError(f'Unknown argument{"s" if len(unknown)>1 else ""}: {", ".join(unknown)}')
        cli = {}
        for flag, field in [('source', 'source'), ('targets', 'targets'), ('types', 'artifactTypes'), ('lossy', 'lossyPolicy')]:
            if flag in flags and (flags[flag] or flag not in ('targets', 'types', 'source')):
                cli[field] = flags[flag]
        root = Path.cwd()
        dry_run = flags.get('dry-run', False)
        if command == 'tools':
            from .config import resolve_config
            from .tools import discover_tools
            config = resolve_config(root, cli)
            directory = flags.get('directory')
            print(stringify_json(discover_tools(directory if directory is not None else root / config['source'] / 'tools')))
            return 0
        if command in ('inspect', 'resolve'):
            if len(positional) < 2:
                raise ValueError('Not enough non-option arguments: got 0, need at least 1')
            if command == 'inspect':
                result = inspect_artifact(root, positional[1], cli)
            else:
                from .pipeline import resolve_execution_data
                result = resolve_execution_data(root, positional[1], flags['target'], cli)
            if not result['ok']:
                print(f'error: {result["message"]}', file=sys.stderr)
                return 1
            print(stringify_json(result['data']))
            return 0
        if command == 'apply':
            from .lifecycle import apply
            report = apply(root, cli, dry_run, theme=theme(out_style))
            for line in report.get('preview', []):
                print(line)
            for warning in report.get('warnings', []):
                print(warning_line(warning, out_style))
            if report.get('zeroTargets'):
                print('0 targets selected; nothing to do.')
            elif not report['dryRun']:
                print(f'apply: {report["created"]} created, {report["overwritten"]} overwritten, {report["unchanged"]} unchanged, {report["removed"]} removed, {report["backedUp"]} backed up. {report["changedFiles"]} changed file(s).')
        elif command == 'revert':
            from .lifecycle import revert
            report = revert(root, cli, dry_run, theme=theme(out_style))
            for line in report.get('preview', []):
                print(line)
            if not report['dryRun']:
                print(f'revert: {report["removed"]} file(s) removed.')
        elif command == 'import':
            from .importing import import_run, format_run_summary, format_portability_report
            report = import_run(root, positional[1] if len(positional)>1 else None, flags.get('format'), flags.get('source'), dry_run, flags.get('overwrite', False), theme=theme(out_style))
            for line in report.get('preview', []):
                print(line)
            for line in format_run_summary(report, theme(out_style)):
                print(line)
            for line in format_portability_report(report, theme(out_style)):
                print(line)
            for warning in report.get('allWarnings', []):
                print(warning_line(warning, err_style), file=sys.stderr)
            return 1 if any(not file['outcome']['ok'] for file in report['files']) else 0
        elif command == 'package':
            from .packages import deploy_package, revert_package
            if len(positional) < 3 or positional[1] not in ('deploy', 'revert'):
                raise ValueError('Not enough non-option arguments: got 0, need at least 1')
            operation = deploy_package if positional[1] == 'deploy' else revert_package
            report = operation(root, positional[2], dry_run=dry_run)
            for line in report.get('preview', []):
                print(line)
            if positional[1] == 'deploy':
                for warning in report.get('warnings', []):
                    print(warning_line(warning, out_style))
            if not report['dryRun']:
                if positional[1] == 'deploy':
                    print(f'package deploy {report["packageId"]}: {report["created"]} created, {report["overwritten"]} overwritten, {report["unchanged"]} unchanged, {report["removed"]} removed, {report["backedUp"]} backed up.')
                else:
                    print(f'package revert {report["packageId"]}: {report["removed"]} file(s) removed.')
        else:
            raise ValueError(f'Unknown argument: {command}')
        return 0
    except ParserError as error:
        help_text = _help(help_command)
        if not help_command:
            help_text = help_text.replace('prosaic\n', 'prosaic apply\n', 1)
        print(help_text + '\n' + str(error), file=sys.stderr)
        return 1
    except Exception as error:
        print(f'{paint("error:", 31, err_style)} {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
