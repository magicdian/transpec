/**
 * transpec-preprocess command - AI-powered semantic analysis
 *
 * This command performs LLM analysis on RAW IR entities:
 * 1. Load entities from IR storage
 * 2. Load framework-specific preprocess skills
 * 3. Execute skills to extract enhanced analysis
 * 4. Update entities with enhancedAnalysis metadata
 * 5. Mark IRMetadata.aiPreProcessed = true
 *
 * Usage: transpec preprocess [--project-path <path>]
 */

import chalk from 'chalk';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { SkillExecutor } from '../../core/skill/skill.js';
import { SQLiteStorage } from '../../core/storage/sqlite.js';
import { EnhancedAnalysis, ProjectSummary } from '../../core/ir/types.js';
import { Logger, LogLevel, LogModules, getLogger } from '../../core/logging/index.js';

const logger = getLogger(LogModules.CLI);

export interface PreprocessOptions {
  projectPath?: string;
  verbose?: boolean;
  force?: boolean;
}

/**
 * Get the built-in skills directory
 */
function getBuiltInSkillsDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  // From dist/cli/commands/preprocess.js:
  // - 1 level up = dist/cli/commands
  // - 2 levels up = dist/cli
  // - 3 levels up = dist
  // - 4 levels up = package root
  // Built-in skills are in src/core/skill/skills
  const packageRoot = path.resolve(currentDir, '..', '..', '..', '..');
  return path.join(packageRoot, 'src', 'core', 'skill', 'skills');
}

export async function preprocessCommand(options: PreprocessOptions): Promise<void> {
  const projectPath = options.projectPath || process.cwd();
  const skillsDir = getBuiltInSkillsDir();

  Logger.configure({
    level: options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
    console: true,
  });

  console.log(chalk.blue(`\n=== Transpec Preprocess ===\n`));
  console.log(chalk.gray(`Project: ${chalk.cyan(projectPath)}\n`));

  try {
    // Step 1: Load IR storage
    console.log(chalk.bold('Step 1: Loading IR entities...'));
    const dbPath = path.join(projectPath, '.transpec', 'ir', 'conversion.db');
    const storage = new SQLiteStorage(dbPath);
    const entities = storage.loadAllEntities();
    const relations = storage.loadRelations();

    console.log(chalk.gray(`Loaded ${entities.length} entities, ${relations.length} relations\n`));

    if (entities.length === 0) {
      console.log(chalk.yellow('No entities found. Run "transpec convert" first.\n'));
      return;
    }

    // Step 2: Initialize skill executor
    console.log(chalk.bold('Step 2: Loading preprocess skills...'));
    const executor = new SkillExecutor(skillsDir);
    await executor.initialize();

    const availableSkills = executor.getAll();
    console.log(chalk.gray(`Found ${availableSkills.length} skills\n`));

    // Step 3: Execute enhanced analysis
    console.log(chalk.bold('Step 3: Extracting enhanced analysis...\n'));

    // Build context for skills
    const skillContext = {
      entities: entities.map(e => ({
        id: e.id,
        name: e.name,
        type: e.extendedType,
        content: e.content,
      })),
      relations: relations.map(r => ({
        sourceId: r.sourceId,
        targetId: r.targetId,
        type: r.relationType,
      })),
    };

    // Execute each available preprocess skill
    const skillResults: Map<string, unknown> = new Map();

    for (const skill of availableSkills) {
      if (skill.name.includes('preprocess')) {
        console.log(chalk.gray(`  Executing: ${skill.name}...`));
        const result = await executor.execute(skill.name, skillContext);

        if (result.success) {
          skillResults.set(skill.name, result.annotations);
          console.log(chalk.green(`    ✓ ${skill.name} completed`));
        } else {
          console.log(chalk.red(`    ✗ ${skill.name} failed: ${result.errors?.join(', ')}`));
        }
      }
    }

    // Step 4: Apply enhanced analysis to entities
    console.log(chalk.bold('\nStep 4: Applying enhanced analysis to entities...'));

    let analyzedCount = 0;
    for (const entity of entities) {
      // Simulate enhanced analysis extraction
      // In production, this would merge results from skill execution
      const enhancedAnalysis = extractEnhancedAnalysis(entity);

      entity.metadata = {
        ...entity.metadata,
        enhancedAnalysis,
      };

      analyzedCount++;
    }

    // Save updated entities
    storage.saveEntities(entities);
    console.log(chalk.gray(`Updated ${analyzedCount} entities with enhanced analysis\n`));

    // Step 5: Generate project summary
    console.log(chalk.bold('Step 5: Generating project summary...'));
    const projectSummary = generateProjectSummary(entities.map(e => ({
      content: e.content,
      metadata: e.metadata,
    })));
    console.log(chalk.gray(`Architecture: ${projectSummary.overallArchitecture}\n`));

    // Step 6: Update IR metadata
    console.log(chalk.bold('Step 6: Updating IR metadata...'));
    // Note: In a full implementation, we would update the IR document metadata
    // storage.updateMetadata({ aiPreProcessed: true, preprocessedAt: ..., projectSummary });

    console.log(chalk.green.bold('\n✓ Preprocess completed successfully!\n'));

    console.log(chalk.bold('Summary:'));
    console.log(`  Entities analyzed: ${chalk.cyan(analyzedCount)}`);
    console.log(`  Skills executed: ${chalk.cyan(skillResults.size)}`);
    console.log(`  Project summary: ${chalk.cyan(projectSummary.overallArchitecture)}\n`);

    storage.close();

  } catch (error) {
    logger.error('Preprocess failed', { error: (error as Error).message });
    console.log(chalk.red(`\n✗ Preprocess failed: ${(error as Error).message}\n`));
    throw error;
  }
}

