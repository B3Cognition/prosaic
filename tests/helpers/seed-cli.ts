import { TempRoot } from './temp-root';

/**
 * Shared CLI fixtures for the styling e2e specs. Each seeds a temp root so the
 * shipped binary exercises a specific output surface deterministically.
 */

/** A foreign `.clinerules` layout the importer auto-detects as `cline`. */
export function seedImportForeign(t: TempRoot): void {
  t.write('.clinerules/rule.md', '---\nname: my-rule\n---\n\nBody text.\n');
}

/** A neutral source + config that `apply` renders into two targets. */
export function seedApply(t: TempRoot): void {
  t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe concise.\n');
  t.write('.prosaic/commands/deploy.md', '---\ndescription: deploy\n---\nRun {{args}}.\n');
  t.write('prosaic.config.yaml', 'targets:\n  - claude-code\n  - cursor\n');
}

/**
 * A skill carrying an `effort` intent plus a skill-incapable target, forcing
 * exactly one lossy-intent warning and exactly one unsupported-pair warning on
 * apply (both surfaced on stdout per A-005).
 */
export function seedMandatoryWarnings(t: TempRoot): void {
  t.write('.prosaic/skills/greet/SKILL.md', '---\nname: greet\ndescription: d\neffort: high\n---\nBody\n');
  t.write('prosaic.config.yaml', 'targets:\n  - claude-code\n  - cursor\n');
}
