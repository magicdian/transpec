/**
 * Transpec Skill System
 *
 * Skills are markdown-based AI prompts that guide semantic analysis
 * during the conversion process. Each skill defines:
 * - When to invoke (trigger conditions)
 * - What to analyze (input/output contracts)
 * - How to format results
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger, LogModules } from '../logging/index.js';

const logger = getLogger(LogModules.AI);

export interface Skill {
  name: string;
  description: string;
  model?: 'opus' | 'sonnet' | 'haiku';
  trigger?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SkillContext {
  entities: Array<{
    id: string;
    name: string;
    type: string;
    content: string;
  }>;
  relations: Array<{
    sourceId: string;
    targetId: string;
    type: string;
  }>;
  options?: Record<string, unknown>;
}

export interface SkillResult {
  success: boolean;
  skill: string;
  annotations: Record<string, unknown>;
  errors?: string[];
}

/**
 * Skill Loader - Loads and manages skills from filesystem
 */
export class SkillLoader {
  private skills: Map<string, Skill> = new Map();
  private skillsDir: string;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir || this.getDefaultSkillsDir();
  }

  private getDefaultSkillsDir(): string {
    // In production, this would be relative to the installed package
    return path.join(process.cwd(), '.transpec', 'skills');
  }

  async loadAll(): Promise<void> {
    logger.debug('Loading skills from', { path: this.skillsDir });

    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillFile = path.join(this.skillsDir, entry.name, 'SKILL.md');
          try {
            const skill = await this.loadSkill(skillFile);
            this.skills.set(skill.name, skill);
            logger.debug('Loaded skill', { name: skill.name });
          } catch (error) {
            logger.warn('Failed to load skill', { name: entry.name, error });
          }
        }
      }

      logger.info('Skills loaded', { count: this.skills.size });
    } catch (error) {
      logger.warn('Skills directory not found or empty', { path: this.skillsDir });
    }
  }

  async loadSkill(filePath: string): Promise<Skill> {
    const content = await fs.readFile(filePath, 'utf-8');
    return this.parseSkill(content, filePath);
  }

  private parseSkill(content: string, filePath: string): Skill {
    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      throw new Error(`Invalid skill format: ${filePath}`);
    }

    const frontmatter = frontmatterMatch[1];
    const body = frontmatterMatch[2];

    const metadata: Record<string, string> = {};
    const lines = frontmatter.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        metadata[match[1]] = match[2];
      }
    }

    return {
      name: metadata.name || path.basename(path.dirname(filePath)),
      description: metadata.description || '',
      model: metadata.model as 'opus' | 'sonnet' | 'haiku' | undefined,
      trigger: metadata.trigger,
      content: body.trim(),
      metadata: metadata,
    };
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  getByTrigger(trigger: string): Skill[] {
    return this.getAll().filter(s => s.trigger === trigger);
  }
}

/**
 * Skill Executor - Runs skills against entities
 */
export class SkillExecutor {
  private loader: SkillLoader;
  private apiKey?: string;

  constructor(skillsDir?: string, apiKey?: string) {
    this.loader = new SkillLoader(skillsDir);
    this.apiKey = apiKey;
  }

  async initialize(): Promise<void> {
    await this.loader.loadAll();
  }

  /**
   * Execute a skill with given context
   * In a full implementation, this would call an AI API
   */
  async execute(skillName: string, context: SkillContext): Promise<SkillResult> {
    const skill = this.loader.get(skillName);

    if (!skill) {
      logger.error('Skill not found', { name: skillName });
      return {
        success: false,
        skill: skillName,
        annotations: {},
        errors: [`Skill '${skillName}' not found`],
      };
    }

    logger.info('Executing skill', { name: skillName, entities: context.entities.length });

    try {
      // Build prompt from skill content and context
      const prompt = this.buildPrompt(skill, context);

      // In a real implementation, this would call an AI API
      // For now, we simulate the execution
      const result = await this.simulateExecution(skill, context);

      logger.info('Skill execution complete', { name: skillName, success: result.success });
      return result;

    } catch (error) {
      logger.error('Skill execution failed', { name: skillName, error });
      return {
        success: false,
        skill: skillName,
        annotations: {},
        errors: [(error as Error).message],
      };
    }
  }

  private buildPrompt(skill: Skill, context: SkillContext): string {
    const entitySummary = context.entities
      .slice(0, 10) // Limit to first 10 for prompt size
      .map(e => `- ${e.type}: ${e.name}\n${e.content.slice(0, 200)}...`)
      .join('\n\n');

    return `${skill.content}

## Context

Entities to analyze:
${entitySummary}

## Instructions

Provide your analysis in JSON format:
{
  "annotations": {
    // Entity-specific annotations keyed by entity id
  },
  "relations": [
    // Any new relations discovered
  ],
  "summary": "Brief summary of findings"
}
`;
  }

  private async simulateExecution(skill: Skill, context: SkillContext): Promise<SkillResult> {
    // This is a placeholder that simulates AI execution
    // In production, this would call Anthropic API or similar

    const annotations: Record<string, unknown> = {};

    // Simulate basic analysis
    for (const entity of context.entities) {
      annotations[entity.id] = {
        analyzed: true,
        confidence: 0.8,
        suggestions: [],
      };
    }

    return {
      success: true,
      skill: skill.name,
      annotations,
    };
  }

  /**
   * Execute all applicable skills for a given trigger
   */
  async executeByTrigger(trigger: string, context: SkillContext): Promise<SkillResult[]> {
    const skills = this.loader.getByTrigger(trigger);
    const results: SkillResult[] = [];

    for (const skill of skills) {
      const result = await this.execute(skill.name, context);
      results.push(result);
    }

    return results;
  }
}
