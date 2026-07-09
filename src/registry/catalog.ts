import { z } from 'zod';
import { RegistrySource } from './registry';
import { RegistryVersion, REGISTRY_VERSION } from './version';
import { TargetDescriptor, descriptorSchema } from './descriptor';
import { ALL_DESCRIPTORS } from './adapters';

const catalogSchema = z.object({
  version: z.string().optional(),
  descriptors: z.array(descriptorSchema),
});

/** A function that fetches raw catalog JSON (network, file, etc.). */
export type CatalogLoader = () => unknown;

export interface CatalogResult {
  descriptors: TargetDescriptor[];
  version: RegistryVersion;
  usedFallback: boolean;
}

/**
 * Validate a remote catalog before use and fall back to the built-in registry
 * when the catalog is unreachable or fails validation, so the run still
 * completes (FR-041, AC-028). This is Post-MVP and sits behind the registry seam.
 */
export function loadCatalogOrFallback(loader: CatalogLoader): CatalogResult {
  try {
    const raw = loader();
    const parsed = catalogSchema.safeParse(raw);
    if (!parsed.success) {
      return fallback();
    }
    return {
      descriptors: parsed.data.descriptors,
      version: parsed.data.version
        ? { ...REGISTRY_VERSION, version: parsed.data.version }
        : REGISTRY_VERSION,
      usedFallback: false,
    };
  } catch {
    return fallback();
  }
}

function fallback(): CatalogResult {
  return { descriptors: ALL_DESCRIPTORS, version: REGISTRY_VERSION, usedFallback: true };
}

/** A registry source backed by a validated remote catalog with built-in fallback. */
export class CatalogRegistrySource implements RegistrySource {
  private readonly result: CatalogResult;
  constructor(loader: CatalogLoader) {
    this.result = loadCatalogOrFallback(loader);
  }
  get usedFallback(): boolean {
    return this.result.usedFallback;
  }
  descriptors(): TargetDescriptor[] {
    return this.result.descriptors;
  }
  version(): RegistryVersion {
    return this.result.version;
  }
}
