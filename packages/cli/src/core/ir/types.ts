/**
 * Core IR (Intermediate Representation)
 *
 * Design Philosophy: Stable ABI like LLVM IR
 * - Minimal and stable - new frameworks don't change this schema
 * - Framework-specific concepts are stored as strings (extendedType, relationType)
 * - All framework adapters convert to/from this common format
 */

export enum CoreType {
  DOCUMENT = 'DOCUMENT',
  WORKFLOW = 'WORKFLOW',
}

/**
 * CoreEntity - All frameworks use this common format
 *
 * Enhanced Analysis: Each entity can store framework-agnostic semantic analysis
 * in metadata.enhancedAnalysis with types: requirement, design, implement_note.
 */
export interface CoreEntity {
  id: string;
  name: string;
  coreType: CoreType;
  extendedType: string;
  content: string;
  metadata: Record<string, unknown>;
  sourceFramework: string;
  sourcePath: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Enhanced analysis stored in CoreEntity.metadata
 */
export interface EnhancedAnalysis {
  intent: string;              // 设计意图
  keyPoints: string[];         // 关键要点
  dependencies: string[];       // 依赖关系
  constraints: string[];        // 约束条件
  requirement?: string[];      // 需求定义 (通用类型)
  design?: string[];            // 设计决策 (通用类型)
  implementNote?: string[];     // 实现备注 (通用类型)
}

/**
 * CoreRelation - Generic relationship between entities
 * relationType is framework-defined: "implements", "depends_on", "follows", "triggers", etc.
 */
export interface CoreRelation {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  metadata?: Record<string, unknown>;
}

/**
 * IRDocument - Container for a conversion session
 */
export interface IRDocument {
  id: string;
  version: string;
  sourceFramework: string;
  targetFramework: string;
  entities: CoreEntity[];
  relations: CoreRelation[];
  metadata: IRMetadata;
}

/**
 * Metadata about the conversion
 *
 * aiPreProcessed: LLM pre-process completed (transpec-preprocess)
 * aiPostProcessed: AI post-process completed (transpec-apply)
 */
export interface IRMetadata {
  convertedAt: string;
  conversionMode: 'sampling' | 'full' | 'on-demand';
  aiPreProcessed: boolean;
  aiPostProcessed: boolean;
  issues: ValidationIssue[];

  // Pre-process results
  preprocessedAt?: string;
  preprocessedBy?: string;
  projectSummary?: ProjectSummary;
}

/**
 * Project-level summary extracted during pre-process
 */
export interface ProjectSummary {
  overallArchitecture: string;
  keyRequirements: string[];
  designDecisions: string[];
  developmentGuidelines: string;
}

/**
 * Validation issue
 */
export interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  entityId?: string;
  message: string;
}

/**
 * Framework types
 */
export type FrameworkType = 'openspec' | 'trellis' | 'speckit' | 'superpower';

/**
 * Conversion result
 */
export interface ConversionResult {
  success: boolean;
  conversionId: string;
  entitiesProcessed: number;
  issues: ValidationIssue[];
  outputPath?: string;
}
