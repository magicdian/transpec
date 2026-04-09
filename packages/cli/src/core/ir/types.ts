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
 */
export interface IRMetadata {
  convertedAt: string;
  conversionMode: 'sampling' | 'full' | 'on-demand';
  aiAnalyzed: boolean;
  issues: ValidationIssue[];
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
