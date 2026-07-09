import { Frontmatter } from '../../domain/types';
import { TargetDescriptor } from '../../registry/descriptor';
import { Warning } from '../../domain/warnings';

export interface StripInjectResult {
  frontmatter: Frontmatter;
  warnings: Warning[];
}

/**
 * Remove every descriptor-injected key from the concrete frontmatter before
 * neutral reconstruction (FR-011, FR-012). Injected keys are never recorded under
 * overrides (FR-012) — they are stripped silently here, but a debug warning is
 * emitted so the strip is visible in the log (not silent per FR-022).
 */
export function stripInject(
  concreteFm: Frontmatter,
  desc: TargetDescriptor,
  foreignPath: string,
): StripInjectResult {
  const inject = desc.frontmatter.inject ?? {};
  const injectedKeys = Object.keys(inject);

  if (injectedKeys.length === 0) {
    return { frontmatter: { ...concreteFm }, warnings: [] };
  }

  const result: Frontmatter = {};
  const warnings: Warning[] = [];

  for (const [key, value] of Object.entries(concreteFm)) {
    if (key in inject) {
      // Only emit a warning if the value differs from the injected default,
      // indicating it was hand-modified (useful signal, not a silent drop).
      const injectedDefault = inject[key];
      if (JSON.stringify(value) !== JSON.stringify(injectedDefault)) {
        warnings.push({
          kind: 'injected-strip',
          artifact: foreignPath,
          message:
            `Stripping injected key "${key}" (descriptor-injected default: ${JSON.stringify(injectedDefault)}, ` +
            `found: ${JSON.stringify(value)}). Injected keys are never recorded as overrides (FR-012).`,
        });
      }
    } else {
      result[key] = value;
    }
  }

  return { frontmatter: result, warnings };
}
