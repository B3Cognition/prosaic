#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { apply, revert } from '../lifecycle/run';
import { surfaceWarnings } from '../lifecycle/warnings';
import { CliOverrides } from '../config/cli-override';
import { ConfigError } from '../config/load';
import { UnknownTargetError } from '../registry/registry';
import { ManifestError } from '../manifest/manifest';
import { LossyTransformError } from '../vocabulary/lossy';
import { importRun } from '../import/run';
import { formatPortabilityReport, formatRunSummary } from '../import/report';
import { resolveExecutionData } from '../resolve/lookup';
import { inspectArtifact } from '../inspect/lookup';
import { deployPackage, revertPackage } from '../package/run';
import { PackageValidationError, UnknownPackageError } from '../package/errors';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../package.json') as { version: string };

function toOverrides(argv: {
  targets?: string[];
  types?: string[];
  source?: string;
  lossy?: string;
}): CliOverrides {
  const cli: CliOverrides = {};
  if (argv.targets && argv.targets.length > 0) cli.targets = argv.targets;
  if (argv.types && argv.types.length > 0) cli.artifactTypes = argv.types;
  if (argv.source) cli.source = argv.source;
  if (argv.lossy === 'warn' || argv.lossy === 'error') cli.lossyPolicy = argv.lossy;
  return cli;
}

function reportError(e: unknown): number {
  if (
    e instanceof ConfigError ||
    e instanceof UnknownTargetError ||
    e instanceof ManifestError ||
    e instanceof LossyTransformError ||
    e instanceof PackageValidationError ||
    e instanceof UnknownPackageError
  ) {
    process.stderr.write(`error: ${e.message}\n`);
    return 1;
  }
  process.stderr.write(`error: ${(e as Error).message}\n`);
  return 1;
}

