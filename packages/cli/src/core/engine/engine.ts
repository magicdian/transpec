/**
 * Conversion Engine
 *
 * Orchestrates the conversion pipeline:
 * 1. Parse - Source files → Core IR
 * 2. Analyze - AI semantic analysis
 * 3. Transform - Framework-specific transformations
 * 4. Validate - Check conversion integrity
 * 5. Confirm - User confirmation
 * 6. Emit - Core IR → Target files
 */

import { LogModules, getLogger } from '../logging/index.js';
import { SQLiteStorage } from '../storage/sqlite.js';
import { FrameworkAdapter, FrameworkRegistry } from '../framework/index.js';
import { CoreEntity, CoreRelation, ConversionResult, EnhancedAnalysis, IRMetadata, PreprocessState, ValidationIssue, FrameworkType } from '../ir/types.js';
import { extractOpenSpecRequirementNames } from '../framework/adapters/openspec-format.js';
import { BatchProcessor } from './batch-processor.js';

const logger = getLogger(LogModules.ENGINE);
const RELATION_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'change',
  'changes',
  'cli',
  'command',
  'commands',
  'feature',
  'for',
  'from',
  'git',
  'in',
  'into',
  'is',
  'of',
  'on',
  'or',
  'project',
  'projects',
  'repo',
  'repository',
  'the',
  'this',
  'to',
  'tool',
  'tools',
  'with',
  'xgit',
]);

export enum ConversionPhase {
  PARSE = 'parse',
  ANALYZE = 'analyze',
  TRANSFORM = 'transform',
  VALIDATE = 'validate',
  CONFIRM = 'confirm',
  EMIT = 'emit',
}

export interface ConversionOptions {
  sourceFramework: string;
  targetFramework: string;
  projectPath: string;
  outputPath?: string;
  mode: 'sampling' | 'full' | 'on-demand';
  dryRun: boolean;
  analysisPrompt?: string;
}

export interface PhaseResult {
  phase: ConversionPhase;
  success: boolean;
  entitiesProcessed: number;
  issues: ValidationIssue[];
  duration?: number;
}

export class ConversionEngine {
  private storage: SQLiteStorage;
  private options: ConversionOptions;
  private sourceAdapter?: FrameworkAdapter;
  private targetAdapter?: FrameworkAdapter;
  private entities: CoreEntity[] = [];
  private relations: CoreRelation[] = [];
  private phaseResults: PhaseResult[] = [];

  constructor(options: ConversionOptions, dbPath: string) {
    this.options = options;
    this.storage = new SQLiteStorage(dbPath);
    logger.debug('ConversionEngine created', { options, dbPath });
  }

  async initialize(): Promise<void> {
    logger.info('Initializing conversion engine', {
      source: this.options.sourceFramework,
      target: this.options.targetFramework,
      mode: this.options.mode,
    });

    const registry = new FrameworkRegistry();
    this.sourceAdapter = registry.get(this.options.sourceFramework as FrameworkType);
    this.targetAdapter = registry.get(this.options.targetFramework as FrameworkType);

    if (!this.sourceAdapter) {
      throw new Error(`Source framework '${this.options.sourceFramework}' not supported`);
    }

    if (!this.targetAdapter) {
      throw new Error(`Target framework '${this.options.targetFramework}' not supported`);
    }

    logger.debug('Adapters loaded', {
      source: this.sourceAdapter.framework,
      target: this.targetAdapter.framework,
    });
  }

