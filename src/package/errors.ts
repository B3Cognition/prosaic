/**
 * Raised when one or more declared packages fail cross-package/destination/
 * source validation (FR-026, FR-028, FR-046, FR-048, FR-052). Every rejection
 * names the offending package id(s) and path (T-002).
 */
export class PackageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackageValidationError';
  }
}

/**
 * Raised when a package deployment/revert invocation's supplied package id
 * matches no declared package (FR-047, AC-055) — the caller writes 0 files.
 */
export class UnknownPackageError extends Error {
  constructor(public readonly packageId: string) {
    super(`Unknown package: "${packageId}" is not a declared package`);
    this.name = 'UnknownPackageError';
  }
}
