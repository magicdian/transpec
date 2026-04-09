/**
 * convert command - Convert specs between frameworks
 */

import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs/promises';
import { frameworkRegistry } from '../../core/framework/index.js';
import { ConversionEngine } from '../../core/engine/engine.js';
import { Logger, LogModules, LogLevel, getLogger } from '../../core/logging/index.js';
import { parseYaml } from '../utils/yaml.js';

const logger = getLogger(LogModules.CLI);

export interface ConvertOptions {
  source?: string;
  target?: string;
  mode?: string;
  dryRun?: boolean;
  verbose?: boolean;
  logFile?: string;
  projectPath?: string;
}

interface Config {
  project?: {
    sourceFramework?: string;
    targetFramework?: string;
    mode?: string;
  };
  logging?: {
    level?: string;
  };
}

export async function convertCommand(options: ConvertOptions) {
  // Configure logging
  Logger.configure({
    level: options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
    console: true,
  });

  logger.info('Starting conversion', { options });

  const projectPath = options.projectPath ? path.resolve(options.projectPath) : process.cwd();

  console.log(chalk.blue(`\nStarting conversion in: ${projectPath}\n`));

  try {
    // Load config
    const configPath = path.join(projectPath, '.transpec', 'config.yaml');
    let sourceFramework = options.source;
    let targetFramework = options.target;
    let mode = options.mode;

    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config: Config = parseYaml(configContent);

      if (!sourceFramework && config.project?.sourceFramework) {
        sourceFramework = config.project.sourceFramework;
      }
      if (!targetFramework && config.project?.targetFramework) {
        targetFramework = config.project.targetFramework;
      }
      if (!mode && config.project?.mode) {
        mode = config.project.mode;
      }

      logger.debug('Config loaded from file', { sourceFramework, targetFramework, mode });

    } catch {
      logger.debug('No config file found, using CLI options');
    }

    if (!sourceFramework || !targetFramework) {
      console.error(chalk.red('Source and target frameworks must be specified.'));
      console.log('Either run transpec init first, or use --source and --target options.\n');
      logger.error('Missing framework configuration', { sourceFramework, targetFramework });
      process.exit(1);
    }

    mode = mode || 'on-demand';

    console.log(`  Source: ${chalk.cyan(sourceFramework)}`);
    console.log(`  Target: ${chalk.cyan(targetFramework)}`);
    console.log(`  Mode: ${chalk.cyan(mode)}`);
    if (options.dryRun) {
      console.log(`  Dry run: ${chalk.yellow('yes')}`);
    }
    console.log();

    // Get adapters
    const sourceAdapter = frameworkRegistry.get(sourceFramework as any);
    const targetAdapter = frameworkRegistry.get(targetFramework as any);

    if (!sourceAdapter) {
      console.error(chalk.red(`Source framework '${sourceFramework}' not supported.`));
      logger.error('Unsupported source adapter', { framework: sourceFramework });
      process.exit(1);
    }

    if (!targetAdapter) {
      console.error(chalk.red(`Target framework '${targetFramework}' not supported.`));
      logger.error('Unsupported target adapter', { framework: targetFramework });
      process.exit(1);
    }

    // Create IR storage
    const irPath = path.join(projectPath, '.transpec', 'ir');
    await fs.mkdir(irPath, { recursive: true });
    const dbPath = path.join(irPath, `conversion-${Date.now()}.db`);
    logger.debug('IR storage created', { path: dbPath });

    // Run conversion engine
    const engine = new ConversionEngine({
      sourceFramework,
      targetFramework,
      projectPath,
      outputPath: projectPath,
      mode: mode as 'sampling' | 'full' | 'on-demand',
      dryRun: options.dryRun || false,
    }, dbPath);

    await engine.initialize();

    console.log(chalk.bold('Running conversion pipeline...\n'));

    const result = await engine.run();

    // Display results
    console.log(chalk.bold('\nConversion Results:'));
    console.log(`  Status: ${result.success ? chalk.green('SUCCESS') : chalk.red('FAILED')}`);
    console.log(`  Entities processed: ${result.entitiesProcessed}`);

    if (result.issues.length > 0) {
      console.log(chalk.bold('\nIssues:'));
      for (const issue of result.issues) {
        const color = issue.type === 'error' ? chalk.red : issue.type === 'warning' ? chalk.yellow : chalk.gray;
        console.log(`  ${color(`[${issue.type}]`)} ${issue.message}`);
      }
    }

    if (!result.success) {
      console.log(chalk.red('\nConversion completed with errors.\n'));
      logger.error('Conversion failed', { issues: result.issues });
      process.exit(1);
    }

    if (options.dryRun) {
      console.log(chalk.yellow('\nDry run complete - no files were written.\n'));
      logger.info('Dry run completed', { entitiesProcessed: result.entitiesProcessed });
    } else {
      console.log(chalk.green('\nConversion complete!\n'));
      logger.info('Conversion successful', {
        conversionId: result.conversionId,
        entitiesProcessed: result.entitiesProcessed,
        outputPath: result.outputPath
      });
    }

  } catch (error) {
    logger.error('Conversion failed with exception', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    console.error(chalk.red('Error during conversion:'), error);
    process.exit(1);
  }
}
