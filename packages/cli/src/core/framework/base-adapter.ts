/**
 * Framework Adapter Base Interface
 *
 * New frameworks only need to implement this interface to integrate with transpec.
 * The Core IR schema does NOT change when adding new frameworks.
 */

import { createHash } from 'crypto';
import { CoreEntity, CoreType, FrameworkType } from '../ir/types.js';

export interface FrameworkAdapter {
  readonly framework: FrameworkType;
  readonly coreTypes: CoreType[];
  readonly supportedExtendedTypes: string[];

  /**
   * Detect if this framework exists in the given project path
   */
  detect(projectPath: string): Promise<boolean>;

  /**
   * Get details about the detected framework
   */
  getDetails?(projectPath: string): Promise<FrameworkDetails>;

  /**
   * Parse a single file to CoreEntity
   */
  parseFile(filePath: string): Promise<CoreEntity>;

  /**
   * Parse all files of this framework type
   */
  parseAll(projectPath: string): Promise<CoreEntity[]>;

  /**
   * Emit a CoreEntity to framework-specific format
   */
  emit(entity: CoreEntity, targetPath: string): Promise<void>;

  /**
   * Map framework-specific type to CoreType
   */
  mapToCoreType(frameworkType: string): CoreType;

  /**
   * Map CoreType to framework-specific types
   */
  mapFromCoreType(coreType: CoreType): string[];

  /**
   * Get file patterns this framework uses
   */
  getFilePatterns(): string[];
}

export interface FrameworkDetails {
  framework: FrameworkType;
  version?: string;
  entityCount: number;
  path: string;
  additionalInfo?: Record<string, unknown>;
}

export abstract class BaseFrameworkAdapter implements FrameworkAdapter {
  abstract readonly framework: FrameworkType;
  abstract readonly coreTypes: CoreType[];
  abstract readonly supportedExtendedTypes: string[];

  abstract detect(projectPath: string): Promise<boolean>;
  abstract parseFile(filePath: string): Promise<CoreEntity>;
  abstract parseAll(projectPath: string): Promise<CoreEntity[]>;
  abstract emit(entity: CoreEntity, targetPath: string): Promise<void>;

  mapToCoreType(frameworkType: string): CoreType {
    const mapping = this.getTypeMapping();
    return mapping[frameworkType] || CoreType.DOCUMENT;
  }

  mapFromCoreType(coreType: CoreType): string[] {
    const reverseMapping = this.getReverseTypeMapping();
    return reverseMapping[coreType] || [];
  }

  getFilePatterns(): string[] {
    return [];
  }

  protected abstract getTypeMapping(): Record<string, CoreType>;
  protected abstract getReverseTypeMapping(): Record<CoreType, string[]>;

  protected generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  protected generateStableId(
    prefix: string,
    ...parts: Array<string | number | boolean | null | undefined>
  ): string {
    const seed = parts
      .filter((part): part is string | number | boolean => part !== null && part !== undefined)
      .map(part => String(part).trim().toLowerCase())
      .filter(part => part.length > 0)
      .join('|');

    if (!seed) {
      return this.generateId(prefix);
    }

    const digest = createHash('sha1')
      .update(`${prefix}|${seed}`)
      .digest('hex')
      .slice(0, 16);
    return `${prefix}-${digest}`;
  }
}
