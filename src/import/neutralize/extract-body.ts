import { Frontmatter } from '../../domain/types';
import { Warning } from '../../domain/warnings';

export interface ExtractBodyResult {
  frontmatter: Frontmatter;
  body: string;
  warnings: Warning[];
}

/**
 * Extract a structured body field from the parsed document back into the neutral
 * artifact body (FR-018, FR-061, FR-083).
 *
 * When bodyField is defined:
 *   - If the field exists: extract its value as body, remove it from frontmatter (FR-083).
 *   - If the field is absent: set body to empty, emit 1 warning (FR-061).
 *
 * When bodyField is not defined: body comes from the caller (Markdown parse),
 * frontmatter is returned unchanged.
 */
export function extractBody(
  frontmatter: Frontmatter,
  inlineBody: string,
  bodyField: string | undefined,
  foreignPath: string,
): ExtractBodyResult {
  if (!bodyField) {
    return { frontmatter: { ...frontmatter }, body: inlineBody, warnings: [] };
  }

  const fm = { ...frontmatter };
  const warnings: Warning[] = [];

  if (bodyField in fm) {
    const raw = fm[bodyField];
    const body = typeof raw === 'string' ? raw : JSON.stringify(raw);
    delete fm[bodyField];
    return { frontmatter: fm, body, warnings };
  }

  // Body field declared but absent in the file (FR-061)
  warnings.push({
    kind: 'malformed-frontmatter',
    artifact: foreignPath,
    message:
      `Target body field "${bodyField}" is declared by the descriptor but absent from ` +
      `the imported file "${foreignPath}". Setting neutral body to empty.`,
  });

  return { frontmatter: fm, body: '', warnings };
}
