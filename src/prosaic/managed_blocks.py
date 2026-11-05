"""Byte-preserving ownership of a region in an otherwise user-owned file.

Shared files never enter the whole-file manifest: older Prosaic versions must
not acquire permission to delete them during revert or reconciliation.
"""
import json
import re

from .filesystem import sha256, stable_stringify

BLOCKS_FILENAME = '.prosaic-blocks.json'
BEGIN = b'<!-- prosaic:begin -->'
END = b'<!-- prosaic:end -->'


class OutputConflictError(ValueError):
    """Planning cannot proceed without risking user content."""


def block_span(content):
    """Return the exact marker region, including its generated final newline."""
    if BEGIN not in content and END not in content:
        return None
    matches = list(re.finditer(rb'(?m)^<!-- prosaic:begin -->\r?\n[\s\S]*?^<!-- prosaic:end -->(?:\r?\n|$)', content))
    if content.count(BEGIN) != 1 or content.count(END) != 1 or len(matches) != 1:
        raise OutputConflictError('Malformed or duplicate Prosaic block markers.')
    return matches[0].span()


class BlockLedger:
    def __init__(self, fs_gate, entries=None, native_targets=None):
        self.fs = fs_gate
        self.entries = entries or {}
        self.native_targets = set(native_targets or [])

    @classmethod
    def load(cls, fs_gate):
        if not fs_gate.exists(BLOCKS_FILENAME):
            return cls(fs_gate)
        try:
            data = json.loads(fs_gate.read_file_buffer(BLOCKS_FILENAME))
            payload = {key: value for key, value in data.items() if key != 'integrity'}
            if data.get('version') != 1 or data.get('integrity') != sha256(stable_stringify(payload)):
                raise ValueError()
            targets = data.get('nativeTargets', [])
            if not isinstance(targets, list) or any(not isinstance(t, str) or not t for t in targets):
                raise ValueError()
            entries = {}
            for entry in data['entries']:
                if (set(entry) != {'target', 'path', 'hash', 'separator', 'createdFile'}
                        or not all(isinstance(entry[k], str) for k in ('target', 'path', 'hash', 'separator'))
                        or type(entry['createdFile']) is not bool
                        or entry['separator'] not in ('', '\n', '\n\n')
                        or not re.fullmatch('[0-9a-f]{64}', entry['hash'])):
                    raise ValueError()
                key = (entry['target'], entry['path'])
                if key in entries:
                    raise ValueError()
                entries[key] = entry
            return cls(fs_gate, entries, targets)
        except (ValueError, TypeError, KeyError, AttributeError):
            raise OutputConflictError('Managed-block ledger is corrupt or failed its integrity check.') from None

    def serialize(self):
        payload = {'version': 1, 'entries': sorted(self.entries.values(), key=lambda e: (e['target'], e['path'])),
                   'nativeTargets': sorted(self.native_targets)}
        return stable_stringify({**payload, 'integrity': sha256(stable_stringify(payload))}) + '\n'

    def save(self):
        content = self.serialize().encode()
        if self.fs.exists(BLOCKS_FILENAME) and self.fs.read_file_buffer(BLOCKS_FILENAME) == content:
            return
        # Persist the selected contract even on a successful empty/filtered
        # native run, and retain it after revert. Otherwise its new file-only
        # manifest would look like pre-existing legacy state on the next run.
        self.fs.write_file_atomic(BLOCKS_FILENAME, content)


def plan_block(fs_gate, ledger, target, path, block=None, *, check_only=False):
    """Prepare a replacement, or remove only a verified owned block."""
    exists = fs_gate.exists(path)
    old = fs_gate.read_file_buffer(path) if exists else b''
    entry = ledger.entries.get((target, path))
    span = block_span(old)
    if span and entry is None:
        if check_only and block is not None and old[span[0]:span[1]] == block.encode():
            # CI may inspect committed output without a local ownership ledger.
            # This synthetic entry is never saved and confers no mutation rights.
            entry = {'hash': sha256(block), 'separator': '', 'createdFile': False}
        else:
            raise OutputConflictError(f'Unowned managed block in "{path}"; refusing adoption.')
    if entry is not None:
        if not span or sha256(old[span[0]:span[1]]) != entry['hash']:
            raise OutputConflictError(f'Managed block in "{path}" was edited or removed.')
    if block is not None:
        content = block.encode()
        if span:
            new = old[:span[0]] + content + old[span[1]:]
            separator, created = entry['separator'], entry['createdFile']
        else:
            separator = '' if not old or old.endswith(b'\n\n') else ('\n' if old.endswith(b'\n') else '\n\n')
            new, created = old + separator.encode() + content, not exists
        next_entry = {'target': target, 'path': path, 'hash': sha256(content),
                      'separator': separator, 'createdFile': created}
    else:
        if entry is None:
            return None
        start, end = span
        separator = entry['separator'].encode()
        if separator and old[:start].endswith(separator):
            start -= len(separator)
        new = old[:start] + old[end:]
        next_entry = None
    return {'targetId': target, 'path': path, 'content': new, 'hash': sha256(new),
            'beforeHash': sha256(old) if exists else None, 'ownership': 'block', 'blockEntry': next_entry,
            'deleteFile': block is None and not new and entry['createdFile'],
            'changeType': 'unchanged' if new == old else ('overwrite' if exists else 'create'),
            'backupNeeded': exists and new != old}
