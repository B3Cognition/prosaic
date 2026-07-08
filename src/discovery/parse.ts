import * as yaml from 'js-yaml';
import { Frontmatter } from '../domain/types';

export interface ParsedArtifact {
  frontmatter: Frontmatter;
  body: string;
}

/** Raised when frontmatter delimiters or YAML are malformed (FR-004). */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse a raw Markdown-with-YAML-frontmatter string into exactly one frontmatter
 * map paired with exactly one Markdown body (FR-002). A file with no frontmatter
 * block yields an empty map and the whole text as the body. Malformed YAML or a
 * non-map frontmatter throws ParseError so the caller can drop-and-warn (FR-004).
 */
export function parseArtifact(raw: string): ParsedArtifact {
  const normalized = raw.replace(/^\uFEFF/, "");

  const m = FRONTMATTER_RE.exec(normalized);
  if (!m) {
    // Detect a half-open frontmatter block (opening --- with no closing ---).
    if (/^---\r?\n/.test(normalized)) {
      throw new ParseError('frontmatter block is not closed with a terminating "---"');
    }
    return { frontmatter: {}, body: normalized };
  }

  const [, fmText, body] = m;
  let loaded: unknown;
  try {
    loaded = yaml.load(fmText);
  } catch (e) {
    throw new ParseError(`invalid YAML frontmatter: ${(e as Error).message}`);
  }

  if (loaded === null || loaded === undefined) {
    return { frontmatter: {}, body };
  }
  if (typeof loaded !== 'object' || Array.isArray(loaded)) {
    throw new ParseError('frontmatter must be a YAML mapping');
  }

  return { frontmatter: loaded as Frontmatter, body };
}
