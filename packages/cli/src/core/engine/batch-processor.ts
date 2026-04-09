/**
 * B+C Hybrid Batch Processor
 *
 * Implements relation-driven batch processing for large projects:
 * 1. Build dependency graph from CoreRelations
 * 2. Topological sort to determine processing order
 * 3. Group into batches by context size limit
 * 4. Process each batch with preceding summaries as context
 * 5. Merge results
 */

import { CoreEntity, CoreRelation, EnhancedAnalysis, PreprocessBatch, PreprocessState, ProjectSummary } from '../ir/types.js';
import { LogModules, getLogger } from '../logging/index.js';

const logger = getLogger(LogModules.ENGINE);

/**
 * Context size limit for a single batch (approximate token limit)
 * Reserve space for prompt overhead
 */
const BATCH_CONTEXT_LIMIT = 4000;

export interface BatchProcessorOptions {
  /** Max context size per batch (in tokens/characters) */
  contextLimit?: number;
  /** Whether to preserve relation order */
  preserveRelations?: boolean;
}

/**
 * BatchProcessor - Implements B+C hybrid strategy for large project processing
 */
export class BatchProcessor {
  private entities: CoreEntity[];
  private relations: CoreRelation[];
  private options: Required<BatchProcessorOptions>;

  constructor(entities: CoreEntity[], relations: CoreRelation[], options: BatchProcessorOptions = {}) {
    this.entities = entities;
    this.relations = relations;
    this.options = {
      contextLimit: options.contextLimit ?? BATCH_CONTEXT_LIMIT,
      preserveRelations: options.preserveRelations ?? true,
    };
  }

  /**
   * Compute the depth of each entity in the dependency graph
   * Entities with no dependencies have depth 0
   */
  computeEntityDepths(): Map<string, number> {
    const depths = new Map<string, number>();
    const entityIds = new Set(this.entities.map(e => e.id));

    // Build reverse relation map: targetId -> sourceIds
    const dependents = new Map<string, Set<string>>();
    for (const entity of this.entities) {
      dependents.set(entity.id, new Set());
    }
    for (const rel of this.relations) {
      const deps = dependents.get(rel.targetId);
      if (deps && entityIds.has(rel.sourceId)) {
        deps.add(rel.sourceId);
      }
    }

    // Compute depth via recursion with memoization
    const computeDepth = (entityId: string): number => {
      const cached = depths.get(entityId);
      if (cached !== undefined) return cached;

      const deps = dependents.get(entityId);
      if (!deps || deps.size === 0) {
        depths.set(entityId, 0);
        return 0;
      }

      let maxDepth = 0;
      for (const depId of deps) {
        maxDepth = Math.max(maxDepth, computeDepth(depId) + 1);
      }
      depths.set(entityId, maxDepth);
      return maxDepth;
    };

    for (const entity of this.entities) {
      computeDepth(entity.id);
    }

    return depths;
  }

  /**
   * Group entities into batches based on depth and context size
   */
  createBatches(): PreprocessBatch[] {
    const depths = this.computeEntityDepths();
    const batches: PreprocessBatch[] = [];

    // Group entities by depth
    const entitiesByDepth = new Map<number, CoreEntity[]>();
    for (const entity of this.entities) {
      const depth = depths.get(entity.id) ?? 0;
      if (!entitiesByDepth.has(depth)) {
        entitiesByDepth.set(depth, []);
      }
      entitiesByDepth.get(depth)!.push(entity);
    }

    // Sort depths and process
    const sortedDepths = Array.from(entitiesByDepth.keys()).sort((a, b) => a - b);
    let batchId = 0;
    let currentBatchEntityIds: string[] = [];
    let currentBatchSize = 0;
    const precedingBatchSummaries: string[] = [];

    for (const depth of sortedDepths) {
      const entitiesAtDepth = entitiesByDepth.get(depth)!;

      for (const entity of entitiesAtDepth) {
        const entitySize = this.estimateEntitySize(entity);

        // Check if adding this entity would exceed context limit
        const projectedSize = currentBatchSize + entitySize + precedingBatchSummaries.join('\n').length;

        if (currentBatchEntityIds.length > 0 && projectedSize > this.options.contextLimit) {
          // Finalize current batch
          batches.push({
            batchId: batchId++,
            entityIds: currentBatchEntityIds,
            dependencies: this.getBatchDependencies(currentBatchEntityIds),
            contextSummary: precedingBatchSummaries.join('\n\n') || undefined,
            results: [],
          });

          // Start new batch
          currentBatchEntityIds = [entity.id];
          currentBatchSize = entitySize;
        } else {
          currentBatchEntityIds.push(entity.id);
          currentBatchSize += entitySize;
        }
      }

      // After processing all entities at this depth, finalize batch if needed
      if (currentBatchEntityIds.length > 0) {
        batches.push({
          batchId: batchId++,
          entityIds: currentBatchEntityIds,
          dependencies: this.getBatchDependencies(currentBatchEntityIds),
          contextSummary: precedingBatchSummaries.join('\n\n') || undefined,
          results: [],
        });

        // Add summary of this batch to preceding summaries
        precedingBatchSummaries.push(this.generateBatchSummary(batches[batches.length - 1]));

        currentBatchEntityIds = [];
        currentBatchSize = 0;
      }
    }

    logger.debug('Created batches', { count: batches.length, depths: sortedDepths.length });
    return batches;
  }

