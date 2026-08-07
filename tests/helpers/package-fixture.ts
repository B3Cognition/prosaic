import { TempRoot } from './temp-root';

/**
 * Generate a fixture package source spanning exactly `totalFiles` files across
 * the Neutral Artifact Tree (`commands/`, `subagents/`) and the Package
 * Runtime Tree (`scripts/`, `templates/`, `assets/`), for NFR-007 scale
 * testing (T-020/T-025/T-028).
 */
export function generateFixturePackage(t: TempRoot, pkgDir: string, totalFiles: number): void {
  const neutralCount = Math.floor(totalFiles / 2);
  const commandsCount = Math.ceil(neutralCount / 2);
  const subagentsCount = neutralCount - commandsCount;
  const runtimeCount = totalFiles - neutralCount;
  const runtimeDirs = ['scripts', 'templates', 'assets'];

  for (let i = 0; i < commandsCount; i++) {
    t.write(`${pkgDir}/commands/cmd-${i}.md`, `---\ndescription: cmd ${i}\n---\nRun ${i}.\n`);
  }
  for (let i = 0; i < subagentsCount; i++) {
    t.write(`${pkgDir}/subagents/agent-${i}/AGENT.md`, `---\nname: agent-${i}\n---\nAgent ${i}.\n`);
  }
  for (let i = 0; i < runtimeCount; i++) {
    const dir = runtimeDirs[i % runtimeDirs.length];
    t.write(`${pkgDir}/${dir}/file-${i}.txt`, `runtime content ${i}\n`);
  }
}
