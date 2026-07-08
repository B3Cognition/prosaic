import { TargetDescriptor, parseDescriptor } from '../../src/registry/descriptor';

/** Build a valid target descriptor for tests, with selective overrides. */
export function makeDescriptor(over: Partial<TargetDescriptor> = {}): TargetDescriptor {
  const base = {
    id: 'test-target',
    label: 'Test Target',
    destinationDir: '.test/rules',
    format: 'markdown' as const,
    extension: '.md',
    argumentToken: '$ARG',
    frontmatter: { strip: [], passthrough: '*', inject: {} },
    capabilities: { rule: true, skill: true, subagent: true, command: true },
    naming: { from: 'filename' as const, casing: 'original' as const },
    translations: {},
  };
  return parseDescriptor({ ...base, ...over });
}
