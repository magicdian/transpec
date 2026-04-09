/**
 * init command - Initialize transpec in project
 *
 * Interactive TUI flow:
 * 1. Show welcome banner
 * 2. IDE selection (multi-select, only Claude Code enabled)
 * 3. Source framework selection (single-select from detected)
 * 4. Target framework selection (single-select from supported)
 * 5. Confirm and create configuration
 */

import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';
import ora from 'ora';
import { frameworkRegistry } from '../../core/framework/index.js';
import { IdeRegistry, ClaudeCodeAdapter, isInteractive } from '../../core/ide/index.js';
import { Logger, LogModules, LogLevel, getLogger } from '../../core/logging/index.js';

const logger = getLogger(LogModules.CLI);

export interface InitOptions {
  source?: string;
  target?: string;
  ide?: string;
  mode?: string;
  yes?: boolean;
  verbose?: boolean;
}

/**
 * ASCII art banner for transpec
 */
function showBanner(): void {
  console.log(chalk.cyan(`
   ██████╗ ███████╗██╗   ██╗    ███████╗███████╗ ██████╗████████╗ ██████╗ ███████╗
   ██╔══██╗██╔════╝██║   ██║    ██╔════╝██╔════╝██╔════╝╚══██╔══╝██╔═══██╗██╔════╝
   ██║  ██║█████╗  ██║   ██║    █████╗  █████╗  ██║        ██║   ██║   ██║█████╗
   ██║  ██║██╔══╝  ╚██╗ ██╔╝    ██╔══╝  ██╔══╝  ██║        ██║   ██║   ██║██╔══╝
   ██████╔╝███████╗ ╚████╔╝     ███████╗██║     ╚██████╗   ██║   ╚██████╔╝██║
   ╚═════╝ ╚══════╝  ╚═══╝      ╚══════╝╚═╝      ╚═════╝   ╚═╝    ╚═════╝ ╚═╝
  `));
  console.log(chalk.gray('  Universal spec conversion tool\n'));
}

/**
 * IDE choice for selection
 */
interface IdeChoice {
  name: string;
  value: string;
  disabled?: boolean | string;
}

/**
 * Prompt for IDE selection (multi-select)
 */
async function promptForIdeSelection(): Promise<string[]> {
  const choices: IdeChoice[] = [
    {
      name: 'Claude Code',
      value: 'claude-code',
      disabled: false,
    },
    {
      name: 'OpenCode (Coming soon)',
      value: 'opencode',
      disabled: '(not yet supported)',
    },
    {
      name: 'Codex (Coming soon)',
      value: 'codex',
      disabled: '(not yet supported)',
    },
    {
      name: 'Cursor (Coming soon)',
      value: 'cursor',
      disabled: '(not yet supported)',
    },
  ];

  const { ides } = await inquirer.prompt<{ ides: string[] }>([
    {
      type: 'checkbox',
      name: 'ides',
      message: 'Select IDE(s) to configure:',
      choices: choices,
      validate: (answer: string[]) => {
        if (answer.length === 0) {
          return 'Please select at least one IDE (or select "None (CLI only)")';
        }
        return true;
      },
    },
  ]);

  return ides;
}

/**
 * Prompt for source framework selection (single-select from detected)
 */
async function promptForSourceFramework(
  detectedFrameworks: { framework: string; entityCount: number }[]
): Promise<string> {
  const choices = detectedFrameworks.map((fw) => ({
    name: `${fw.framework} (${fw.entityCount} entities)`,
    value: fw.framework,
  }));

  const { source } = await inquirer.prompt<{ source: string }>([
    {
      type: 'list',
      name: 'source',
      message: 'Select source framework:',
      choices: choices,
    },
  ]);

  return source;
}

/**
 * Prompt for target framework selection (single-select from supported)
 */
async function promptForTargetFramework(sourceFramework: string): Promise<string> {
  const supportedFrameworks = frameworkRegistry.getSupportedFrameworks();
  const targetChoices = supportedFrameworks
    .filter((fw) => fw !== sourceFramework)
    .map((fw) => ({
      name: fw,
      value: fw,
    }));

  const { target } = await inquirer.prompt<{ target: string }>([
    {
      type: 'list',
      name: 'target',
      message: 'Select target framework:',
      choices: targetChoices,
    },
  ]);

  return target;
}

