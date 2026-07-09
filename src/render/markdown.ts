import { Frontmatter } from '../domain/types';
import { dumpYaml } from './yaml';

/**
 * Canonical Markdown emitter (FR-020). Emits a YAML frontmatter block (when the
 * map is non-empty) followed by the body. Trailing whitespace is normalized to a
 * single terminating newline so repeated renders are byte-identical (FR-021).
 */
export function renderMarkdown(fm: Frontmatter, body: string): string {
  const normalizedBody = body.replace(/\s+$/, '') + '\n';

  if (Object.keys(fm).length === 0) {
    return normalizedBody;
  }

  const yamlText = dumpYaml(fm);
  return `---\n${yamlText}---\n\n${normalizedBody}`;
}
