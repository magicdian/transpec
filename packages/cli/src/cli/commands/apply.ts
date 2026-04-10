/**
 * transpec apply command - deterministic transform and emit
 *
 * This command applies deterministic conversion plumbing:
 * 1. Import any agent-generated enhanced analysis from .transpec/workspace/
 * 2. Run Transform + Validate + Emit on RAW IR
 * 3. Export postprocess context for the agent command layer
 */

import chalk from 'chalk';
import * as fs from 'fs/promises';
import { SQLiteStorage } from '../../core/storage/sqlite.js';
import { ConversionEngine } from '../../core/engine/engine.js';
import { Logger, LogLevel, LogModules, getLogger } from '../../core/logging/index.js';
import {
  getProjectEnhancedAnalysisPath,
  getProjectFrameworkSkillPath,
  getProjectIrDbPath,
  loadEnhancedAnalysisFile,
  mergeEnhancedAnalysis,
  writePostprocessContext,
} from '../../core/skill/index.js';
import { loadProjectConfig } from '../utils/project-config.js';

const logger = getLogger(LogModules.CLI);

interface ApplyOptions {
  projectPath?: string;
  force?: boolean;
  verbose?: boolean;
}

export async function applyCommand(options: ApplyOptions): Promise<void> {
  Logger.configure({
    level: options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
    console: true,
  });

  const projectPath = options.projectPath || process.cwd();

  console.log(chalk.blue(`\n=== Transpec Apply ===\n`));
  console.log(`Project: ${chalk.cyan(projectPath)}\n`);

  const config = await loadProjectConfig(projectPath);
  const sourceFramework = config.project?.sourceFramework;
  const targetFramework = config.project?.targetFramework;

  if (!sourceFramework || !targetFramework) {
    console.log(chalk.red('✗ Missing framework configuration. Run "transpec init" first.\n'));
    return;
  }

  console.log(chalk.bold('Step 1: Checking RAW IR storage...'));
  const dbPath = getProjectIrDbPath(projectPath);

  try {
    await fs.access(dbPath);
  } catch {
    console.log(chalk.red('✗ RAW IR not found. Run the agent preprocess flow first.\n'));
    return;
  }

  const storage = new SQLiteStorage(dbPath);
  let entities = storage.loadAllEntities();
  const relations = storage.loadRelations();

  if (entities.length === 0) {
    console.log(chalk.red('✗ No entities found in RAW IR. Run the agent preprocess flow first.\n'));
    storage.close();
    return;
  }

  console.log(chalk.gray(`  Loaded ${entities.length} entities, ${relations.length} relations\n`));

  console.log(chalk.bold('Step 2: Importing enhanced analysis...'));
  const analysisFile = await loadEnhancedAnalysisFile(projectPath);
  let importedEnhancedAnalysis = 0;

  if (analysisFile) {
    const merged = mergeEnhancedAnalysis(entities, analysisFile);
    entities = merged.entities;
    importedEnhancedAnalysis = merged.updatedCount;
    storage.saveEntities(entities);
    console.log(chalk.gray(`  Imported enhanced analysis for ${importedEnhancedAnalysis} entities\n`));
  } else if (!options.force) {
    console.log(chalk.yellow(`  No enhanced analysis file found at ${getProjectEnhancedAnalysisPath(projectPath)}\n`));
    storage.close();
    return;
  } else {
    console.log(chalk.gray('  No enhanced analysis file found, continuing due to --force\n'));
  }

  storage.close();

  console.log(chalk.bold('Step 3: Running deterministic apply (Transform + Emit)...\n'));

  const engine = new ConversionEngine({
    sourceFramework,
    targetFramework,
    projectPath,
    outputPath: projectPath,
    mode: 'on-demand',
    dryRun: false,
  }, dbPath);

  try {
    await engine.initialize();
    const result = await engine.runTransformEmit();

    if (!result.success) {
      console.log(chalk.yellow('  ⚠ Apply completed with issues\n'));
      for (const issue of result.issues) {
        console.log(chalk.gray(`    - ${issue.type}: ${issue.message}`));
      }
      console.log();
    } else {
      console.log(chalk.green(`  ✓ Apply completed (${result.entitiesProcessed} entities)\n`));
    }

    console.log(chalk.bold('Step 4: Writing postprocess context...'));
    const postprocessContextPath = await writePostprocessContext(
      projectPath,
      sourceFramework,
      targetFramework,
      result.entitiesProcessed,
    );
    const postprocessSkillPath = getProjectFrameworkSkillPath(projectPath, 'postprocess', targetFramework);
    console.log(chalk.gray(`  Context: ${postprocessContextPath}`));

    console.log(chalk.green.bold('\n✓ Apply plumbing completed successfully!\n'));
    console.log(chalk.bold('Next Agent Step:'));
    console.log(`  1. Read ${chalk.cyan(postprocessSkillPath)}`);
    console.log(`  2. Read ${chalk.cyan(postprocessContextPath)}`);
    console.log(`  3. Execute the target-specific postprocess workflow\n`);

  } catch (error) {
    logger.error('Apply failed', { error: (error as Error).message });
    console.log(chalk.red(`✗ Apply failed: ${(error as Error).message}\n`));
    throw error;
  }
}
