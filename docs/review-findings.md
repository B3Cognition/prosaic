# Independent semantic review findings

Reviewed against frozen TypeScript commit `0f7e1878597ef4b52e6be26780c93d2a4db665a4` on 2026-10-01. Findings below were reproduced by calling the Python functions and the corresponding compiled `.reference/dist` functions with the same inputs. This is a discovery log, not a final parity approval: other agents are actively correcting these findings, so each needs a regression test and a fresh differential check before closure.

## Findings requiring closure before a consumer switch

1. **YAML numeric admission differs from js-yaml.** The initial `Loader` integer/float regexes coerce strings that js-yaml retains, and can throw while constructing valid string scalars. For `custom: -.5`, expected frontmatter is `{"custom":"-.5"}`, initially actual was `{"custom":-0.5}`. The same mismatch occurs for `+.5`, `1_`, `1__2`, `0b_1`, `0o_7`, `0x_F`, `1_e2`, `1._2`, `1_.2`, `+.nan`, `-.nan`, `0_1`, and `1.0_e3`. `custom: 0b_` / `0x_` / `0o_` are valid string values in TypeScript but initially raised Python `ValueError` from `int()`. This can drop a valid artifact: `name: 1_` is a valid skill name in TypeScript, but Python initially treated it as a number and failed schema validation. Relevant code: `compat.py` loader resolvers and `_integer`.

2. **Import's JSON serialization changes reconstructed prose.** Call `extract_body({'instructions': value}, '', 'instructions', 'f')`. With `1.0`, expected `body` is `"1"`; actual was `"1.0"`. With `-0.0`, expected `"0"`; actual `"-0.0"`. With `1e-7`, expected `"1e-7"`; actual `"1e-07"`. With `1e20`, expected `"100000000000000000000"`; actual `"1e+20"`. Non-string whole-file YAML instructions therefore produce different canonical body bytes. The same `_json` helper is used by injected-strip/override warnings and idempotency checks. Relevant code: `importing.py` `_json` and `extract_body`; CLI JSON output also needs JS-number serialization coverage.

3. **TOML local dates and local datetimes lose @iarna semantics.** Parse `date = 1979-05-27\nprompt="x"\n`. TypeScript JSON value is `"1979-05-27"`, whereas Python `_json` initially emitted `"1979-05-27T00:00:00.000Z"`. Parse `dt = 1979-05-27T07:32:00\nprompt="x"\n`: expected JSON value `"1979-05-27T07:32:00.000"`, actual initially added `Z`. Re-rendering the parsed frontmatter with body `x` also differs: TypeScript's enumerable date metadata produces `[date]\nisDate = true\n` or `[dt]\nisFloating = true\n` after the prompt; Python initially emitted `date = { }` / `dt = { }`. Offset datetimes matched in this probe. Relevant code: `importing.py` `parse_format`, `compat.py` `json_compatible`, `pipeline.py` `_coerce`.

4. **Locale comparison changes discovery and bundle primary choice.** Initial `js_sort_key` sorts `['a_b','a-b','a.b']` as `['a-b','a.b','a_b']`; Node `localeCompare` gives `['a_b','a-b','a.b']`. For `['_a','-a','.a']`, expected `['_a','-a','.a']`, actual initially `['-a','.a','_a']`. This changes artifact/resource/report/manifest order and, more seriously, the fallback primary when a bundle contains direct Markdown children without a preferred name. Root is replacing this approximation with a Unicode collator; verify the actual bundle-choice outcome as well as direct sorting.

5. **Admitted YAML tags have different runtime representations.** In a Markdown frontmatter block, `custom: !!set {a: null, b: null}` gives a plain mapping in TypeScript, initially a Python `set` and an inspect JSON `TypeError`. `custom: !!omap [{a: 1}, {b: 2}]` gives an array of maps in TypeScript, initially pairs in Python and different YAML bytes. `custom: !!binary SGVsbG8=` gives numeric-key JSON object in TypeScript, initially Python bytes and inspect JSON `TypeError`. TypeScript renders the binary back as `custom: !!binary SGVsbG8=\n`. Root has begun adding compatible representations; all three require parser, inspect JSON and format-render regressions.

6. **YAML numeric rendering is not byte-identical.** Directly dump `{'custom': 1e-7}`: expected `custom: 1.e-7\n`, initially actual `custom: 1e-7\n`. For `1e20`, expected plain integer digits, initially actual `custom: !!float "100000000000000000000"\n`. For `-0.0`, expected `custom: -0.0\n`, initially actual `custom: !!float "0"\n`. Admitted `custom: 9007199254740993` must parse/render as JS-rounded `9007199254740992`, not an arbitrary precision Python integer. Root is correcting these serializers/admission rules.

