/**
 * Transpec CLI - Universal Spec Conversion Tool
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { detectCommand } from './commands/detect.js';
import { initCommand } from './commands/init.js';
import { convertCommand } from './commands/convert.js';
import { applyCommand } from './commands/apply.js';
import { Logger, LogLevel } from '../core/logging/index.js';

const program = new Command();

program
  .name('transpec')
  .description('Universal spec conversion tool - Convert between OpenSpec, Trellis, and other frameworks')
  .version('0.1.0');

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
  .option('-i, --ide <ide>', 'Target IDE (claude-code, none)', 'claude-code')
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
  .description('Convert specs from source to target framework')
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
  .description('Run post-migration skills (called by AI agents after convert)')
  .option('-p, --project-path <path>', 'Project path (default: current directory)')
  .option('-f, --force', 'Force re-run conversion even if already done')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(applyCommand);

program
  .command('validate')
  .description('Validate converted specs')
  .option('-p, --path <path>', 'Spec path to validate')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (options) => {
    Logger.configure({
      level: options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
      console: true,
    });
    console.log(chalk.yellow('validate command not yet implemented'));
  });

program.parse(process.argv);
