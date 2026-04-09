/**
 * transpec-apply command - Final transformation
 *
 * This command performs the final transformation using enhanced analysis:
 * 1. Load entities with enhancedAnalysis from IR storage (after preprocess)
 * 2. Run Transform + Emit phases
 * 3. Output framework-specific artifacts
 * 4. Update IRMetadata: aiPostProcessed = true
 *
 * User workflow:
 *   Shell: transpec init
 *   Agent IDE:
 *     1. transpec preprocess   # auto-run convert + preprocess skills
 *     2. transpec apply      # final transformation (Transform + Emit)
 *
 * Usage: transpec apply [--project-path <path>]
 */

import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { SQLiteStorage } from '../../core/storage/sqlite.js';
import { ConversionEngine } from '../../core/engine/engine.js';
import { SkillExecutor } from '../../core/skill/skill.js';
import { Logger, LogLevel, getLogger } from '../../core/logging/index.js';
import { parseYaml } from '../utils/yaml.js';

const logger = getLogger('cli');

/**
 * Get the built-in skills directory
 * Skill files are in .transpec/skills/ (copied to dist during build)
 */
function getBuiltInSkillsDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  // From dist/cli/commands/apply.js:
  // - 1 level up = dist/cli/commands
  // - 2 levels up = dist/cli
  // - 3 levels up = dist
  // - 4 levels up = packages/cli (package root)
  // Built-in skills are in .transpec/skills/
  const packageRoot = path.resolve(currentDir, '..', '..', '..', '..');
  return path.join(packageRoot, '.transpec', 'skills');
}

/**
 * Get the project's custom skills directory
 */
function getProjectSkillsDir(projectPath: string): string {
  return path.join(projectPath, '.transpec', 'skills');
}

interface ApplyOptions {
  projectPath?: string;
  force?: boolean;
  verbose?: boolean;
}

interface Config {
  project?: {
    sourceFramework?: string;
    targetFramework?: string;
    mode?: string;
  };
}

