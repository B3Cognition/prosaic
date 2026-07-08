import { Stage } from '../stage';
import { PipelineState } from '../state';
import { slotFor } from '../../registry/descriptor';

/** Join a directory and file name into a POSIX project-relative path. */
function joinPosix(dir: string, file: string): string {
  const d = dir.replace(/\/+$/, '');
  return d === '' ? file : `${d}/${file}`;
}

/**
 * Stage 8 — deployment-type routing (FR-023, FR-062). Place the artifact in
 * exactly one native slot per target selected by the Stage-0 deployment type,
 * producing exactly one primary output path. Rule artifacts land in the target's
 * declared rule directory (destinationDir); command/skill/agent artifacts use
 * their per-deployment slot.
 */
export const stage8Route: Stage = {
  index: 8,
  name: 'deployment-route',
  run(state: PipelineState): void {
    const { descriptor, artifact } = state;

    let dir: string;
    let extension: string;
    if (artifact.type === 'rule') {
      dir = descriptor.destinationDir;
      extension = descriptor.extension;
    } else {
      const slot = slotFor(descriptor, state.deploymentType);
      dir = slot.dir;
      extension = slot.extension ?? descriptor.extension;
    }

    const fileName = `${state.baseName}${extension}`;
    state.outputPath = joinPosix(dir, fileName);
  },
};
