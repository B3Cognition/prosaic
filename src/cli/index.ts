#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { apply, revert } from '../lifecycle/run';
import { surfaceWarnings, formatWarningLine } from '../lifecycle/warnings';
import { CliOverrides } from '../config/cli-override';
import { ConfigError } from '../config/load';
import { UnknownTargetError } from '../registry/registry';
import { ManifestError } from '../manifest/manifest';
import { LossyTransformError } from '../vocabulary/lossy';
import { importRun } from '../import/run';
import { formatPortabilityReport, formatRunSummary } from '../import/report';
import { resolvePresentation } from './presentation';
import { Theme, themeFor } from './theme';

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

/** The theme resolved independently for each output stream (FR-005, FR-016). */
interface StreamThemes {
  /** Theme for stdout — where previews, summaries, and apply warnings print. */
  out: Theme;
  /** Theme for stderr — where errors and import warnings print. */
  err: Theme;
}

/**
 * Resolve stdout and stderr presentation independently so exactly one of two
 * mixed-interactivity streams carries ANSI (FR-005). `colorFlag` comes from the
 * global `--color` / `--no-color` option and overrides the environment.
 */
function resolveThemes(colorFlag?: boolean): StreamThemes {
  return {
    out: themeFor(
      resolvePresentation({ isTTY: process.stdout.isTTY, env: process.env, colorFlag }),
    ),
    err: themeFor(
      resolvePresentation({ isTTY: process.stderr.isTTY, env: process.env, colorFlag }),
    ),
  };
}

/**
 * Report a caught error on stderr with the consistent `error: ` prefix (FR-009).
 * The severity token is colored red only when stderr is styled; under the plain
 * theme the line begins with the literal prefix `error: ` and returns exit 1
 * (FR-030).
 */
function reportError(e: unknown, errTheme: Theme): number {
  const prefix = errTheme.errorPrefix('error:');
  if (
    e instanceof ConfigError ||
    e instanceof UnknownTargetError ||
    e instanceof ManifestError ||
    e instanceof LossyTransformError
  ) {
    process.stderr.write(`${prefix} ${e.message}\n`);
    return 1;
  }
  process.stderr.write(`${prefix} ${(e as Error).message}\n`);
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
    .option('color', {
      type: 'boolean',
      describe: 'Force colored output on, or off with --no-color (auto-detected by default)',
    })
    .command(
      ['apply', '$0'],
      'Render and write selected artifacts to every selected supporting target',
      (y) => y.option('dry-run', { type: 'boolean', default: false }),
      (argv) => {
        const themes = resolveThemes((argv as any).color as boolean | undefined);
        try {
          const report = apply({
            projectRoot: process.cwd(),
            cli: toOverrides(argv as any),
            dryRun: argv['dry-run'] as boolean,
            theme: themes.out,
          });
          for (const line of report.preview) process.stdout.write(line + '\n');
          // Apply warnings stay on stdout (A-005): preserve the pre-enhancement stream.
          for (const line of surfaceWarnings(report.warnings, themes.out)) {
            process.stdout.write(line + '\n');
          }
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
          exitCode = reportError(e, themes.err);
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
        const themes = resolveThemes((argv as any).color as boolean | undefined);
        try {
          const report = importRun({
            projectRoot: process.cwd(),
            foreignDir: (argv as any).path as string | undefined,
            format: (argv as any).format as string | undefined,
            sourceDir: (argv as any).source as string | undefined,
            dryRun: argv['dry-run'] as boolean,
            overwrite: argv['overwrite'] as boolean,
            theme: themes.out,
          });
          for (const line of report.preview) process.stdout.write(line + '\n');
          for (const line of formatRunSummary(report, themes.out)) process.stdout.write(line + '\n');
          for (const line of formatPortabilityReport(report, themes.out)) {
            process.stdout.write(line + '\n');
          }
          // Import warnings stay on stderr (A-005): preserve the pre-enhancement stream.
          for (const w of report.allWarnings) {
            process.stderr.write(formatWarningLine(w, themes.err) + '\n');
          }
          const hasErrors = report.files.some((f) => !f.outcome.ok);
          if (hasErrors) exitCode = 1;
        } catch (e) {
          exitCode = reportError(e, themes.err);
        }
      },
    )
    .command(
      'revert',
      'Remove previously distributed tool-generated files',
      (y) => y.option('dry-run', { type: 'boolean', default: false }),
      (argv) => {
        const themes = resolveThemes((argv as any).color as boolean | undefined);
        try {
          const report = revert({
            projectRoot: process.cwd(),
            cli: toOverrides(argv as any),
            dryRun: argv['dry-run'] as boolean,
            theme: themes.out,
          });
          for (const line of report.preview) process.stdout.write(line + '\n');
          if (!report.dryRun) {
            process.stdout.write(`revert: ${report.removed} file(s) removed.\n`);
          }
        } catch (e) {
          exitCode = reportError(e, themes.err);
        }
      },
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
