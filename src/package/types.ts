/**
 * A named package-source-to-destination binding declared in project
 * configuration (FR-001, FR-036). Exactly 3 fields; no optional extras.
 */
export interface PackageDeclaration {
  id: string;
  sourceRoot: string;
  destinationRoot: string;
}
