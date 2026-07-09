/**
 * Public import module surface (T-001, FR-001).
 * Import is the structural inverse of the apply pipeline: it reads foreign
 * tool prose, un-translates it into neutral form, and writes prosaic source.
 */
export { importRun } from './run';
export type { ImportReport, ImportRunOptions, FileReport, NeutralizedFile } from './types';
export { detectFormat, resolveExplicitFormat } from './detect/detect';
export { SignatureIndex } from './detect/signature-index';
export { buildInverseMap, applyInverseMap } from './neutralize/inverse-map';
export { stripInject } from './neutralize/strip-inject';
export { recoverOverrides } from './neutralize/recover-overrides';
export { reconstructType } from './neutralize/reconstruct-type';
export { invertArgs, CANONICAL_NEUTRAL_PLACEHOLDER } from './neutralize/invert-args';
export { extractBody } from './neutralize/extract-body';
export { neutralize } from './neutralize/neutralize';
export { validateGate } from './neutralize/validate-gate';
export { roundTrip, fidelityLevel } from './verify/round-trip';
export { writeSource } from './write/source-writer';
export { idempotencyCheck } from './verify/idempotency';
export { scanPortabilityIssues, classifyPathValue } from './portability/warnings';
export { buildImportReport, formatPortabilityReport, formatRunSummary } from './report';
export { unverifiedTargetWarning, IMPORT_STABLE_TARGETS } from './detect/parity';