  async run(): Promise<ConversionResult> {
    const startTime = Date.now();
    let overallSuccess = true;

    try {
      // Phase 1: Parse
      logger.info(`[${ConversionPhase.PARSE}] Starting`);
      const parseResult = await this.runParsePhase();
      this.phaseResults.push(parseResult);
      if (!parseResult.success) overallSuccess = false;
      logger.info(`[${ConversionPhase.PARSE}] Completed`, { entities: parseResult.entitiesProcessed });

      // Phase 2: Analyze (if mode allows)
      if (this.options.mode !== 'on-demand') {
        logger.info(`[${ConversionPhase.ANALYZE}] Starting`, { mode: this.options.mode });
        const analyzeResult = await this.runAnalyzePhase();
        this.phaseResults.push(analyzeResult);
        if (!analyzeResult.success) overallSuccess = false;
      } else {
        logger.debug(`[${ConversionPhase.ANALYZE}] Skipped (on-demand mode)`);
      }

      // Phase 3: Transform
      logger.info(`[${ConversionPhase.TRANSFORM}] Starting`);
      const transformResult = await this.runTransformPhase();
      this.phaseResults.push(transformResult);
      if (!transformResult.success) overallSuccess = false;

      // Phase 4: Validate
      logger.info(`[${ConversionPhase.VALIDATE}] Starting`);
      const validateResult = await this.runValidatePhase();
      this.phaseResults.push(validateResult);
      if (!validateResult.success) overallSuccess = false;

      // Phase 5: Confirm (simplified - auto-confirm for now)
      logger.debug(`[${ConversionPhase.CONFIRM}] Auto-confirmed for CLI mode`);

      // Phase 6: Emit
      if (!this.options.dryRun) {
        logger.info(`[${ConversionPhase.EMIT}] Starting`);
        const emitResult = await this.runEmitPhase();
        this.phaseResults.push(emitResult);
        if (!emitResult.success) overallSuccess = false;
      } else {
        logger.info('Dry run - skipping emit phase');
      }

      // Log summary
      const duration = Date.now() - startTime;
      logger.info('Conversion completed', {
        success: overallSuccess,
        duration: `${duration}ms`,
        phases: this.phaseResults.map(p => p.phase).join(' → '),
      });

      return {
        success: overallSuccess,
        conversionId: `conv-${Date.now()}`,
        entitiesProcessed: this.entities.length,
        issues: this.phaseResults.flatMap(p => p.issues),
        outputPath: this.options.outputPath,
      };

    } catch (error) {
      logger.error('Conversion failed', { error: (error as Error).message });
      return {
        success: false,
        conversionId: `conv-${Date.now()}`,
        entitiesProcessed: this.entities.length,
        issues: [{ type: 'error', message: (error as Error).message }],
      };
    } finally {
      this.storage.close();
    }
  }

  async runParseOnly(): Promise<ConversionResult> {
    try {
      logger.info(`[${ConversionPhase.PARSE}] Starting parse-only execution`);
      const parseResult = await this.runParsePhase();
      this.phaseResults.push(parseResult);

      return {
        success: parseResult.success,
        conversionId: `conv-${Date.now()}`,
        entitiesProcessed: this.entities.length,
        issues: parseResult.issues,
        outputPath: this.options.outputPath,
      };
    } catch (error) {
      logger.error('Parse-only execution failed', { error: (error as Error).message });
      return {
        success: false,
        conversionId: `conv-${Date.now()}`,
        entitiesProcessed: this.entities.length,
        issues: [{ type: 'error', message: (error as Error).message }],
      };
    } finally {
      this.storage.close();
    }
  }

  private async runParsePhase(): Promise<PhaseResult> {
    const startTime = Date.now();
    const issues: ValidationIssue[] = [];

    try {
      logger.debug('Parsing source files', { adapter: this.sourceAdapter?.framework });

      if (!this.sourceAdapter) {
        throw new Error('Source adapter not initialized');
      }

      this.entities = await this.sourceAdapter.parseAll(this.options.projectPath);
      logger.debug('Entities parsed', { count: this.entities.length });

      // Extract relations from content (simplified)
      this.relations = this.extractRelations(this.entities);

      // Save to storage
      this.storage.saveEntities(this.entities);
      this.storage.saveRelations(this.relations);

      logger.debug('Entities saved to storage', { count: this.entities.length });

    } catch (error) {
      issues.push({ type: 'error', message: `Parse failed: ${(error as Error).message}` });
      logger.error('Parse phase failed', { error: (error as Error).message });
    }

    return {
      phase: ConversionPhase.PARSE,
      success: issues.length === 0,
      entitiesProcessed: this.entities.length,
      issues,
      duration: Date.now() - startTime,
    };
  }

