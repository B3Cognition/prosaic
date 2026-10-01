"""The diagnostic wrapper must never log authentication headers."""
import json
from pathlib import Path
import subprocess
import sys


def test_request_audit_preserves_credentials_without_logging_them(tmp_path):
    report = tmp_path / 'requests.json'
    program = tmp_path / 'request_fixture.py'
    program.write_text('''import urllib.request
request = urllib.request.Request('http://127.0.0.1/v1/chat/completions',
    data=b'{"model":"fixture","tools":[],"messages":[]}',
    headers={'Authorization': 'Bearer synthetic-secret'})
assert request.get_header('Authorization') == 'Bearer synthetic-secret'
''')
    wrapper = Path(__file__).resolve().parents[1] / 'scripts/audit_live_harness.py'
    result = subprocess.run([sys.executable, str(wrapper), str(report), str(program)],
                            text=True, capture_output=True)
    assert result.returncode == 0, result.stderr
    assert 'synthetic-secret' not in report.read_text() + result.stdout + result.stderr
    data = json.loads(report.read_text())
    assert data[0]['model'] == 'fixture'
    assert len(data[0]['sha256']) == 64
