/**
 * transpec preprocess command - deterministic RAW IR preparation
 *
 * This command prepares the project for agent-driven preprocess skills:
 * 1. Generate or refresh RAW IR deterministically
 * 2. Export preprocess context into .transpec/workspace/
 * 3. Leave semantic enhancement to the agent command layer
 */

import chalk from 'chalk';
import * as fs from 'fs/promises';
import { ConversionEngine } from '../../core/engine/engine.js';
import { SQLiteStorage } from '../../core/storage/sqlite.js';
import { Logger, LogLevel, LogModules, getLogger } from '../../core/logging/index.js';
import {
  getProjectEnhancedAnalysisPath,
  getProjectFrameworkSkillPath,
  getProjectIrDbPath,
  writePreprocessContext,
} from '../../core/skill/index.js';
import { loadProjectConfig } from '../utils/project-config.js';

const logger = getLogger(LogModules.CLI);

export interface PreprocessOptions {
  projectPath?: string;
  verbose?: boolean;
  force?: boolean;
  skipConvert?: boolean;
}

async function runRawIrGeneration(
  projectPath: string,
  sourceFramework: string,
  targetFramework: string,
): Promise<void> {
  const dbPath = getProjectIrDbPath(projectPath);
  await fs.rm(dbPath, { force: true });

  const engine = new ConversionEngine({
    sourceFramework,
    targetFramework,
    projectPath,
    outputPath: projectPath,
    mode: 'on-demand',
    dryRun: false,
  }, dbPath);

  await engine.initialize();
  const result = await engine.runParseOnly();

  if (!result.success) {
    throw new Error(`RAW IR generation failed: ${result.issues.map(issue => issue.message).join('; ')}`);
  }
}

export async function preprocessCommand(options: PreprocessOptions): Promise<void> {
  const projectPath = options.projectPath || process.cwd();

  Logger.configure({
    level: options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
    console: true,
  });

  console.log(chalk.blue(`\n=== Transpec Preprocess ===\n`));
  console.log(chalk.gray(`Project: ${chalk.cyan(projectPath)}\n`));

  try {
    const config = await loadProjectConfig(projectPath);
    const sourceFramework = config.project?.sourceFramework;
    const targetFramework = config.project?.targetFramework;

    if (!sourceFramework || !targetFramework) {
      console.log(chalk.red('✗ Missing framework configuration. Run "transpec init" first.\n'));
      return;
    }

    if (!options.skipConvert) {
      console.log(chalk.bold('Step 1: Generating RAW IR...'));
      await runRawIrGeneration(projectPath, sourceFramework, targetFramework);
      console.log(chalk.green('  ✓ RAW IR refreshed\n'));
    } else {
      console.log(chalk.bold('Step 1: Reusing existing RAW IR...'));
      console.log(chalk.gray('  Skipped RAW IR refresh due to --skip-convert\n'));
    }

    console.log(chalk.bold('Step 2: Loading IR entities...'));
    const dbPath = getProjectIrDbPath(projectPath);
    const storage = new SQLiteStorage(dbPath);
    const entities = storage.loadAllEntities();
    const relations = storage.loadRelations();
    storage.close();

    if (entities.length === 0) {
      console.log(chalk.red('✗ No entities found in RAW IR. Run "transpec preprocess" without --skip-convert first.\n'));
      return;
    }

    console.log(chalk.gray(`  Loaded ${entities.length} entities, ${relations.length} relations\n`));

    if (options.force) {
      await fs.rm(getProjectEnhancedAnalysisPath(projectPath), { force: true });
    }

    console.log(chalk.bold('Step 3: Writing preprocess context...'));
    const preprocessContextPath = await writePreprocessContext(
      projectPath,
      sourceFramework,
      targetFramework,
      entities,
      relations,
    );
    console.log(chalk.gray(`  Context: ${preprocessContextPath}`));

    const preprocessSkillPath = getProjectFrameworkSkillPath(projectPath, 'preprocess', sourceFramework);
    const enhancedAnalysisPath = getProjectEnhancedAnalysisPath(projectPath);

    console.log(chalk.green.bold('\n✓ Preprocess plumbing completed successfully!\n'));
    console.log(chalk.bold('Next Agent Step:'));
    console.log(`  1. Read ${chalk.cyan(preprocessSkillPath)}`);
    console.log(`  2. Read ${chalk.cyan(preprocessContextPath)}`);
    console.log(`  3. Write enhanced analysis JSON to ${chalk.cyan(enhancedAnalysisPath)}\n`);

  } catch (error) {
    logger.error('Preprocess failed', { error: (error as Error).message });
    console.log(chalk.red(`\n✗ Preprocess failed: ${(error as Error).message}\n`));
    throw error;
  }
}