export async function applyCommand(options: ApplyOptions) {
  Logger.configure({
    level: options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
    console: true,
  });

  const projectPath = options.projectPath ? path.resolve(options.projectPath) : process.cwd();

  console.log(chalk.blue(`\n=== Transpec Apply ===\n`));
  console.log(`Project: ${chalk.cyan(projectPath)}\n`);

  // Step 1: Load config to get framework info
  console.log(chalk.bold('Step 1: Loading project configuration...'));
  const configPath = path.join(projectPath, '.transpec', 'config.yaml');

  let sourceFramework = 'openspec';
  let targetFramework = 'trellis';

  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: Config = parseYaml(configContent);

    if (config.project?.sourceFramework) {
      sourceFramework = config.project.sourceFramework;
    }
    if (config.project?.targetFramework) {
      targetFramework = config.project.targetFramework;
    }

    console.log(chalk.gray(`  Source: ${sourceFramework} → Target: ${targetFramework}\n`));
  } catch {
    console.log(chalk.yellow('  No config found, using defaults (openspec → trellis)\n'));
  }

  // Step 2: Check if IR storage exists (preprocess must have run)
  console.log(chalk.bold('Step 2: Checking IR storage...'));
  const dbPath = path.join(projectPath, '.transpec', 'ir', 'conversion.db');

  try {
    await fs.access(dbPath);
  } catch {
    console.log(chalk.red('✗ IR storage not found. Run "transpec preprocess" first.\n'));
    return;
  }

  const storage = new SQLiteStorage(dbPath);
  const entities = storage.loadAllEntities();
  const relations = storage.loadRelations();

  if (entities.length === 0) {
    console.log(chalk.red('✗ No entities found in IR storage. Run "transpec preprocess" first.\n'));
    storage.close();
    return;
  }

  console.log(chalk.gray(`  Loaded ${entities.length} entities, ${relations.length} relations\n`));

  // Step 3: Check if preprocess has run (enhancedAnalysis present)
  console.log(chalk.bold('Step 3: Checking preprocess status...'));
  const preprocessDone = entities.some(e => e.metadata?.enhancedAnalysis);

  if (!preprocessDone && !options.force) {
    console.log(chalk.yellow('  ⚠ Enhanced analysis not found. Use --force to proceed anyway.\n'));
    storage.close();
    return;
  }

  if (preprocessDone) {
    console.log(chalk.gray('  ✓ Enhanced analysis found\n'));
  } else {
    console.log(chalk.gray('  ⚠ Enhanced analysis not found, proceeding without it\n'));
  }

  // Step 4: Run Transform + Emit phases
  console.log(chalk.bold('Step 4: Running final transformation (Transform + Emit)...\n'));

  const outputPath = projectPath;
  const engine = new ConversionEngine({
    sourceFramework,
    targetFramework,
    projectPath,
    outputPath,
    mode: 'on-demand',
    dryRun: false,
  }, dbPath);

  try {
    await engine.initialize();
    const result = await engine.runTransformEmit();

    if (result.success) {
      console.log(chalk.green(`  ✓ Transformation completed (${result.entitiesProcessed} entities)\n`));
    } else {
      console.log(chalk.yellow(`  ⚠ Transformation completed with issues\n`));
      for (const issue of result.issues) {
        console.log(chalk.gray(`    - ${issue.type}: ${issue.message}`));
      }
      console.log();
    }
  } catch (error) {
    console.log(chalk.red(`✗ Transformation failed: ${(error as Error).message}\n`));
    storage.close();
    throw error;
  }

  // Step 5: Guide agent to execute post-migration skills (only for Trellis target)
  // Trellis-specific: generate-trellis-specs generates spec/backend/, spec/frontend/, spec/guides/
  if (targetFramework === 'trellis') {
    console.log(chalk.bold('Step 5: Checking Trellis post-migration skills...'));

    // Combine built-in skills and project skills directories
    const builtInSkillsDir = getBuiltInSkillsDir();
    const projectSkillsDir = getProjectSkillsDir(projectPath);

    let postMigrationSkills: Awaited<ReturnType<SkillExecutor['getByTrigger']>> = [];

    try {
      // Try loading from project skills directory first
      const executor = new SkillExecutor(projectSkillsDir);
      await executor.initialize();
      postMigrationSkills = executor.getByTrigger('post-migration');

      // Also load built-in skills and merge
      if (builtInSkillsDir !== projectSkillsDir) {
        const builtInExecutor = new SkillExecutor(builtInSkillsDir);
        await builtInExecutor.initialize();
        postMigrationSkills = [...postMigrationSkills, ...builtInExecutor.getByTrigger('post-migration')];
      }

      if (postMigrationSkills.length > 0) {
        console.log(chalk.gray(`  Found ${postMigrationSkills.length} post-migration skill(s) for Trellis:`));
        for (const skill of postMigrationSkills) {
          console.log(chalk.cyan(`    - ${skill.name}`));
          console.log(chalk.gray(`      ${skill.description}`));
        }
        console.log();
      } else {
        console.log(chalk.gray('  No Trellis post-migration skills found\n'));
      }
    } catch (error) {
      console.log(chalk.yellow(`  Warning: Could not load skills: ${(error as Error).message}\n`));
    }
  }

  // Step 6: Update config with lastApply timestamp
  console.log(chalk.bold('Step 6: Updating project configuration...'));
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    const timestamp = new Date().toISOString();
    const updatedContent = configContent.replace(
      /lastConversion:\s*.+/,
      `lastConversion: ${timestamp}`
    ).replace(
      /lastApply:\s*.+/,
      `lastApply: ${timestamp}`
    );

    // Add lastApply if not present
    let finalContent = updatedContent;
    if (!updatedContent.includes('lastApply:')) {
      finalContent = updatedContent + `\nlastApply: ${timestamp}`;
    }

    await fs.writeFile(configPath, finalContent);
    console.log(chalk.gray(`  Updated config with lastApply timestamp\n`));
  } catch {
    // Ignore config update errors
  }

  // Step 7: Summary
  console.log(chalk.bold('Summary:\n'));
  console.log(`  Project: ${chalk.cyan(projectPath)}`);
  console.log(`  Entities transformed: ${chalk.green(entities.length)}`);
  console.log(`  Output: ${chalk.cyan(path.join(projectPath, '.trellis'))}`);
  console.log();

  // Guide AI agent to execute Trellis post-migration skills (only for Trellis target)
  if (targetFramework === 'trellis') {
    console.log(chalk.bold('Next Steps:\n'));
    console.log(chalk.cyan('  To generate Trellis development specs (spec/backend/, spec/frontend/, spec/guides/):'));
    console.log(chalk.gray('    Read .transpec/skills/generate-trellis-specs/SKILL.md and follow the instructions'));
    console.log();
  }

  logger.info('Apply command completed', {
    projectPath,
    entitiesProcessed: entities.length,
  });

  storage.close();
}