  private async runAnalyzePhase(): Promise<PhaseResult> {
    const startTime = Date.now();
    const issues: ValidationIssue[] = [];

    try {
      logger.info('Starting B+C hybrid batch analysis', { entityCount: this.entities.length });

      // Create batch processor
      const batchProcessor = new BatchProcessor(this.entities, this.relations);

      // Process batches with simulated analyzer
      // In production, this would call an LLM API
      const preprocessState: PreprocessState = await batchProcessor.processBatches(
        async (batch, batchEntities) => {
          // Simulate LLM analysis
          // In production, this would call the SkillExecutor or LLM API
          return this.simulateEnhancedAnalysis(batchEntities);
        }
      );

      // Apply analysis results to entities
      this.entities = batchProcessor.applyAnalysisToEntities(this.entities, preprocessState);

      // Update metadata
      this.storage.saveEntities(this.entities);

      logger.info('Batch analysis completed', {
        batches: preprocessState.batches.length,
        entitiesAnalyzed: preprocessState.entityResults.size,
      });

    } catch (error) {
      issues.push({ type: 'error', message: `Analysis failed: ${(error as Error).message}` });
      logger.error('Analysis phase failed', { error: (error as Error).message });
    }

    return {
      phase: ConversionPhase.ANALYZE,
      success: issues.length === 0,
      entitiesProcessed: this.entities.length,
      issues,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Simulate enhanced analysis for development/testing
   * In production, this would call LLM APIs via SkillExecutor
   */
  private simulateEnhancedAnalysis(entities: CoreEntity[]): EnhancedAnalysis[] {
    return entities.map(entity => ({
      intent: `Analyze: ${entity.name}`,
      keyPoints: this.extractKeyPoints(entity.content),
      dependencies: this.extractDependencies(entity),
      constraints: this.extractConstraints(entity),
      requirement: this.extractRequirements(entity),
      design: this.extractDesign(entity),
      implementNote: this.extractImplementNotes(entity),
    }));
  }

  private extractKeyPoints(content: string): string[] {
    // Simple extraction - look for markdown headers
    const headers = content.match(/^#+\s+(.+)$/gm) || [];
    return headers.map(h => h.replace(/^#+\s+/, '')).slice(0, 5);
  }

  private extractDependencies(entity: CoreEntity): string[] {
    // Look for @mentions or reference patterns
    const mentions = entity.content.match(/@[\w-]+/g) || [];
    return [...new Set(mentions.map(m => m.slice(1)))];
  }

  private extractConstraints(entity: CoreEntity): string[] {
    // Look for constraint keywords
    const constraints: string[] = [];
    const constraintPatterns = [
      /must not\s+([^.]+)/gi,
      /cannot\s+([^.]+)/gi,
      /limited to\s+([^.]+)/gi,
      /only\s+([^.]+)/gi,
    ];

    for (const pattern of constraintPatterns) {
      const matches = entity.content.match(pattern) || [];
      constraints.push(...matches.map(m => m.trim()));
    }

    return [...new Set(constraints)].slice(0, 5);
  }

  private extractRequirements(entity: CoreEntity): string[] {
    // Look for requirement-like content
    const reqMatches = entity.content.match(/(?:requirement|shall|must have)[^.]*\.?/gi) || [];
    return reqMatches.map(r => r.trim()).slice(0, 5);
  }

  private extractDesign(entity: CoreEntity): string[] {
    // Look for design decisions in implementation notes
    const designMatches = entity.content.match(/(?:design|architecture|approach)[^.]*\.?/gi) || [];
    return designMatches.map(d => d.trim()).slice(0, 5);
  }

  private extractImplementNotes(entity: CoreEntity): string[] {
    // Look for TODO/NOTE comments
    const notes: string[] = [];
    const noteMatches = entity.content.match(/(?:TODO|FIXME|NOTE)[^:]*(?::\s*)?([^.]+)/gi) || [];
    notes.push(...noteMatches.map(n => n.trim()));
    return [...new Set(notes)].slice(0, 5);
  }

  private async runTransformPhase(): Promise<PhaseResult> {
    const startTime = Date.now();
    const issues: ValidationIssue[] = [];

    // Transform entities from source to target framework
    for (const entity of this.entities) {
      try {
        // Map extendedType if needed
        const originalType = entity.extendedType;
        const targetExtendedType = this.mapExtendedType(entity.extendedType);
        entity.extendedType = targetExtendedType;

        // Update metadata
        entity.metadata = {
          ...entity.metadata,
          convertedFrom: originalType,
          convertedTo: targetExtendedType,
          sourceExtendedType: entity.metadata.sourceExtendedType ?? originalType,
          convertedAt: new Date().toISOString(),
        };

        logger.debug('Entity transformed', {
          id: entity.id,
          originalType,
          newType: targetExtendedType,
        });

      } catch (error) {
        issues.push({
          type: 'warning',
          message: `Failed to transform entity ${entity.id}: ${(error as Error).message}`,
        });
      }
    }

    return {
      phase: ConversionPhase.TRANSFORM,
      success: issues.length === 0,
      entitiesProcessed: this.entities.length,
      issues,
      duration: Date.now() - startTime,
    };
  }

  private async runValidatePhase(): Promise<PhaseResult> {
    const startTime = Date.now();
    const issues: ValidationIssue[] = [];

    // Check entity integrity
    for (const entity of this.entities) {
      if (!entity.id) {
        issues.push({ type: 'error', message: 'Entity missing ID' });
      }
      if (!entity.name) {
        issues.push({ type: 'error', message: `Entity ${entity.id} missing name` });
      }
      if (!entity.extendedType) {
        issues.push({ type: 'error', message: `Entity ${entity.id} missing extendedType` });
      }
    }

    // Check relation integrity
    const entityIds = new Set(this.entities.map(e => e.id));
    for (const rel of this.relations) {
      if (!entityIds.has(rel.sourceId)) {
        issues.push({ type: 'warning', message: `Relation ${rel.id} references missing source` });
      }
      if (!entityIds.has(rel.targetId)) {
        issues.push({ type: 'warning', message: `Relation ${rel.id} references missing target` });
      }
    }

    logger.debug('Validation completed', { issues: issues.length });

    return {
      phase: ConversionPhase.VALIDATE,
      success: issues.filter(i => i.type === 'error').length === 0,
      entitiesProcessed: this.entities.length,
      issues,
      duration: Date.now() - startTime,
    };
  }

  private async runEmitPhase(): Promise<PhaseResult> {
    const startTime = Date.now();
    const issues: ValidationIssue[] = [];
    let emitted = 0;

    try {
      const outputPath = this.options.outputPath || this.options.projectPath;

      if (!this.targetAdapter) {
        throw new Error('Target adapter not initialized');
      }

      for (const entity of this.entities) {
        try {
          await this.targetAdapter.emit(entity, outputPath);
          emitted++;
          logger.debug('Entity emitted', { id: entity.id, path: outputPath });
        } catch (error) {
          issues.push({
            type: 'warning',
            message: `Failed to emit entity ${entity.id}: ${(error as Error).message}`,
          });
        }
      }

      logger.info('Emit completed', { emitted, total: this.entities.length });

    } catch (error) {
      issues.push({ type: 'error', message: `Emit failed: ${(error as Error).message}` });
      logger.error('Emit phase failed', { error: (error as Error).message });
    }

    return {
      phase: ConversionPhase.EMIT,
      success: issues.length === 0,
      entitiesProcessed: emitted,
      issues,
      duration: Date.now() - startTime,
    };
  }

  private extractRelations(entities: CoreEntity[]): CoreRelation[] {
    if (this.options.sourceFramework !== 'openspec') {
      return [];
    }

    const relations: CoreRelation[] = [];
    const emittedRelationIds = new Set<string>();
    const specEntities = entities
      .filter(entity => entity.extendedType === 'spec')
      .map(entity => ({
        entity,
        normalizedName: this.normalizeRelationName(entity.name),
        tokens: this.tokenizeRelationText(entity.name),
      }));

    for (const entity of entities) {
      if (entity.extendedType !== 'change') {
        continue;
      }

      const explicitRequirementNames = new Set(
        extractOpenSpecRequirementNames(entity.content)
          .map(name => this.normalizeRelationName(name))
          .filter(Boolean),
      );
      const fuzzyTokens = this.collectRelationTokens(entity);

      for (const spec of specEntities) {
        const matchedTokens = [...spec.tokens].filter(token => fuzzyTokens.has(token));
        const matchesExplicitRequirement = explicitRequirementNames.has(spec.normalizedName);
        const hasStrongToken = matchedTokens.some(token => token.length >= 5);
        const hasHeuristicMatch = matchedTokens.length >= 2 || hasStrongToken;

        if (!matchesExplicitRequirement && !hasHeuristicMatch) {
          continue;
        }

        const relationId = `rel-${entity.id}-${spec.entity.id}-implements`;
        if (emittedRelationIds.has(relationId)) {
          continue;
        }
        emittedRelationIds.add(relationId);

        relations.push({
          id: relationId,
          sourceId: entity.id,
          targetId: spec.entity.id,
          relationType: 'implements',
          metadata: {
            discovery: matchesExplicitRequirement ? 'requirement-header' : 'name-overlap',
            matchedTokens,
          },
        });

        logger.debug('Found spec relation', {
          change: entity.name,
          spec: spec.entity.name,
          matchedTokens,
          discovery: matchesExplicitRequirement ? 'requirement-header' : 'name-overlap',
        });
      }
    }

    return relations;
  }

  private collectRelationTokens(entity: CoreEntity): Set<string> {
    const metadataValues = [
      entity.name,
      entity.content,
      typeof entity.metadata.sourceTitle === 'string' ? entity.metadata.sourceTitle : '',
      typeof entity.metadata.sourceDescription === 'string' ? entity.metadata.sourceDescription : '',
    ];
    return this.tokenizeRelationText(metadataValues.join('\n'));
  }

  private normalizeRelationName(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private tokenizeRelationText(value: string): Set<string> {
    return new Set(
      this.normalizeRelationName(value)
        .split(' ')
        .filter(token => token.length >= 3 && !RELATION_STOPWORDS.has(token)),
    );
  }

  private mapExtendedType(type: string): string {
    // Map between framework types
    const typeMap: Record<string, Record<string, string>> = {
      'openspec-to-trellis': {
        'change': 'task',
        'spec': 'spec',
      },
      'trellis-to-openspec': {
        'task': 'change',
        'spec': 'spec',
      },
    };

    const key = `${this.options.sourceFramework}-to-${this.options.targetFramework}`;
    return typeMap[key]?.[type] || type;
  }

  getPhaseResults(): PhaseResult[] {
    return this.phaseResults;
  }

  /**
   * Run Transform + Emit phases only (for apply command)
   * Assumes Parse has already been done (by preprocess)
   */
  async runTransformEmit(): Promise<ConversionResult> {
    const startTime = Date.now();
    let overallSuccess = true;

    try {
      // Load entities from storage
      this.entities = this.storage.loadAllEntities();
      this.relations = this.storage.loadRelations();
      logger.debug('Entities loaded from storage', { count: this.entities.length });

      // Phase 3: Transform
      logger.info(`[${ConversionPhase.TRANSFORM}] Starting`);
      const transformResult = await this.runTransformPhase();
      this.phaseResults.push(transformResult);
      if (!transformResult.success) overallSuccess = false;

      // Phase 4: Validate
      logger.info(`[${ConversionPhase.VALIDATE}] Starting`);
      const validateResult = await this.runValidatePhase();
      this.phaseResults.push(validateResult);
      if (!validateResult.success) overallSuccess = false;

      // Phase 5: Confirm (auto-confirm)
      logger.debug(`[${ConversionPhase.CONFIRM}] Auto-confirmed for CLI mode`);

      // Phase 6: Emit
      if (!this.options.dryRun) {
        logger.info(`[${ConversionPhase.EMIT}] Starting`);
        const emitResult = await this.runEmitPhase();
        this.phaseResults.push(emitResult);
        if (!emitResult.success) overallSuccess = false;
      } else {
        logger.info('Dry run - skipping emit phase');
      }

      const duration = Date.now() - startTime;
      logger.info('Transform+Emit completed', {
        success: overallSuccess,
        duration: `${duration}ms`,
      });

      return {
        success: overallSuccess,
        conversionId: `conv-${Date.now()}`,
        entitiesProcessed: this.entities.length,
        issues: this.phaseResults.flatMap(p => p.issues),
        outputPath: this.options.outputPath,
      };

    } catch (error) {
      logger.error('Transform+Emit failed', { error: (error as Error).message });
      return {
        success: false,
        conversionId: `conv-${Date.now()}`,
        entitiesProcessed: this.entities.length,
        issues: [{ type: 'error', message: (error as Error).message }],
      };
    }
  }
}