7. **Lifecycle/package registry injection was missing.** Frozen `apply(opts)` supports injected `registry`, `globalDir`, and `theme`; `deployPackage(opts)` supports an injected registry. Initial Python entry points could not apply a registered custom target and always wrote registry version `1.0.0`. A registry with version `2` must produce manifest `registryVersion: "2"`; custom descriptor destinations must participate in package overlap validation. Lifecycle agent has expanded these keyword signatures; differential integration tests should close this finding.

8. **Integral floating backup retention crashes on overwrite.** Both schemas correctly admit configuration `backupRetention: 3.0` (it is mathematically an integer), but Python initially retained the float. `BackupManager.backup` then slices `list_backups(...)[:-self.max_backups or None]`, raising `TypeError: slice indices must be integers or None or have an __index__ method`. The backup has already been written at that point, while the requested overwrite has not. Expected TypeScript apply/package deployment completes and retains the requested count. Values `0.0` and `1.0` have the same issue. Normalize the admitted retention value or cast the manager's bound before slicing. Relevant code: `config.py` `parse_config`, `filesystem.py` `BackupManager`.

9. **Malformed config diagnostics differ from strict schema contract.** For `{'artifactTypes':[None]}`, expected error text is `Rejected configuration from x: artifactTypes.0: Expected 'rule' | 'skill' | 'subagent' | 'command', received null`; initially Python instead emitted `Invalid enum value. Expected ... received 'null'`. Numbers/objects/booleans must similarly report received types, not quoted scalar stringifications. `lossyPolicy: null` / `false` has the same discrepancy. When a package has unknown key `x` and the root has unknown key `z`, expected `unknown key(s): x, z`, initially Python emitted `z, x`. Zod reports nested strict-object errors before the containing object's unknown keys. Relevant code: `config.py` `parse_config`.

## Packaging and runtime checks

- Production source audit found no subprocess, Node invocation, or `.reference` fallback. `node_os_error` only reproduces error text; `node_modules` appears only in directory exclusion lists.
- An isolated `python -m build --wheel` succeeded and produced `/tmp/prosaic-py-review-wheel/prosaic_py-0.1.0-py3-none-any.whl`.
- Wheel inventory contains all twelve `prosaic/*.py` modules and `prosaic/data/help.json`; the 40 built-in descriptors are embedded in `registry.py`. It contains no `.reference`, tests, or Node dependency. This confirms wheel inclusion at the point reviewed, not full installed-wheel functional parity.
- Package/lifecycle containment and provenance behavior were read against the frozen implementation. No new independent deletion/escape mismatch was established in this review; that is not a blanket safety approval. Python's cycle guard is a deliberate finite-tree safeguard where the TypeScript package walker can recurse indefinitely.

CLI styling work is being validated separately against original Jest tests and is intentionally excluded here.

## Closure review

`tests/test_review_regressions.py` initially passed 42 differential checks after the fixes. These cover the original numeric admission cases, non-string body JSON spelling, TOML local dates/datetimes, actual fallback bundle primary/resource selection, admitted set/omap/binary representations and bytes, numeric YAML dumping, custom registry apply and TypeScript reading a Python manifest, integral floating retention overwrites, and strict config diagnostics. The original reproduced cases in findings 1–9 therefore pass; this does not establish universal parser/collation parity.

Two follow-up holes were then reproduced and added as regression cases:

- **Malformed explicit YAML tags still require validation.** TypeScript rejects `!!set {a: 1}`, duplicate-key `!!omap [{a: 1}, {a: 2}]`, `!!binary "%%%%"`, overpadded `!!binary "SGVsbG8==="`, and wrong-kind `!!set []`; Python initially accepted them. Underpadded binary and multi-key pairs also need exact explicit-tag error text/location. These are constructor admission errors, not cosmetic serialization differences.
- **Signed zero in alternative integer forms still loses its sign.** Parse and render `custom: -00`, `-0x0`, `-0o0`, or `-0b0`: TypeScript emits `custom: -0.0\n`; Python initially emitted `custom: 0\n`. The ordinary `-0` case passed. This extends finding 6; preserve negative sign whenever a parsed integer's value is zero.

The final expanded suite passes all 54 cases (included in the 412-test full
run). Follow-up tag admission, error locations, and alternative signed-zero
forms are closed. The frozen parser treats the exact integer spelling `-0` as
positive zero; the longer zero spellings preserve negative zero. Both behaviors
now have explicit regression coverage.

The final installed wheel contains fourteen Python modules and help data. Its
standalone smoke test passed help, inspection, resolution, dry-run immutability,
apply, repeated apply, foreign import dry-run, and revert with Node absent from
PATH. The test imported from the wheel's `site-packages`, not editable sources.
