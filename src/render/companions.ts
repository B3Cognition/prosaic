import { PipelineState } from '../pipeline/state';

export interface Companion {
  path: string;
  content: string;
}

/** Join a directory and file name into a POSIX project-relative path. */
function joinPosix(dir: string, file: string): string {
  const d = dir.replace(/\/+$/, '');
  return d === '' ? file : `${d}/${file}`;
}

/**
 * Build every companion file a target requires, alongside the primary output
 * (FR-022). Companion name/content templates expand `{name}` (primary base name)
 * and `{body}` (transformed body). A companion is additional to the primary, not
 * a second primary output.
 */
export function buildCompanions(state: PipelineState): Companion[] {
  const rules = state.descriptor.companions ?? [];
  if (rules.length === 0 || !state.outputPath) return [];

  const dir = state.outputPath.split('/').slice(0, -1).join('/');
  return rules.map((rule) => {
    const fileName = expand(rule.nameTemplate, state);
    return {
      path: joinPosix(dir, fileName),
      content: expand(rule.content, state),
    };
  });
}

function expand(template: string, state: PipelineState): string {
  return template.split('{name}').join(state.baseName).split('{body}').join(state.body);
}
