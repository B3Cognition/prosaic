import * as path from 'path';
import { TargetDescriptor, slotFor } from '../../registry/descriptor';
import { DEPLOYMENT_TYPES } from '../../domain/types';

/** A directory + extension pair that identifies files belonging to one slot. */
export interface SlotSignature {
  dir: string;
  extension: string;
  descriptorId: string;
}

/**
 * Index of directory-signature entries keyed by normalized directory path.
 * Used by detectFormat to resolve exactly 1 matching descriptor per file (FR-008).
 */
export class SignatureIndex {
  private readonly entries: SlotSignature[];

  private constructor(entries: SlotSignature[]) {
    this.entries = entries;
  }

  /**
   * Build the index from the full descriptor set (read-only; registry unmodified).
   * Each descriptor contributes one entry per deployment slot plus its destinationDir.
   */
  static build(descriptors: TargetDescriptor[]): SignatureIndex {
    const entries: SlotSignature[] = [];

    for (const desc of descriptors) {
      const seen = new Set<string>();

      // destinationDir is always a valid deployment dir (for rules and fallback)
      const addSlot = (dir: string, ext: string) => {
        const key = `${dir}|${ext}`;
        if (!seen.has(key)) {
          seen.add(key);
          entries.push({ dir, extension: ext, descriptorId: desc.id });
        }
      };

      addSlot(desc.destinationDir, desc.extension);

      for (const dt of DEPLOYMENT_TYPES) {
        const slot = desc.slots?.[dt];
        if (slot) {
          addSlot(slot.dir, slot.extension ?? desc.extension);
        }
      }
    }

    return new SignatureIndex(entries);
  }

  /**
   * Return descriptor IDs whose signature matches this file.
   * A file matches a signature when its parent directory equals or is nested within
   * the signature directory, AND its extension matches (FR-008).
   */
  matchFile(fileRelToRoot: string): string[] {
    const fileDir = path.posix.dirname(fileRelToRoot);
    const fileExt = path.posix.extname(fileRelToRoot);
    const matched = new Set<string>();

    for (const entry of this.entries) {
      if (!extensionMatches(fileExt, entry.extension)) continue;
      if (dirMatches(fileDir, entry.dir)) {
        matched.add(entry.descriptorId);
      }
    }

    return [...matched];
  }

  /** All slot signatures (for testing). */
  all(): SlotSignature[] {
    return [...this.entries];
  }
}

/** True when the file dir equals or is nested inside the slot dir. */
function dirMatches(fileDir: string, slotDir: string): boolean {
  const normalSlot = slotDir.replace(/^\.\//, '').replace(/\/$/, '');
  const normalFile = fileDir.replace(/^\.\//, '').replace(/\/$/, '');

  if (normalSlot === '' || normalSlot === '.') {
    // Root-level slot: file must be directly in root (not in a subdirectory of a known slot)
    return normalFile === '' || normalFile === '.';
  }

  return normalFile === normalSlot || normalFile.startsWith(normalSlot + '/');
}

function extensionMatches(fileExt: string, slotExt: string): boolean {
  // Normalize: slotExt may be '.md', '.toml', '.mdc', '.instructions.md', '.prompt.md', etc.
  // fileExt from path.extname is the last extension (e.g. for 'foo.instructions.md' it's '.md')
  // So we check whether the file name ends with the full slot extension.
  // We'll use a suffix check instead.
  return fileExt === slotExt || slotExt.endsWith(fileExt);
}
