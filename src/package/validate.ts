import * as fs from 'fs';
import * as path from 'path';
import { resolveContained, ContainmentError, isInside } from '../write/containment';
import { PackageDeclaration } from './types';
import { PackageValidationError, UnknownPackageError } from './errors';

/**
 * Validate the whole declared-packages array once, eagerly, before any single
 * package's deployment is attempted (ADR-009, resolves OQ-004): every source
 * root must be a readable directory (FR-046, AC-052); every destination root
 * must resolve inside `projectRoot` (FR-026, AC-012, AC-045); no two declared
 * packages' destination roots may overlap (FR-028, AC-014, AC-047); no declared
 * package's destination root may overlap a registered render target's
 * destination directory (FR-048, AC-056); no declared package's own
 * destination root may overlap its own source root (FR-052, WHY3 ISS-005).
 * Every rejection names the offending package id(s) and path.
 */
export function validatePackages(
  packages: PackageDeclaration[],
  projectRoot: string,
  renderTargetDirs: string[],
): void {
  const errors: string[] = [];
  const resolvedDest = new Map<string, string>();
  const resolvedSource = new Map<string, string>();

  for (const pkg of packages) {
    const sourceAbs = path.resolve(projectRoot, pkg.sourceRoot);
    if (isReadableDirectory(sourceAbs)) {
      resolvedSource.set(pkg.id, sourceAbs);
    } else {
      errors.push(
        `package "${pkg.id}": source root does not resolve to a readable directory: ${pkg.sourceRoot}`,
      );
    }

    try {
      resolvedDest.set(pkg.id, resolveContained(pkg.destinationRoot, projectRoot));
    } catch (e) {
      if (e instanceof ContainmentError) {
        errors.push(
          `package "${pkg.id}": destination root resolves outside the project root: ${pkg.destinationRoot}`,
        );
      } else {
        throw e;
      }
    }
  }

  for (let i = 0; i < packages.length; i++) {
    for (let j = i + 1; j < packages.length; j++) {
      const a = packages[i];
      const b = packages[j];
      const destA = resolvedDest.get(a.id);
      const destB = resolvedDest.get(b.id);
      if (destA && destB && overlaps(destA, destB)) {
        errors.push(`packages "${a.id}" and "${b.id}": destination roots overlap`);
      }
    }
  }

  for (const pkg of packages) {
    const dest = resolvedDest.get(pkg.id);
    if (!dest) continue;
    for (const rtDir of renderTargetDirs) {
      if (overlaps(dest, rtDir)) {
        errors.push(
          `package "${pkg.id}": destination root overlaps a registered render target's destination directory: ${rtDir}`,
        );
      }
    }
  }

  for (const pkg of packages) {
    const dest = resolvedDest.get(pkg.id);
    const src = resolvedSource.get(pkg.id);
    if (dest && src && overlaps(dest, src)) {
      errors.push(`package "${pkg.id}": destination root overlaps its own source root`);
    }
  }

  if (errors.length > 0) {
    throw new PackageValidationError(errors.join('\n'));
  }
}

/** Resolve a declared package by id, or throw UnknownPackageError (FR-047, AC-055). */
export function resolveDeclaredPackage(
  packages: PackageDeclaration[],
  packageId: string,
): PackageDeclaration {
  const found = packages.find((p) => p.id === packageId);
  if (!found) throw new UnknownPackageError(packageId);
  return found;
}

function isReadableDirectory(abs: string): boolean {
  try {
    if (!fs.statSync(abs).isDirectory()) return false;
    fs.accessSync(abs, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/** True when `a` and `b` are identical or one nests inside the other. */
function overlaps(a: string, b: string): boolean {
  return a === b || isInside(a, b) || isInside(b, a);
}
