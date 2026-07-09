import { Artifact, ArtifactType } from '../../src/domain/types';

/**
 * Representative artifacts — exactly one per artifact type — used to pin every
 * target's expected on-disk output as a golden conformance fixture. The same
 * inputs feed the golden generator and the conformance test so a fixture drift
 * signals a real behavior change.
 */
export const REPRESENTATIVE: Record<ArtifactType, Artifact> = {
  rule: {
    id: 'rules/style-guide.md',
    type: 'rule',
    frontmatter: { description: 'House code style guidance.' },
    body: '# Style Guide\n\nPrefer clarity over cleverness.\n',
    sourcePath: 'rules/style-guide.md',
  },
  command: {
    id: 'commands/deploy.md',
    type: 'command',
    frontmatter: { description: 'Deploy the app.' },
    body: 'Deploy using the arguments {{args}} and report status.\n',
    sourcePath: 'commands/deploy.md',
  },
  skill: {
    id: 'skills/greeter/SKILL.md',
    type: 'skill',
    frontmatter: { name: 'greeter', description: 'Greet the user warmly.' },
    body: 'Greet the user. See [reference](./reference.md).\n',
    sourcePath: 'skills/greeter/SKILL.md',
    bundleRoot: 'skills/greeter',
    resources: [{ relPath: 'reference.md', content: '# Reference\n\nGreeting templates.\n' }],
  },
  subagent: {
    id: 'subagents/reviewer.md',
    type: 'subagent',
    frontmatter: { name: 'reviewer', description: 'Reviews code for bugs.' },
    body: '# Reviewer\n\nReview the diff and report issues.\n',
    sourcePath: 'subagents/reviewer.md',
  },
};

export const ALL_TYPES: ArtifactType[] = ['rule', 'skill', 'subagent', 'command'];
