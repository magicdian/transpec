/**
 * transpec-apply command - Run post-migration skills
 *
 * This command is invoked by AI agents after transpec convert completes.
 * It triggers post-migration skills that analyze converted content
 * and generate framework-specific artifacts (e.g., Trellis specs).
 *
 * Flow:
 * 1. Run transpec convert (if not already done)
 * 2. Load post-migration skills from .transpec/skills/
 * 3. Output skill instructions for the agent to execute
 */

import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs/promises';
import { SkillLoader } from '../../core/skill/skill.js';
import { Logger, LogLevel, getLogger } from '../../core/logging/index.js';

const logger = getLogger('cli');

interface ApplyOptions {
  projectPath?: string;
  forceConvert?: boolean;
  verbose?: boolean;
}

export async function applyCommand(options: ApplyOptions) {
  Logger.configure({
    level: options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
    console: true,
  });

  const projectPath = options.projectPath ? path.resolve(options.projectPath) : process.cwd();

  console.log(chalk.blue(`\n=== Transpec Apply ===\n`));
  console.log(`Project: ${chalk.cyan(projectPath)}\n`);

  // Step 1: Check if .transpec/config.yaml exists
  const configPath = path.join(projectPath, '.transpec', 'config.yaml');
  let needsConversion = true;

  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    const lastConversion = configContent.match(/lastConversion:\s*(.+)/)?.[1];

    if (lastConversion && !options.forceConvert) {
      console.log(`Last conversion: ${chalk.gray(lastConversion)}`);
      console.log(`Use ${chalk.yellow('--force')} to re-run conversion\n`);
      needsConversion = false;
    }
  } catch {
    console.log(chalk.yellow('No .transpec/config.yaml found. Running initial conversion...\n'));
    needsConversion = true;
  }

  // Step 2: Run conversion if needed
  if (needsConversion) {
    console.log(chalk.bold('Step 1: Running conversion...\n'));

    // Auto-detect frameworks from project
    const { frameworkRegistry } = await import('../../core/framework/index.js');

    let sourceFramework = 'openspec';
    let targetFramework = 'trellis';

    // Try to detect source framework
    const openspecAdapter = frameworkRegistry.get('openspec');
    const trellisAdapter = frameworkRegistry.get('trellis');

    if (openspecAdapter && await openspecAdapter.detect(projectPath)) {
      sourceFramework = 'openspec';
      console.log(`Detected source framework: ${chalk.cyan(sourceFramework)}`);
    }

    if (trellisAdapter && await trellisAdapter.detect(projectPath)) {
      // If both detected, prefer trellis as target (migration scenario)
      targetFramework = 'trellis';
      console.log(`Detected target framework: ${chalk.cyan(targetFramework)}`);
    }

    // Import convert logic inline to avoid circular dependency
    const { convertCommand } = await import('./convert.js');
    await convertCommand({
      projectPath,
      source: sourceFramework,
      target: targetFramework,
      dryRun: false,
      verbose: options.verbose,
    });
  } else {
    console.log(chalk.bold('Step 1: Conversion skipped (use --force to re-run)\n'));
  }

  // Step 3: Ensure Trellis spec directory structure exists
  console.log(chalk.bold('Step 2: Setting up Trellis spec structure...\n'));

  const specDir = path.join(projectPath, '.trellis', 'spec');
  const backendDir = path.join(specDir, 'backend');
  const frontendDir = path.join(specDir, 'frontend');
  const guidesDir = path.join(specDir, 'guides');

  // Create directories if they don't exist
  for (const dir of [specDir, backendDir, frontendDir, guidesDir]) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // Ignore
    }
  }

  // Create index files if they don't exist
  const indexFiles = [
    { path: path.join(backendDir, 'index.md'), content: '# Backend Development Guidelines\n\n> To be filled based on project analysis.\n' },
    { path: path.join(frontendDir, 'index.md'), content: '# Frontend Development Guidelines\n\n> To be filled based on project analysis.\n' },
    { path: path.join(guidesDir, 'index.md'), content: '# Thinking Guides\n\n> Guides for cross-layer and code architecture decisions.\n' },
  ];

  for (const { path: filePath, content } of indexFiles) {
    try {
      await fs.access(filePath);
      console.log(`  ${chalk.gray('Exists:')} ${path.relative(projectPath, filePath)}`);
    } catch {
      await fs.writeFile(filePath, content);
      console.log(`  ${chalk.green('Created:')} ${path.relative(projectPath, filePath)}`);
    }
  }

  console.log();

  // Step 4: Load and display post-migration skills
  console.log(chalk.bold('Step 3: Checking post-migration skills...\n'));

  const skillsDir = path.join(projectPath, '.transpec', 'skills');
  const loader = new SkillLoader(skillsDir);
  await loader.loadAll();

  const postMigrationSkills = loader.getByTrigger('post-migration');

  if (postMigrationSkills.length === 0) {
    console.log(chalk.gray('No post-migration skills found.\n'));
    return;
  }

  console.log(`Found ${chalk.cyan(postMigrationSkills.length)} post-migration skill(s):\n`);

  for (const skill of postMigrationSkills) {
    console.log(`  ${chalk.green('●')} ${chalk.bold(skill.name)}`);
    console.log(`    ${chalk.gray(skill.description)}`);
    if (skill.model) {
      console.log(`    Model: ${chalk.gray(skill.model)}`);
    }
    console.log();
  }

  // Step 4: Output skill instructions for the agent
  console.log(chalk.bold('Skill Instructions for Agent:\n'));
  console.log('```');
  console.log(`# Execute post-migration skills`);

  for (const skill of postMigrationSkills) {
    const skillFile = path.join(skillsDir, skill.name, 'SKILL.md');
    console.log(`\n## ${skill.name}`);
    console.log(`Read: ${skillFile}`);
    console.log(`Trigger: ${skill.trigger}`);
    console.log(`Model: ${skill.model || 'agent default'}`);

    // Output skill content summary
    const skillContent = skill.content.slice(0, 500);
    console.log(`\nPurpose: ${skillContent.split('\n')[0]}`);
  }

  console.log('```\n');

  // Step 5: Summary
  console.log(chalk.bold('Summary:\n'));
  console.log(`  Project: ${chalk.cyan(projectPath)}`);
  console.log(`  Conversion: ${needsConversion ? chalk.green('Run') : chalk.yellow('Skipped')}`);
  console.log(`  Skills to execute: ${chalk.cyan(postMigrationSkills.length)}`);
  console.log();

  console.log(chalk.bold('To execute skills, the Agent should:\n'));
  console.log(`  1. Read each skill's SKILL.md file`);
  console.log(`  2. Execute the skill workflow using AI`);
  console.log(`  3. Present results to user for confirmation`);
  console.log(`  4. Write approved files to target locations`);
  console.log();

  logger.info('Apply command completed', {
    projectPath,
    conversionRun: needsConversion,
    skillsFound: postMigrationSkills.length,
  });
}
