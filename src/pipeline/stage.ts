import { PipelineState } from './state';

/** One ordered transformation stage (FR-011); applied exactly once by the runner. */
export interface Stage {
  /** 1-based position in the fixed 8-stage sequence. */
  readonly index: number;
  readonly name: string;
  run(state: PipelineState): void;
}
