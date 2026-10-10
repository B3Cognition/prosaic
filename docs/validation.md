# Read-only project validation

Validate canonical prose before distribution:

```sh
prosaic validate --json
prosaic validate --json --strict --targets claude-code
```

The command exits 0 for a valid report and 1 when errors exist. `--strict` also
fails on warnings. JSON stdout contains only the report; operational errors such
as an unknown target or invalid project configuration go to stderr and exit 1.
`prosaic validate --help` lists the additive command's options. Existing command
help remains compatible.

```python
from prosaic import validate_project

report = validate_project('/absolute/project/path', {'targets': ['claude-code']},
                          strict=True)
if not report['valid']:
    for issue in report['issues']:
        print(issue['code'], issue['artifactId'], issue['location'])
```

Reports use `schemaVersion: 1`, `valid`, `artifactCount`, `errorCount`,
`warningCount` and `issues`. `artifactCount` counts successfully discovered
canonical artifacts; invalid candidates contribute error issues. Each issue has
`code`, `severity`, `artifactId`, `location`, `message` and, for target-specific
issues, `targetId`. Fields are bounded; messages omit raw prose, rejected values
and parser snippets. Ordering follows artifact/target/code/location. Each call
returns independently owned data.

Malformed frontmatter, invalid classification, invalid canonical schema and
unresolved local references are errors. Canonical validation and bundle resource
references run even with `targets: []`, with unsupported targets, or when an
artifact type is excluded from target rendering. Bundle reference paths resolve
relative to their containing Markdown document, including backlinks to the
primary document; external URLs and fragment-only links are excluded.

Unsupported artifact/target pairs and lost intent are warnings by default.
Project configuration `lossyPolicy: error` elevates losses to errors while
collection continues. Rendering failures become safe `render-error` issues;
other artifacts, target diagnostics and detected losses remain in the report.

Validation reads canonical source and configuration, renders in memory and
performs no writes, manifest reads, project-lock acquisition, tool catalogue
execution, endpoint/version probes or model calls. Concurrent writers can change
files while validation reads them; run CI against an immutable source checkout
when a reproducible snapshot is required.

Canonical validity does not authorize execution. Applications using Runtime or
Harness still admit workflows, resolve private host bindings and enforce their
tool permissions, budgets and resource access independently of prose.
