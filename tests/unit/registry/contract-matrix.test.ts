import * as fs from 'fs';
import * as path from 'path';
import { builtinRegistry } from '../../../src/registry/builtin';

const MATRIX = path.join(__dirname, '..', '..', '..', 'src', 'registry', 'adapters', 'contract-matrix.md');

/** Parse the target ids from the first column of the contract-matrix table. */
function matrixIds(): string[] {
  const text = fs.readFileSync(MATRIX, 'utf8');
  const ids: string[] = [];
  for (const line of text.split('\n')) {
    const m = /^\|\s*([a-z0-9][a-z0-9-]*)\s*\|/.exec(line);
    if (m && m[1] !== 'id' && m[1] !== '---') ids.push(m[1]);
  }
  return ids;
}

describe('contract matrix (T-043)', () => {
  it('has one row per registered target, matching descriptor ids', () => {
    const ids = matrixIds();
    const registryIds = builtinRegistry().ids();
    expect([...ids].sort()).toEqual([...registryIds].sort());
  });

  it('covers at least 35 targets so the parity count is populatable', () => {
    expect(matrixIds().length).toBeGreaterThanOrEqual(35);
  });
});
