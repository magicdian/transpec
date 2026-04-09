/**
 * detect command - Detect available frameworks in project
 */

import chalk from 'chalk';
import * as path from 'path';
import { frameworkRegistry } from '../../core/framework/index.js';
import { Logger, LogModules, LogLevel, getLogger } from '../../core/logging/index.js';

const logger = getLogger(LogModules.CLI);

export interface DetectOptions {
  path: string;
  verbose?: boolean;
}

export async function detectCommand(options: DetectOptions) {
  // Configure logging based on verbose flag
  if (options.verbose) {
    Logger.configure({
      level: LogLevel.DEBUG,
      console: true,
    });
    logger.debug('Verbose logging enabled');
  }

  const projectPath = path.resolve(options.path);
  logger.info(`Detecting frameworks in: ${projectPath}`);

  console.log(chalk.blue(`\nDetecting frameworks in: ${projectPath}\n`));

  try {
    const detected = await frameworkRegistry.detect(projectPath);
    logger.debug('Detection completed', { frameworksFound: detected.length });

    if (detected.length === 0) {
      console.log(chalk.yellow('No frameworks detected.'));
      console.log('Supported frameworks: openspec, trellis, speckit, superpower\n');
      logger.warn('No frameworks detected in project');
      return;
    }

    console.log(chalk.green(`Detected ${detected.length} framework(s):\n`));
    logger.info(`Found ${detected.length} framework(s)`, {
      frameworks: detected.map(d => d.framework)
    });

    for (const details of detected) {
      console.log(chalk.bold(`  ${details.framework}`));
      console.log(`    Path: ${details.path}`);
      if (details.version) {
        console.log(`    Version: ${details.version}`);
      }
      console.log(`    Entities: ${details.entityCount}`);
      if (details.additionalInfo) {
        console.log(`    Details:`, details.additionalInfo);
      }
      console.log();
    }

    logger.debug('Detection summary', {
      frameworks: detected.map(d => ({
        framework: d.framework,
        entityCount: d.entityCount,
        version: d.version,
      }))
    });

  } catch (error) {
    logger.error('Detection failed', { error: (error as Error).message, stack: (error as Error).stack });
    console.error(chalk.red('Error detecting frameworks:'), error);
    process.exit(1);
  }
}