export async function main(args: string[]): Promise<number> {
  let exitCode = 0;

  await yargs(hideBin(args.length ? args : process.argv))
    .scriptName('prosaic')
    .version(pkg.version)
    .option('targets', {
      type: 'array',
      string: true,
      describe: 'Target identifiers to distribute to (overrides config)',
    })
    .option('types', {
      type: 'array',
      string: true,
      describe: 'Artifact types to distribute (rule|skill|subagent|command)',
    })
    .option('source', { type: 'string', describe: 'Source-of-truth directory' })
    .option('lossy', { choices: ['warn', 'error'], describe: 'Lossy-transform policy' })
    .command(
      ['apply', '$0'],
      'Render and write selected artifacts to every selected supporting target',
      (y) => y.option('dry-run', { type: 'boolean', default: false }),
      (argv) => {
        try {
          const report = apply({
            projectRoot: process.cwd(),
            cli: toOverrides(argv as any),
            dryRun: argv['dry-run'] as boolean,
          });
          for (const line of report.preview) process.stdout.write(line + '\n');
          for (const line of surfaceWarnings(report.warnings)) process.stdout.write(line + '\n');
          if (report.zeroTargets) {
            process.stdout.write('0 targets selected; nothing to do.\n');
          } else if (!report.dryRun) {
            process.stdout.write(
              `apply: ${report.created} created, ${report.overwritten} overwritten, ` +
                `${report.unchanged} unchanged, ${report.removed} removed, ` +
                `${report.backedUp} backed up. ${report.changedFiles} changed file(s).\n`,
            );
          }
        } catch (e) {
          exitCode = reportError(e);
        }
      },
    )
    .command(
      'import [path]',
      'Import existing tool prose into neutral prosaic source (inverse of apply)',
      (y) =>
        y
          .positional('path', {
            type: 'string',
            describe: 'Foreign directory to import from (defaults to current directory)',
          })
          .option('format', {
            type: 'string',
            describe: 'Explicit format identifier (bypasses auto-detection)',
          })
          .option('dry-run', { type: 'boolean', default: false })
          .option('overwrite', { type: 'boolean', default: false }),
      (argv) => {
        try {
          const report = importRun({
            projectRoot: process.cwd(),
            foreignDir: (argv as any).path as string | undefined,
            format: (argv as any).format as string | undefined,
            sourceDir: (argv as any).source as string | undefined,
            dryRun: argv['dry-run'] as boolean,
            overwrite: argv['overwrite'] as boolean,
          });
          for (const line of report.preview) process.stdout.write(line + '\n');
          for (const line of formatRunSummary(report)) process.stdout.write(line + '\n');
          for (const line of formatPortabilityReport(report)) process.stdout.write(line + '\n');
          for (const w of report.allWarnings) {
            const where = [w.artifact, w.target].filter(Boolean).join(' → ');
            process.stderr.write(
              `warning[${w.kind}]${where ? ' ' + where : ''}: ${w.message}\n`,
            );
          }
          const hasErrors = report.files.some((f) => !f.outcome.ok);
          if (hasErrors) exitCode = 1;
        } catch (e) {
          exitCode = reportError(e);
        }
      },
    )
    .command(
      'revert',
      'Remove previously distributed tool-generated files',
      (y) => y.option('dry-run', { type: 'boolean', default: false }),
      (argv) => {
        try {
          const report = revert({
            projectRoot: process.cwd(),
            cli: toOverrides(argv as any),
            dryRun: argv['dry-run'] as boolean,
          });
          for (const line of report.preview) process.stdout.write(line + '\n');
          if (!report.dryRun) {
            process.stdout.write(`revert: ${report.removed} file(s) removed.\n`);
          }
        } catch (e) {
          exitCode = reportError(e);
        }
      },
    )
    .command(
      'resolve <artifactId>',
      "Resolve one artifact-target pair's execution settings without writing any file",
      (y) =>
        y
          .positional('artifactId', {
            type: 'string',
            describe: 'Artifact id to resolve (source-relative path)',
          })
          .option('target', {
            type: 'string',
            describe: 'Target identifier to resolve against',
            demandOption: true,
          }),
      (argv) => {
        const result = resolveExecutionData({
          projectRoot: process.cwd(),
          artifactId: argv.artifactId as string,
          targetId: argv.target as string,
          cli: toOverrides(argv as any),
        });
        if (result.ok) {
          process.stdout.write(JSON.stringify(result.data) + '\n');
        } else {
          process.stderr.write(`error: ${result.message}\n`);
          exitCode = 1;
        }
      },
    )
    .command(
      'inspect <artifactId>',
      "Return full data for one discovered artifact (identifier, type, frontmatter, body, bundle root, resources) as JSON",
      (y) =>
        y
          .positional('artifactId', {
            type: 'string',
            describe: 'Artifact id to inspect (source-relative path)',
          })
          .option('json', {
            type: 'boolean',
            describe: 'Accepted for compatibility; output is always machine-readable JSON regardless of this flag',
          }),
      (argv) => {
        const result = inspectArtifact({
          projectRoot: process.cwd(),
          artifactId: argv.artifactId as string,
          cli: toOverrides(argv as any),
        });
        if (result.ok) {
          process.stdout.write(JSON.stringify(result.data) + '\n');
        } else {
          process.stderr.write(`error: ${result.message}\n`);
          exitCode = 1;
        }
      },
    )
    .command(
      'package',
      'Package deployment commands (generic, application-agnostic)',
      (y) =>
        y
          .command(
            'deploy <packageId>',
            'Deploy a declared package into its configured destination',
            (yy) =>
              yy
                .positional('packageId', {
                  type: 'string',
                  describe: 'Declared package id to deploy',
                })
                .option('dry-run', { type: 'boolean', default: false }),
            (argv) => {
              try {
                const report = deployPackage({
                  projectRoot: process.cwd(),
                  packageId: argv.packageId as string,
                  dryRun: argv['dry-run'] as boolean,
                });
                for (const line of report.preview) process.stdout.write(line + '\n');
                for (const line of surfaceWarnings(report.warnings)) {
                  process.stdout.write(line + '\n');
                }
                if (!report.dryRun) {
                  process.stdout.write(
                    `package deploy ${report.packageId}: ${report.created} created, ` +
                      `${report.overwritten} overwritten, ${report.unchanged} unchanged, ` +
                      `${report.removed} removed, ${report.backedUp} backed up.\n`,
                  );
                }
              } catch (e) {
                exitCode = reportError(e);
              }
            },
          )
          .command(
            'revert <packageId>',
            'Remove exactly the files recorded as belonging to a declared package',
            (yy) =>
              yy
                .positional('packageId', {
                  type: 'string',
                  describe: 'Declared package id to revert',
                })
                .option('dry-run', { type: 'boolean', default: false }),
            (argv) => {
              try {
                const report = revertPackage({
                  projectRoot: process.cwd(),
                  packageId: argv.packageId as string,
                  dryRun: argv['dry-run'] as boolean,
                });
                for (const line of report.preview) process.stdout.write(line + '\n');
                if (!report.dryRun) {
                  process.stdout.write(
                    `package revert ${report.packageId}: ${report.removed} file(s) removed.\n`,
                  );
                }
              } catch (e) {
                exitCode = reportError(e);
              }
            },
          )
          .demandCommand(1),
    )
    .demandCommand(0)
    .strict()
    .help()
    .parseAsync();

  return exitCode;
}

if (require.main === module) {
  main(process.argv).then((code) => {
    process.exitCode = code;
  });
}