/**
 * Prompt for mode selection
 */
async function promptForMode(): Promise<string> {
  const { mode } = await inquirer.prompt<{ mode: string }>([
    {
      type: 'list',
      name: 'mode',
      message: 'Select analysis mode:',
      choices: [
        { name: 'On-demand (analyze when needed)', value: 'on-demand' },
        { name: 'Full (analyze all entities)', value: 'full' },
        { name: 'Sampling (analyze sample entities)', value: 'sampling' },
      ],
      default: 'on-demand',
    },
  ]);

  return mode;
}

/**
 * Code spec organization options
 */
export type CodeSpecOption = 'merged' | 'by-language' | 'main-only';

/**
 * Check if target framework supports code specs
 */
function supportsCodeSpecs(targetFramework: string): boolean {
  // Currently only Trellis supports code specs
  return targetFramework === 'trellis';
}

/**
 * Prompt for code spec organization (only shown for frameworks that support it)
 */
async function promptForCodeSpec(targetFramework: string): Promise<CodeSpecOption | null> {
  if (!supportsCodeSpecs(targetFramework)) {
    return null;
  }

  const { codeSpec } = await inquirer.prompt<{ codeSpec: CodeSpecOption }>([
    {
      type: 'list',
      name: 'codeSpec',
      message: 'Select code spec organization:',
      choices: [
        {
          name: 'Merged - Generate all language specs in one directory (spec/index.md)',
          value: 'merged',
        },
        {
          name: 'By Language - Generate specs organized by language (spec/rust/index.md, spec/java/index.md)',
          value: 'by-language',
        },
        {
          name: 'Main Only - Generate specs only for the primary development language',
          value: 'main-only',
        },
      ],
      default: 'merged',
    },
  ]);

  return codeSpec;
}

/**
 * Prompt for final confirmation
 */
async function promptForConfirmation(
  sourceFramework: string,
  targetFramework: string,
  ides: string[],
  mode: string,
  codeSpec: CodeSpecOption | null
): Promise<boolean> {
  console.log();
  console.log(chalk.bold('Configuration Summary:'));
  console.log(`  Source Framework: ${chalk.cyan(sourceFramework)}`);
  console.log(`  Target Framework: ${chalk.cyan(targetFramework)}`);
  const ideNames = ides.length > 0
    ? ides.map(ide => ide === 'claude-code' ? 'Claude Code' : ide).join(', ')
    : 'None (CLI only)';
  console.log(`  IDE(s): ${chalk.cyan(ideNames)}`);
  console.log(`  Mode: ${chalk.cyan(mode)}`);
  if (codeSpec) {
    const codeSpecLabels: Record<CodeSpecOption, string> = {
      'merged': 'Merged (all in one directory)',
      'by-language': 'By Language (organized by language)',
      'main-only': 'Main Only (primary language only)',
    };
    console.log(`  Code Spec: ${chalk.cyan(codeSpecLabels[codeSpec])}`);
  }
  console.log();

  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Proceed with initialization?',
      default: true,
    },
  ]);

  return confirmed;
}

/**
 * Check if running in CI/non-interactive mode
 */
function isCiMode(): boolean {
  return process.env.CI !== undefined || process.env.TERM === 'dumb';
}

