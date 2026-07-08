import { Warning, WarningKind } from '../domain/warnings';

/**
 * Build a drop warning that names the offending file, so a malformed or invalid
 * artifact is dropped from the run with a report rather than aborting it
 * (FR-004, FR-005, NFR-010).
 */
export function dropWarning(kind: WarningKind, file: string, reason: string): Warning {
  return { kind, artifact: file, message: reason };
}