  /**
   * Estimate the "size" of an entity for context limit calculation
   */
  private estimateEntitySize(entity: CoreEntity): number {
    // Rough estimate: content + name + metadata
    return entity.content.length + entity.name.length + JSON.stringify(entity.metadata).length;
  }

  /**
   * Get IDs of entities that this batch depends on (from earlier batches)
   */
  private getBatchDependencies(batchEntityIds: string[]): string[] {
    const batchSet = new Set(batchEntityIds);
    const dependencyIds = new Set<string>();

    for (const rel of this.relations) {
      // If target is in current batch, add source as dependency
      if (batchSet.has(rel.targetId) && !batchSet.has(rel.sourceId)) {
        dependencyIds.add(rel.sourceId);
      }
    }

    return Array.from(dependencyIds);
  }

  /**
   * Generate a summary for a batch (for context of subsequent batches)
   */
  private generateBatchSummary(batch: PreprocessBatch): string {
    const entities = this.entities.filter(e => batch.entityIds.includes(e.id));
    const summaries = entities.map(e => `${e.name}: ${e.content.slice(0, 100)}...`);
    return `Batch ${batch.batchId} (${entities.length} entities):\n${summaries.join('\n')}`;
  }

  /**
   * Process all batches and merge results
   * Note: Actual LLM analysis is delegated to the caller via the analyzer callback
   */
  async processBatches(
    analyzer: (batch: PreprocessBatch, entities: CoreEntity[]) => Promise<EnhancedAnalysis[]>
  ): Promise<PreprocessState> {
    const batches = this.createBatches();
    const entityResults = new Map<string, EnhancedAnalysis>();
    const allSummaries: string[] = [];

    for (const batch of batches) {
      const batchEntities = this.entities.filter(e => batch.entityIds.includes(e.id));

      logger.debug('Processing batch', {
        batchId: batch.batchId,
        entityCount: batchEntities.length,
        contextSummary: batch.contextSummary?.slice(0, 100),
      });

      try {
        // Run analysis on this batch
        const results = await analyzer(batch, batchEntities);
        batch.results = results;

        // Map results to entities
        for (let i = 0; i < batch.entityIds.length; i++) {
          entityResults.set(batch.entityIds[i], results[i]);
        }

        // Add batch summary for subsequent batches
        allSummaries.push(this.formatBatchSummary(batch, results));
      } catch (error) {
        logger.error('Batch processing failed', {
          batchId: batch.batchId,
          error: (error as Error).message,
        });
        // Continue with other batches
      }
    }

    return {
      batches,
      entityResults,
      globalSummary: this.generateGlobalSummary(allSummaries, batches.length),
    };
  }

  /**
   * Format batch results as a summary string
   */
  private formatBatchSummary(batch: PreprocessBatch, results: EnhancedAnalysis[]): string {
    const summaryParts = results.map((r, i) => {
      const entity = this.entities.find(e => e.id === batch.entityIds[i]);
      return `## ${entity?.name ?? batch.entityIds[i]}\nIntent: ${r.intent}\nKey Points: ${r.keyPoints.join(', ')}`;
    });
    return summaryParts.join('\n\n');
  }

  /**
   * Generate project-level summary from all batch summaries
   */
  private generateGlobalSummary(batchSummaries: string[], batchCount: number): ProjectSummary {
    // In a full implementation, this would use LLM to generate the summary
    // For now, we create a basic summary
    return {
      overallArchitecture: `Project with ${this.entities.length} entities across ${batchCount} batches`,
      keyRequirements: this.extractKeyPoints(batchSummaries, 'requirement'),
      designDecisions: this.extractKeyPoints(batchSummaries, 'design'),
      developmentGuidelines: 'See individual entity enhancedAnalysis for details',
    };
  }

  /**
   * Extract a specific type of key points from batch summaries
   */
  private extractKeyPoints(summaries: string[], type: 'requirement' | 'design'): string[] {
    // Simple extraction - in production, this would be LLM-powered
    const points: string[] = [];
    for (const summary of summaries) {
      const matches = summary.match(new RegExp(`${type}:\\s*([^\\n]+)`, 'g'));
      if (matches) {
        for (const match of matches) {
          const value = match.replace(`${type}:`, '').trim();
          if (value && !points.includes(value)) {
            points.push(value);
          }
        }
      }
    }
    return points;
  }

  /**
   * Update entities with enhanced analysis results
   */
  applyAnalysisToEntities(
    entities: CoreEntity[],
    state: PreprocessState
  ): CoreEntity[] {
    return entities.map(entity => {
      const analysis = state.entityResults.get(entity.id);
      if (!analysis) return entity;

      return {
        ...entity,
        metadata: {
          ...entity.metadata,
          enhancedAnalysis: analysis,
        },
      };
    });
  }
}
