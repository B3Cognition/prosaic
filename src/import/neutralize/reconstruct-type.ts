import * as path from 'path';
import { ArtifactType } from '../../domain/types';
import { TargetDescriptor, slotFor } from '../../registry/descriptor';
import { Warning } from '../../domain/warnings';

export interface ReconstructTypeResult {
  type: ArtifactType;
  warnings: Warning[];
  defaultedChoices: string[];
}

/**
 * Reconstruct exactly 1 artifact type from the deployment directory convention
 * (FR-014, FR-057). When the lane maps to 2+ types, select the documented default
 * and warn (FR-015, FR-058). Never uses the lane alone — always uses the directory.
 *
 * Routing logic (inverse of stage8-route.ts):
 * - File in slots.command.dir → command
 * - File in slots.skill.dir → skill
 * - File in slots.agent.dir → subagent (default; warns if ambiguous with rule)
 * - File in destinationDir (not in a specific slot) → rule
 */
export function reconstructType(
  fileRelToRoot: string,
  desc: TargetDescriptor,
  foreignPath: string,
): ReconstructTypeResult {
  const fileDir = path.posix.dirname(fileRelToRoot);
  const warnings: Warning[] = [];
  const defaultedChoices: string[] = [];

  // Check each typed slot in priority order: command, skill, agent
  const commandSlot = desc.slots?.command;
  if (commandSlot && dirMatches(fileDir, commandSlot.dir)) {
    return { type: 'command', warnings, defaultedChoices };
  }

  const skillSlot = desc.slots?.skill;
  if (skillSlot && dirMatches(fileDir, skillSlot.dir)) {
    return { type: 'skill', warnings, defaultedChoices };
  }

  const agentSlot = desc.slots?.agent;
  const agentSlotDir = agentSlot?.dir ?? desc.destinationDir;
  const isAgentSlotDistinct = agentSlot && agentSlot.dir !== desc.destinationDir;

  if (dirMatches(fileDir, agentSlotDir)) {
    if (isAgentSlotDistinct) {
      // Distinct agent slot: files here are subagents (rules go to destinationDir)
      return { type: 'subagent', warnings, defaultedChoices };
    }
    // Agent slot == destinationDir: only ambiguous when descriptor supports BOTH rule and subagent.
    // If the descriptor supports only rule (no subagent capability), there is no ambiguity.
    if (desc.capabilities.subagent && desc.capabilities.rule) {
      const choice = 'artifact-type:rule (default over subagent; agent slot dir == destinationDir)';
      defaultedChoices.push(choice);
      warnings.push({
        kind: 'defaulted-choice',
        artifact: foreignPath,
        target: desc.id,
        message:
          `File "${foreignPath}" is in the agent-slot directory that also serves as destinationDir. ` +
          `Artifact type is ambiguous (rule or subagent); defaulting to "rule". ` +
          `If this is a subagent, add type: subagent to the neutral frontmatter.`,
      });
    }
    return { type: 'rule', warnings, defaultedChoices };
  }

  // Fallback: destinationDir → rule
  return { type: 'rule', warnings, defaultedChoices };
}

function dirMatches(fileDir: string, slotDir: string): boolean {
  const norm = (s: string) => s.replace(/^\.\//, '').replace(/\/$/, '');
  const normFile = norm(fileDir);
  const normSlot = norm(slotDir);

  if (normSlot === '' || normSlot === '.') {
    return normFile === '' || normFile === '.';
  }
  return normFile === normSlot || normFile.startsWith(normSlot + '/');
}
