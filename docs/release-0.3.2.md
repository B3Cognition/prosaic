# Prosaic 0.3.2

Adds the public, pure `validate_artifact_definition(kind, frontmatter)` helper
for canonical artifacts assembled in memory. It preserves extension fields and
the existing validation result contract. Existing parser, discovery, CLI and
on-disk formats remain compatible. Workflow admission and execution belong to
Harness and Runtime.

Local qualification passed 466 Python tests, the immutable v0.2.0 TypeScript
oracle's 55 original tests across 13 suites, wheel/source builds and the
installed-wheel smoke with Node hidden. The release requires the final commit's
Linux Python 3.11/3.12/3.13 matrix. Its published verification asset records the
native run, exact source commit and SHA256 checksums of downloadable assets.

Install from the immutable GitHub tag or wheel/source release assets. This
release is distributed through GitHub; no npm or PyPI publication is involved.
