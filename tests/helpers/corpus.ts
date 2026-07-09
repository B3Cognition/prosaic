import { Registry, StaticRegistrySource } from '../../src/registry/registry';
import { makeDescriptor } from './descriptor-factory';
import { TempRoot } from './temp-root';

/** Write `count` synthetic rule + command artifacts into a temp source. */
export function seedCorpus(t: TempRoot, count: number): void {
  const half = Math.ceil(count / 2);
  for (let i = 0; i < half; i++) {
    t.write(`.prosaic/rules/rule-${i}.md`, `---\ndescription: rule ${i}\n---\nGuidance number ${i}.\n`);
  }
  for (let i = 0; i < count - half; i++) {
    t.write(
      `.prosaic/commands/cmd-${i}.md`,
      `---\ndescription: command ${i}\n---\nRun {{args}} for task ${i}.\n`,
    );
  }
}

/** Build a registry of `count` synthetic Markdown targets. */
export function syntheticRegistry(count: number): Registry {
  const descs = [];
  for (let i = 0; i < count; i++) {
    descs.push(
      makeDescriptor({
        id: `target-${i}`,
        destinationDir: `.tool-${i}/rules`,
        slots: { command: { dir: `.tool-${i}/commands`, extension: '.md' } },
      }),
    );
  }
  return new Registry(new StaticRegistrySource(descs));
}
