"""Bounded first-turn experiments over synthetic captured prompts; executes no tools."""
import argparse
import copy
import datetime
import json
import os
from pathlib import Path
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def decode_response(raw, streaming):
    events = []
    if streaming:
        for line in raw.splitlines():
            if line.startswith('data:'):
                value = line[5:].strip()
                if value and value != '[DONE]':
                    events.append(json.loads(value))
    else:
        events = [json.loads(raw)]
    calls, texts, reasons = [], [], []
    for event in events:
        for choice in event.get('choices', []):
            message = choice.get('delta', choice.get('message', {}))
            calls.extend(message.get('tool_calls') or [])
            if message.get('content'):
                texts.append(message['content'])
            if choice.get('finish_reason'):
                reasons.append(choice['finish_reason'])
    return {'native_tool_deltas': len(calls), 'tool_names': sorted({
            c.get('function', {}).get('name') for c in calls if c.get('function', {}).get('name')}),
            'text': ''.join(texts), 'finish_reasons': reasons}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('payload', type=Path)
    parser.add_argument('--live', required=True, action='store_true')
    parser.add_argument('--repeats', type=int, choices=[1, 2], default=2)
    parser.add_argument('--focus', choices=['initial', 'contract'], default='initial')
    args = parser.parse_args()
    token = os.environ.get('TOKENPROXY_KEY')
    if not token:
        parser.error('Load TOKENPROXY_KEY in the environment')
    baseline = json.loads(args.payload.read_text())
    variants = {'baseline-stream': copy.deepcopy(baseline)}
    variants['baseline-nonstream'] = copy.deepcopy(baseline)
    variants['baseline-nonstream'].pop('stream_options', None)
    variants['baseline-nonstream']['stream'] = False
    variants['automatic-choice'] = copy.deepcopy(baseline)
    variants['automatic-choice']['tool_choice'] = 'auto'
    variants['without-final-json-ban'] = copy.deepcopy(baseline)
    variants['without-final-json-ban']['messages'][1]['content'] = baseline['messages'][1]['content'].replace(
        'NEVER add fields or commentary outside the JSON object.', '')
    variants['without-output-schema'] = copy.deepcopy(baseline)
    content = baseline['messages'][1]['content']
    variants['without-output-schema']['messages'][1]['content'] = content.split('Tool calls precede')[0] + (
        '\nALWAYS read the file before answering. NEVER guess its contents.\n')
    variants['acquisition-only'] = copy.deepcopy(baseline)
    variants['acquisition-only']['messages'][1]['content'] = (
        'Call read_file with path evidence/pilot.md now. Read the whole file.\n'
        'ALWAYS obtain the file through the native read_file function before answering.\n'
        'NEVER substitute a text description of a tool call or guess the file contents.\n')
    if args.focus == 'contract':
        variants = {}
        variants['required-choice'] = copy.deepcopy(baseline)
        variants['required-choice']['tool_choice'] = 'required'
        variants['explicit-next-turn'] = copy.deepcopy(baseline)
        variants['explicit-next-turn']['messages'][1]['content'] += (
            '\nFor your NEXT response only: emit a native read_file call for evidence/pilot.md. '
            'Do NOT produce JSON content in this response. The answer schema applies only '
            'AFTER receiving the successful tool result.\n')
        variants['without-formatting-tail'] = copy.deepcopy(baseline)
        variants['without-formatting-tail']['messages'][1]['content'] = content.split(
            'ALWAYS use validation_feedback')[0]
        variants['short-answer-contract'] = copy.deepcopy(baseline)
        variants['short-answer-contract']['messages'][1]['content'] = (
            content.split('Tool calls precede')[0] +
            '\nAfter receiving the successful read_file result, summarize it as JSON.\n')
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    output = args.payload.parents[0].parent / ('tool-choice-diagnosis-' + stamp)
    output.mkdir()
    results = []
    opener = urllib.request.build_opener(NoRedirect)
    for name, payload in variants.items():
        (output / (name + '.request.json')).write_text(json.dumps(payload, indent=2) + '\n')
        for repeat in range(args.repeats):
            print(f'Probing {name} {repeat+1}/{args.repeats}', flush=True)
            request = urllib.request.Request('http://10.16.81.27:8080/v1/chat/completions',
                data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json',
                                                          'Authorization': 'Bearer ' + token})
            with opener.open(request, timeout=90) as response:
                raw = response.read(4_194_305).decode()
                streaming = 'text/event-stream' in response.headers.get('Content-Type', '')
            (output / f'{name}-{repeat}.response.raw').write_text(raw)
            decoded = decode_response(raw, streaming)
            result = {'variant': name, 'repeat': repeat, **decoded}
            results.append(result)
            (output / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
            print(json.dumps({k: v for k, v in result.items() if k != 'text'}), flush=True)
    print('Evidence: ' + str(output), flush=True)


if __name__ == '__main__':
    main()
