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
import * as path from 'path';
import { SQLiteStorage } from '../../core/storage/sqlite.js';
import { ConversionEngine } from '../../core/engine/engine.js';
import { CoreRelation } from '../../core/ir/types.js';
import { LogModules, getLogger } from '../../core/logging/index.js';
import {
  getProjectEnhancedAnalysisPath,
  getProjectFrameworkSkillPath,
  getProjectIrDbPath,
  getProjectPreprocessContextPath,
  loadEnhancedAnalysisFile,
  mergeEnhancedAnalysis,
  writePreprocessContext,
  writePostprocessContext,
} from '../../core/skill/index.js';
import { runTargetPostprocess } from '../../core/postprocess/index.js';
import { loadProjectConfig } from '../utils/project-config.js';
import { configureProjectLogger } from '../utils/logging.js';

const logger = getLogger(LogModules.CLI);

interface ApplyOptions {
  projectPath?: string;
  force?: boolean;
  verbose?: boolean;
}

export async function applyCommand(options: ApplyOptions): Promise<void> {
  const projectPath = options.projectPath || process.cwd();
  await configureProjectLogger({
    projectPath,
    verbose: options.verbose,
  });

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
  let relations = storage.loadRelations();
  if (relations.length === 0) {
    const fallbackRelations = await loadRelationsFromPreprocessContext(projectPath);
    if (fallbackRelations.length > 0) {
      relations = fallbackRelations;
      storage.saveRelations(relations);
      console.log(chalk.gray(`  Restored ${relations.length} relations from existing preprocess context\n`));
    }
  }

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
    await writePreprocessContext(
      projectPath,
      sourceFramework,
      targetFramework,
      entities,
      relations,
    );
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

    console.log(chalk.bold('\nStep 5: Running deterministic postprocess...'));
    const postprocessResult = await runTargetPostprocess(projectPath, targetFramework);
    if (postprocessResult.generatedFiles.length > 0) {
      for (const file of postprocessResult.generatedFiles) {
        console.log(chalk.gray(`  ${file.layer}: ${file.path}`));
      }
    } else {
      console.log(chalk.gray('  No deterministic grounded specs were generated'));
    }
    if (postprocessResult.warnings.length > 0) {
      for (const warning of postprocessResult.warnings) {
        console.log(chalk.yellow(`  ⚠ ${warning}`));
      }
    }

    console.log(chalk.green.bold('\n✓ Apply plumbing completed successfully!\n'));
    console.log(chalk.bold('Next Agent Step:'));
    console.log(`  1. Review generated grounded docs under ${chalk.cyan(path.join(projectPath, '.trellis', 'spec'))}`);
    console.log(`  2. Read ${chalk.cyan(postprocessSkillPath)}`);
    console.log(`  3. Read ${chalk.cyan(postprocessContextPath)}`);
    console.log(`  4. Refine target-specific postprocess output if needed\n`);

  } catch (error) {
    logger.error('Apply failed', { error: (error as Error).message });
    console.log(chalk.red(`✗ Apply failed: ${(error as Error).message}\n`));
    throw error;
  }
}

async function loadRelationsFromPreprocessContext(projectPath: string): Promise<CoreRelation[]> {
  try {
    const content = await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8');
    const parsed = JSON.parse(content) as {
      relations?: Array<{
        id: string;
        sourceId: string;
        targetId: string;
        type: string;
      }>;
    };
    return (parsed.relations ?? []).map(relation => ({
      id: relation.id,
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      relationType: relation.type,
    }));
  } catch {
    return [];
  }
}