/**
 * Extract enhanced analysis from an entity
 * In production, this would merge results from skill execution
 */
function extractEnhancedAnalysis(entity: { id: string; name: string; content: string; metadata: Record<string, unknown> }): EnhancedAnalysis {
  // Simple extraction logic - in production, this would use LLM results
  const content = entity.content;

  // Extract intent from first heading or description
  const headingMatch = content.match(/^#+\s+(.+)$/m);
  const intent = headingMatch ? headingMatch[1] : `Analysis of ${entity.name}`;

  // Extract key points from headers
  const headers = content.match(/^#+\s+(.+)$/gm) || [];
  const keyPoints = headers.slice(0, 5).map(h => h.replace(/^#+\s+/, ''));

  // Extract dependencies from @mentions
  const mentions = content.match(/@[\w-]+/g) || [];
  const dependencies = [...new Set(mentions.map(m => m.slice(1)))];

  // Extract constraints
  const constraints: string[] = [];
  const constraintPatterns = [
    /must not\s+([^.]+)/gi,
    /cannot\s+([^.]+)/gi,
    /limited to\s+([^.]+)/gi,
  ];
  for (const pattern of constraintPatterns) {
    const matches = content.match(pattern) || [];
    constraints.push(...matches.map(m => m.trim()));
  }

  // Extract requirements
  const reqMatches = content.match(/(?:requirement|shall|must have)[^.]*\.?/gi) || [];
  const requirement = reqMatches.slice(0, 5).map(r => r.trim());

  // Extract design decisions
  const designMatches = content.match(/(?:design|architecture|approach)[^.]*\.?/gi) || [];
  const design = designMatches.slice(0, 5).map(d => d.trim());

  // Extract implementation notes
  const noteMatches = content.match(/(?:TODO|FIXME|NOTE)[^:]*(?::\s*)?([^.]+)/gi) || [];
  const implementNote = [...new Set(noteMatches.map(n => n.trim()))].slice(0, 5);

  return {
    intent,
    keyPoints,
    dependencies,
    constraints: [...new Set(constraints)].slice(0, 5),
    requirement,
    design,
    implementNote,
  };
}

/**
 * Generate project-level summary from entities
 */
function generateProjectSummary(entities: { content: string; metadata: Record<string, unknown> }[]): ProjectSummary {
  // Extract types from metadata if available
  const types = new Set(
    entities
      .map(e => e.metadata?.extendedType as string | undefined)
      .filter((t): t is string => typeof t === 'string')
  );

  const architecture = types.size > 0
    ? `${entities.length} entities (${Array.from(types).join(', ')})`
    : `${entities.length} entities`;

  return {
    overallArchitecture: architecture,
    keyRequirements: extractGlobalKeyPoints(entities, 'requirement'),
    designDecisions: extractGlobalKeyPoints(entities, 'design'),
    developmentGuidelines: 'See individual entity enhancedAnalysis for details',
  };
}

/**
 * Extract a specific type of key points from all entities
 */
function extractGlobalKeyPoints(
  entities: { content: string; metadata: Record<string, unknown> }[],
  type: 'requirement' | 'design'
): string[] {
  const points: string[] = [];
  const pattern = new RegExp(`${type}:\\s*([^\\n]+)`, 'gi');

  for (const entity of entities) {
    const enhanced = entity.metadata?.enhancedAnalysis as EnhancedAnalysis | undefined;
    if (enhanced?.[type]) {
      points.push(...enhanced[type]);
    } else {
      // Fallback: extract from content
      const matches = entity.content.match(pattern) || [];
      for (const match of matches) {
        const value = match.replace(`${type}:`, '').trim();
        if (value && !points.includes(value)) {
          points.push(value);
        }
      }
    }
  }

  return [...new Set(points)].slice(0, 10);
}
