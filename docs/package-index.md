# Public package channel

Install the B3 distribution in a fresh Python 3.11+ environment:

```sh
python -m venv .venv
.venv/bin/python -m pip install 'b3-prosaic>=0.4,<0.5'
.venv/bin/prosaic --version
```

The Python import remains `prosaic`, and the command remains `prosaic`.
PyPI's package named `prosaic` belongs to an unrelated publisher. The previous
GitHub-only distributions and the B3 packages share installed module paths;
migrate with a fresh environment or image. Historical wheel caches remain
separate. Runtime and Harness use their matching `b3-prosaic-*` dependencies.

These instructions describe the configured channel. Availability is established
only after downloading and verifying the first published release.

## Trusted publisher registration

The family uses these exact publisher identities. Register pending entries in
the stages below, then retain the normal publishers. All use GitHub owner
`B3Cognition`, workflow filename `publish.yml`, and environment `pypi`:

| PyPI project | GitHub repository |
| --- | --- |
| `b3-prosaic` | `prosaic` |
| `b3-prosaic-runtime` | `prosaic-runtime` |
| `b3-prosaic-runtime-postgres` | `prosaic-runtime` |
| `b3-prosaic-harness` | `prosaic-harness` |
| `b3-prosaic-harness-postgres` | `prosaic-harness` |

PyPI permits only one pending project for the same GitHub
owner/repository/workflow/environment tuple. Bootstrap the family in stages:

1. Register `b3-prosaic`, `b3-prosaic-runtime` and `b3-prosaic-harness` as the
   initial pending entries for their three repositories.
2. Promote Core first. For each paired SDK release, its first successful OIDC
   exchange creates the main project and converts its pending publisher. That
   first paired attempt may publish matching main-package files and then fail
   because the adapter is not yet authorized.
3. Once that conversion is visible in the owning account, register the adapter's
   pending entry with the same tuple and repeat the guarded promotion using the
   original successful qualification run. The next exchange adds the adapter to
   the existing publisher; digest checks allow matching partial uploads to finish.

Retrying alone cannot register the adapter. GitHub release waits for the complete
verified pair. After bootstrap, one normal publisher can authorize both projects.
See PyPI's [pending uniqueness and publisher reuse implementation](https://github.com/pypi/warehouse/blob/f43a0f79dbaf40e4888110ad5b1d5e0ad87121b6/warehouse/oidc/models/github.py#L373-L416)
and [token exchange and scope](https://github.com/pypi/warehouse/blob/f43a0f79dbaf40e4888110ad5b1d5e0ad87121b6/warehouse/oidc/views.py#L208-L368).

Create the `pypi` environment in each SDK repository and restrict deployment to
the intended version tags. No long-lived API token is required. The official
[PyPI trusted publishing guide](https://docs.pypi.org/trusted-publishers/using-a-publisher/)
describes the owner setup; an authorized PyPI account must complete registration.
OIDC permission belongs only to the publication job. GitHub release write
permission belongs only to its separate release job. Action identities are
pinned to verified commits.

## Build, qualify, promote

Use **Publish SDK** with `publish=false` at the intended commit. It archives
that exact Git revision into a new directory, builds a wheel from its sdist,
and audits metadata, licenses, source payloads and wheel RECORD hashes. Tracked
working-tree edits and untracked files never enter the archive. Source files,
generated packaging metadata and installed payloads are checked separately.

`release-receipt.json` version1 binds the source commit and exact wheel/sdist
hashes. `SHA256SUMS` is human-readable. A build receipt makes no testing claim;
separate `qualification-*.json` records name commands that actually succeeded
against those hashes. Linux AMD64 and ARM64 run the full frozen migration and
installed-wheel checks on Python3.11/3.12/3.13. Windows runs native process-lock
checks on those Python versions. Every required record must match the exact
source and artifact bytes before publication can proceed.

For local preparation:

```sh
.venv/bin/python scripts/release_artifacts.py build --ref COMMIT \
  --output /tmp/prosaic-release-COMMIT --expect b3-prosaic=0.4.0
.venv/bin/python scripts/release_artifacts.py verify \
  --directory /tmp/prosaic-release-COMMIT/artifacts --commit COMMIT
```

Complete the ecosystem's downstream/native acceptance against these candidate
bytes before public uploads. Publish Core, Runtime and its recorder adapter,
Harness and its store adapter, then the lab. The train's final qualification
must include its intended source, dependency floors and four architecture/PG
cells; synthetic results do not certify live provider or staging capacity.

Tag the same source commit `v0.4.0`. Tags prepare candidates; they do not
automatically upload them. Dispatch **Publish SDK** on that tag with
`candidate_run_id` pointing to its successful exact-source build and
`publish=true`. Promotion downloads those original bytes and reruns the
required checks. It does not rebuild after qualification. Missing publisher
configuration fails the publication job rather than treating GitHub artifacts
as evidence of package-index availability.

Before and after PyPI publication, fetch the index's release metadata and actual
distribution files and compare their hashes. Matching existing bytes are an
idempotent success. An interrupted upload can resume its missing files after
every already present file is verified; the final check requires the complete
set. Different bytes require a new version. GitHub receives the
same distributions, checksums and qualification records, with no asset overwrite.
Update the lab's exact-version manifest only from verified public downloads.
