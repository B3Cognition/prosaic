# Package Deployment

Prosaic's package deployment mechanism is a **generic, application-agnostic**
capability: any application maintainer can declare and deploy their own
package, using the identical mechanism, with zero Prosaic code that names or
depends on any specific consuming application. Any application shown below
(for example, an "Echelon"-shaped example) is an **example application, not a
Prosaic dependency** — it illustrates the shape of a package, nothing more.

Package deployment is distinct from Prosaic's existing render-oriented
`apply`/`render`/`inspect`/`import`/`revert` commands and coexists unmodified
alongside them: a project with no declared packages behaves identically to a
project without this feature.

## Package Source Layout

A declared package's `sourceRoot` contains two kinds of content:

- **Neutral Artifact Tree** — the top-level `commands/` and `subagents/`
  directories, and nothing else. Every file underneath, including companion
  resource files, travels automatically with no per-file configuration. This
  content is copied byte-identical to the deployment destination; it is never
  passed through Prosaic's render pipeline (no path rewrite, name rewrite,
  argument-placeholder rewrite, neutral-behavior translation, frontmatter
  rewrite, format conversion, or deployment-type routing).
- **Package Runtime Tree** — every other top-level entry in the package
  source, of any file type, at any depth (workflow documents, templates,
  scripts, configuration, schemas, binaries). This content is copied
  opaquely, verbatim: it is never parsed, classified, or validated as a
  Prosaic artifact, and it is never included in Prosaic's own artifact
  discovery pass for the project's `source:` directory.

Example package source tree:

```
my-example-app-package/
  commands/
    deploy.md
  subagents/
    reviewer/
      AGENT.md
  templates/
    workflow.md.tmpl
  scripts/
    setup.sh
```

Here, "my-example-app-package" is an **example application's package layout,
not a Prosaic dependency** — the mechanism does not know or care what
application declared it.

## Declaring a Package

Declare one or more named packages in `prosaic.config.yaml`:

```yaml
packages:
  - id: my-example-app
    sourceRoot: vendor/my-example-app-package
    destinationRoot: .my-example-app
```

Each entry requires exactly 3 fields — `id`, `sourceRoot`, `destinationRoot`
— with no additional keys. `packages` is fully optional; omitting it leaves
every other configuration section, and all existing render-target behavior,
completely unchanged.

## Command Usage

```bash
prosaic package deploy <packageId>
prosaic package deploy <packageId> --dry-run

prosaic package revert <packageId>
prosaic package revert <packageId> --dry-run
```

- `<packageId>` is required and must match a declared package's `id`; an
  unrecognized id is rejected with a non-zero exit code and an error naming
  the supplied id, writing 0 files.
- `--dry-run` previews every targeted file's classification (`create`,
  `overwrite`, `unchanged`, `remove`) without writing to disk.
- A real `deploy` run copies the Neutral Artifact Tree and Package Runtime
  Tree into the declared `destinationRoot`, backs up any content-changing
  overwrite before writing it, and removes any previously-deployed file the
  current package source no longer produces (reconcile-on-produce) —
  without ever touching a file it did not itself deploy.
- Re-running deployment against an unchanged package source produces 0
  content-differing writes; a deployment interrupted after it has begun
  modifying the destination always converges to a fully consistent state via
  exactly one subsequent re-run, with 0 manual repair steps.
- `prosaic package revert <packageId>` (Should-Have) mirrors the
  provenance-guarded revert behavior already provided for render-target
  output: it removes exactly the files recorded as belonging to the declared
  package, touching 0 Foreign Paths. `deploy` against an emptied package
  source achieves the same guarantee via reconcile-on-produce, so `revert`
  is an explicit, ergonomic entry point rather than the only way to remove a
  package's output.

**Concurrency limitation:** two simultaneous invocations that write to the
same project's shared provenance record — whether two package deployments, or
a package deployment running alongside an existing render-target operation
(`apply`/`revert`) — is an unsupported, user-managed scenario. Do not run two
such invocations against the same project at the same time.

## Provenance and Ownership

Every file a package deployment writes is recorded in the same
provenance-tracking manifest already used for render-target output, under a
package-specific identifier distinct from every render-target identifier and
every other declared package's identifier. A **Provenance-Guarded
Operation** — deployment or reconciliation — only ever affects
Prosaic-managed package output recorded under that operation's own package
identifier: it never touches a Foreign Path (a file recorded under another
package, under a render target, or under no record at all), and it never
touches a hand-authored file that Prosaic never wrote. An absent or corrupt
provenance record aborts the operation with 0 files removed rather than
guessing which files it owns.
