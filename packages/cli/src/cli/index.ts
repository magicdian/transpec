/**
 * Transpec CLI - Universal Spec Conversion Tool
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { detectCommand } from './commands/detect.js';
import { initCommand } from './commands/init.js';
import { convertCommand } from './commands/convert.js';
import { applyCommand } from './commands/apply.js';
import { preprocessCommand } from './commands/preprocess.js';
import { postprocessCommand } from './commands/postprocess.js';
import { validateCommand } from './commands/validate.js';
import { versionCommand } from './commands/version.js';
import { Logger, LogLevel } from '../core/logging/index.js';
import { getVersionString } from '../core/version.js';

const program = new Command();

program
  .name('transpec')
  .description('Universal spec conversion tool - Convert between OpenSpec, Trellis, and other frameworks')
  .version(getVersionString() || '0.0.0');

// Global options
program
  .option('-v, --verbose', 'Enable verbose (DEBUG) logging')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      Logger.configure({ level: LogLevel.DEBUG, console: true });
    }
  });

program
  .command('init')
  .description('Initialize transpec in the current project')
  .option('-s, --source <framework>', 'Source framework (auto-detected if not specified)')
  .option('-t, --target <framework>', 'Target framework')
  .option('-i, --ide <ide>', 'Target IDE(s), comma-separated (claude-code,cursor,codex,opencode,none)', 'claude-code')
  .option('-m, --mode <mode>', 'Analysis mode (sampling|full|on-demand)', 'on-demand')
  .option('-y, --yes', 'Skip confirmation prompts (non-interactive mode)')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(initCommand);

program
  .command('detect')
  .description('Detect available frameworks in the current project')
  .option('-p, --path <path>', 'Project path', '.')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(detectCommand);

program
  .command('convert')
  .description('Internal/debug: generate deterministic RAW IR from the source framework')
  .option('-p, --project-path <path>', 'Project path (default: current directory)')
  .option('-s, --source <framework>', 'Source framework')
  .option('-t, --target <framework>', 'Target framework')
  .option('-m, --mode <mode>', 'Analysis mode (sampling|full|on-demand)', 'on-demand')
  .option('--dry-run', 'Preview without applying changes', false)
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--log-file <path>', 'Write logs to file')
  .action(convertCommand);

program
  .command('apply')
  .description('Deterministic apply plumbing for agent-driven workflow')
  .option('-p, --project-path <path>', 'Project path (default: current directory)')
  .option('-f, --force', 'Force re-run conversion even if already done')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(applyCommand);

program
  .command('preprocess')
  .description('Deterministic RAW IR preparation for agent-driven preprocess workflow')
  .option('-p, --project-path <path>', 'Project path (default: current directory)')
  .option('-s, --skip-convert', 'Skip convert step (use existing IR)')
  .option('-f, --force', 'Force re-run even if already preprocessed')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(preprocessCommand);

program
  .command('postprocess')
  .description('Generate deterministic grounded target specs after apply')
  .option('-p, --project-path <path>', 'Project path (default: current directory)')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(postprocessCommand);

program
  .command('version')
  .description('Show or bump version')
  .option('-b, --bump', 'Bump version to next build')
  .action(versionCommand);

program
  .command('validate')
  .description('Validate converted specs')
  .option('-p, --path <path>', 'Spec path to validate')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(validateCommand);

program.parse(process.argv);
