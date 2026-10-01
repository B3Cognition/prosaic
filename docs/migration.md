# Python migration specification

Reference: B3Cognition/prosaic commit
`0f7e1878597ef4b52e6be26780c93d2a4db665a4`.

Implement every existing command (`apply`, `revert`, `import`, `resolve`,
`inspect`, `package deploy`, `package revert`) in Python 3.11+ with the
executable name `prosaic`. Preserve canonical source, descriptors, naming,
rendered bytes, warnings, config precedence, manifests, backup retention,
containment, recovery and idempotency. Preserve library operations through
Python functions; TS type declarations are translated to Python contracts.
The reference remains available throughout migration. Do not switch production
consumers or obsolete TypeScript until parity and a real consumer trial succeed.

Completion requires differential comparison of stdout/stderr/exit codes and
filesystem outcomes, fixture coverage of every descriptor and artifact type,
malformed/adversarial input safety, and Runtime/Harness integration in an
isolated environment. Normalize only incidental absolute test-root paths and
timestamps, never generated prose or semantic output.

Interfaces: dictionaries retain original camelCase keys. Discovery produces
`{artifacts, warnings, report}`; artifacts contain `id`, `type`, `frontmatter`,
`body`, `sourcePath`, optional `bundleRoot`/`resources`; warnings use
`{kind, artifact?, target?, message}`. Module APIs are recorded in
the implementation plan. No production Node dependency.

## Reviewed safety rulings

Preserve the intended containment contract over the reference's dangling-link
escape bug: reject a symlink leading outside the project even if its target does
not yet exist. Bound package-directory symlink cycles instead of recursing
indefinitely. Both rulings have explicit regression tests and are intentional
behavioral differences, not hidden parity losses.
# Historical candidate plan

This document records the staged candidate migration against the earlier frozen
TS revision. Its instruction to retain TS applied before the authorized cutover.
Prosaic 0.3.0 now replaces the implementation in the original repository; see
[release notes](release-0.3.0.md) for current installation and compatibility.
