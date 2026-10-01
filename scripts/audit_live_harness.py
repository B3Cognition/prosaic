"""Test-only request-body hashes; never inspect or persist HTTP credentials."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import sys
import urllib.request

output = Path(sys.argv[1])
program = sys.argv[2]
arguments = sys.argv[3:]
requests = []
original = urllib.request.Request.__init__
wire = os.environ.get('PROSAIC_TRIAL_WIRE') == '1'
original_open = urllib.request.OpenerDirector.open


def audited_request(self, full_url, data=None, *args, **kwargs):
    if full_url.rstrip('/').endswith('/chat/completions') and data:
        payload = json.loads(data)
        canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
        requests.append({'sha256': hashlib.sha256(canonical.encode()).hexdigest(),
                         'model': payload.get('model'), 'stream': payload.get('stream'),
                         'tool_choice': payload.get('tool_choice'),
                         'tools': [item['function']['name'] for item in payload.get('tools', [])]})
        output.write_text(json.dumps(requests, indent=2) + '\n')
        if wire:
            output.with_name(output.stem + f'.request-{len(requests)-1}.json').write_text(
                json.dumps(payload, indent=2) + '\n')
    return original(self, full_url, data, *args, **kwargs)


class RecordingResponse:
    def __init__(self, response, index):
        self.response = response
        self.path = output.with_name(output.stem + f'.response-{index}.raw')
        self.path.write_bytes(b'')
        requests[index]['http_status'] = response.getcode()
        requests[index]['content_type'] = response.headers.get('Content-Type')
        output.write_text(json.dumps(requests, indent=2) + '\n')

    def __getattr__(self, name):
        return getattr(self.response, name)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return self.response.__exit__(*args)

    def read(self, *args):
        data = self.response.read(*args)
        with self.path.open('ab') as log:
            log.write(data)
        return data

    def readline(self, *args):
        data = self.response.readline(*args)
        with self.path.open('ab') as log:
            log.write(data)
        return data


def audited_open(self, request, *args, **kwargs):
    response = original_open(self, request, *args, **kwargs)
    if isinstance(request, urllib.request.Request) and request.full_url.rstrip('/').endswith('/chat/completions'):
        return RecordingResponse(response, len(requests) - 1)
    return response


urllib.request.Request.__init__ = audited_request
if wire:
    urllib.request.OpenerDirector.open = audited_open
sys.argv = [program, *arguments]
runpy.run_path(program, run_name='__main__')
