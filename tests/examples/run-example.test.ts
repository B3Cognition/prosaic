import * as fs from 'fs';
import * as path from 'path';
import { compareOutput, copyDirToTempRoot } from './run-example';

const FIXTURES = path.join(__dirname, 'fixtures');

describe('compareOutput (T-003)', () => {
  it('returns pass: true for byte-identical stdout', () => {
    const expectedPath = path.join(FIXTURES, 'compare-identical.txt');
    fs.writeFileSync(expectedPath, 'apply: 4 created, 0 changed file(s).\n');
    try {
      const result = compareOutput('apply: 4 created, 0 changed file(s).\n', expectedPath);
      expect(result).toEqual({ pass: true, byteDiffCount: 0 });
    } finally {
      fs.rmSync(expectedPath);
    }
  });

  it('returns pass: false with byteDiffCount >= 1 for a single-byte divergence', () => {
    const expectedPath = path.join(FIXTURES, 'compare-divergent.txt');
    fs.writeFileSync(expectedPath, 'apply: 4 created, 0 changed file(s).\n');
    try {
      const result = compareOutput('apply: 5 created, 0 changed file(s).\n', expectedPath);
      expect(result.pass).toBe(false);
      expect(result.byteDiffCount).toBeGreaterThanOrEqual(1);
    } finally {
      fs.rmSync(expectedPath);
    }
  });

  it('returns pass: false with byteDiffCount >= 1 for a trailing-whitespace divergence', () => {
    const expectedPath = path.join(FIXTURES, 'compare-trailing.txt');
    fs.writeFileSync(expectedPath, 'apply: 4 created, 0 changed file(s).\n');
    try {
      const result = compareOutput('apply: 4 created, 0 changed file(s). \n', expectedPath);
      expect(result.pass).toBe(false);
      expect(result.byteDiffCount).toBeGreaterThanOrEqual(1);
    } finally {
      fs.rmSync(expectedPath);
    }
  });
});

describe('copyDirToTempRoot (T-003)', () => {
  it('includes only the source directory\'s own files, excluding sibling fixtures', () => {
    const sourceDir = path.join(FIXTURES, 'copy-source');
    const tempRoot = copyDirToTempRoot(sourceDir);
    try {
      expect(tempRoot.exists('marker.txt')).toBe(true);
      expect(tempRoot.exists('nested/nested-marker.txt')).toBe(true);
      expect(tempRoot.exists('valid-manifest.json')).toBe(false);
      expect(tempRoot.exists('invalid-manifest.json')).toBe(false);
    } finally {
      tempRoot.cleanup();
    }
  });
});
