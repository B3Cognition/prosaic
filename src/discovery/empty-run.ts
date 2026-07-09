import { Artifact } from '../domain/types';

export interface EmptyRunReport {
  empty: boolean;
  message: string;
}

/**
 * Report whether discovery found zero artifacts, so a source of truth with no
 * discoverable artifacts yields a run that writes zero files (FR-053, AC-029).
 */
export function emptyRunReport(artifacts: Artifact[]): EmptyRunReport {
  const empty = artifacts.length === 0;
  return {
    empty,
    message: empty
      ? 'Empty run: 0 discoverable artifacts found; 0 files written.'
      : `${artifacts.length} artifact(s) discovered.`,
  };
}