export async function initCommand(options: InitOptions) {
  // Configure logging
  Logger.configure({
    level: options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
    console: true,
  });

  logger.info('Starting transpec initialization');
  const projectPath = process.cwd();

  // Show banner in interactive mode
  const interactive = isInteractive() && !isCiMode() && !options.yes;

  if (interactive) {
    showBanner();
  } else if (options.verbose) {
    console.log(chalk.blue('\nInitializing transpec...\n'));
  }

  try {
    // Register IDE adapters
    const ideRegistry = IdeRegistry.getInstance();
    ideRegistry.register(new ClaudeCodeAdapter());

    // Detect frameworks
    logger.debug('Detecting frameworks in project', { path: projectPath });
    const detected = await frameworkRegistry.detect(projectPath);
    logger.debug('Detection completed', { detected: detected.length });

    if (detected.length === 0) {
      if (interactive) {
        console.log(chalk.yellow('No frameworks detected in current project.'));
        console.log('Please ensure you are in a project with OpenSpec, Trellis, or other supported frameworks.\n');
      } else {
        console.error(chalk.red('No frameworks detected.'));
        console.log('Supported: openspec, trellis\n');
      }
      logger.warn('No frameworks found during detection');
      process.exit(1);
    }

    // Show detected frameworks
    if (interactive) {
      console.log(chalk.green(`Detected frameworks: ${detected.map(d => d.framework).join(', ')}\n`));
    } else if (options.verbose) {
      console.log(chalk.green(`Detected frameworks: ${detected.map(d => d.framework).join(', ')}`));
    }
    logger.info('Frameworks detected', {
      frameworks: detected.map(d => d.framework),
      entityCounts: detected.map(d => d.entityCount)
    });

    // Determine configuration through prompts or defaults
    let sourceFramework: string;
    let targetFramework: string;
    let ides: string[];
    let mode: string;
    let codeSpec: CodeSpecOption | null = null;

    if (interactive) {
      // Step 1: IDE selection
      console.log(chalk.bold('Step 1: IDE Selection\n'));
      ides = await promptForIdeSelection();

      // Step 2: Source framework selection
      console.log(chalk.bold('\nStep 2: Source Framework\n'));
      sourceFramework = await promptForSourceFramework(detected);

      // Step 3: Target framework selection
      console.log(chalk.bold('\nStep 3: Target Framework\n'));
      targetFramework = await promptForTargetFramework(sourceFramework);

      // Step 4: Mode selection
      console.log(chalk.bold('\nStep 4: Analysis Mode\n'));
      mode = await promptForMode();

      // Step 5: Code spec organization (if target supports it)
      if (supportsCodeSpecs(targetFramework)) {
        console.log(chalk.bold('\nStep 5: Code Specification\n'));
        console.log(chalk.gray('  Target framework supports code specifications for different languages.\n'));
        codeSpec = await promptForCodeSpec(targetFramework);
      }

      // Step 6: Confirmation
      console.log(chalk.bold('\nStep 6: Confirm\n'));
      const confirmed = await promptForConfirmation(
        sourceFramework,
        targetFramework,
        ides,
        mode,
        codeSpec
      );

      if (!confirmed) {
        console.log(chalk.dim('Initialization cancelled.\n'));
        process.exit(0);
      }
    } else {
      // Non-interactive mode: use defaults
      sourceFramework = options.source || detected[0].framework;
      targetFramework = options.target || (sourceFramework === 'openspec' ? 'trellis' : 'openspec');
      mode = options.mode || 'on-demand';
      ides = options.ide ? [options.ide] : [];
      if (supportsCodeSpecs(targetFramework)) {
        codeSpec = 'merged';
      }
    }

    // Validate frameworks
    const sourceAdapter = frameworkRegistry.get(sourceFramework as any);
    const targetAdapter = frameworkRegistry.get(targetFramework as any);

    if (!sourceAdapter) {
      console.error(chalk.red(`Source framework '${sourceFramework}' not supported.`));
      console.log('Supported:', frameworkRegistry.getSupportedFrameworks().join(', '));
      logger.error('Unsupported source framework', { framework: sourceFramework });
      process.exit(1);
    }

    if (!targetAdapter) {
      console.error(chalk.red(`Target framework '${targetFramework}' not supported.`));
      console.log('Supported:', frameworkRegistry.getSupportedFrameworks().join(', '));
      logger.error('Unsupported target framework', { framework: targetFramework });
      process.exit(1);
    }

    if (sourceFramework === targetFramework) {
      console.error(chalk.red('Source and target frameworks must be different.'));
      logger.error('Source and target are the same', { framework: sourceFramework });
      process.exit(1);
    }

    // Create .transpec directory
    const transpecDir = path.join(projectPath, '.transpec');
    logger.debug('Creating .transpec directory', { path: transpecDir });

    const spinner = ora('Creating transpec structure...').start();
    await fs.mkdir(transpecDir, { recursive: true });

    // Create config
    const createdAt = new Date().toISOString();
    const ide = ides.length > 0 ? ides[0] : 'none';
    const config: Record<string, unknown> = {
      version: '1.0.0',
      project: {
        sourceFramework,
        targetFramework,
        ide,
        mode,
      },
      logging: {
        level: options.verbose ? 'debug' : 'info',
        console: true,
        file: {
          enabled: false,
        },
      },
      createdAt,
    };

    // Add code spec if target supports it
    if (codeSpec) {
      (config.project as Record<string, unknown>).codeSpec = codeSpec;
    }

    const configYaml = `# Transpec Configuration
# Generated by transpec init

version: "1.0.0"

project:
  sourceFramework: ${sourceFramework}
  targetFramework: ${targetFramework}
  ide: ${ide}
  mode: ${mode}
${codeSpec ? `  codeSpec: ${codeSpec}` : ''}

logging:
  level: ${options.verbose ? 'debug' : 'info'}
  console: true
  file:
    enabled: false

createdAt: "${createdAt}"
`;

    await fs.writeFile(path.join(transpecDir, 'config.yaml'), configYaml);
    logger.debug('Config written', { path: path.join(transpecDir, 'config.yaml') });

    // Create workspace directory
    await fs.mkdir(path.join(transpecDir, 'workspace'), { recursive: true });
    await fs.mkdir(path.join(transpecDir, 'ir'), { recursive: true });
    await fs.mkdir(path.join(transpecDir, 'logs'), { recursive: true });
    logger.debug('Directory structure created');

    spinner.succeed('Transpec structure created');

    // Configure IDE(s) if selected
    for (const ideId of ides) {
      const ideAdapter = ideRegistry.get(ideId);
      if (ideAdapter) {
        const ideSpinner = ora(`Configuring ${ideAdapter.displayName}...`).start();
        try {
          await ideAdapter.configure(projectPath);
          ideSpinner.succeed(`${ideAdapter.displayName} configured`);
        } catch (error) {
          ideSpinner.fail(`Failed to configure ${ideAdapter.displayName}`);
          logger.error('IDE configuration failed', { ide: ideId, error: (error as Error).message });
          // Don't exit - CLI is still functional
        }
      }
    }

    // Show success message
    console.log();
    console.log(chalk.green('Transpec initialized successfully!\n'));
    console.log(chalk.bold('Configuration:'));
    console.log(`  Source: ${chalk.cyan(sourceFramework)}`);
    console.log(`  Target: ${chalk.cyan(targetFramework)}`);
    console.log(`  IDE: ${chalk.cyan(ides.length > 0 ? ides.map(i => i === 'claude-code' ? 'Claude Code' : i).join(', ') : 'None')}`);
    console.log(`  Mode: ${chalk.cyan(mode)}`);
    if (codeSpec) {
      const codeSpecLabels: Record<CodeSpecOption, string> = {
        'merged': 'Merged',
        'by-language': 'By Language',
        'main-only': 'Main Only',
      };
      console.log(`  Code Spec: ${chalk.cyan(codeSpecLabels[codeSpec])}`);
    }
    console.log();

    if (ides.includes('claude-code')) {
      console.log(chalk.dim(`Run ${chalk.bold('/transpec:apply')} in Claude Code to start conversion\n`));
    }
    console.log(chalk.dim(`To start conversion manually, run: ${chalk.bold('transpec convert')}\n`));

    logger.info('Initialization complete', {
      sourceFramework,
      targetFramework,
      ide,
      mode,
      codeSpec
    });

  } catch (error) {
    logger.error('Initialization failed', { error: (error as Error).message, stack: (error as Error).stack });
    console.error(chalk.red('Error initializing transpec:'), error);
    process.exit(1);
  }
}
