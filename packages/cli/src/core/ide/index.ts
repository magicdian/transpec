/**
 * IDE Registry - Manages IDE adapters for skill generation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger, LogModules } from '../logging/index.js';

const logger = getLogger(LogModules.CLI);

/**
 * IDE Adapter interface
 * Each IDE (Claude Code, Cursor, etc.) implements this to provide
 * detection and configuration capabilities.
 */
export interface IdeAdapter {
  /** Unique identifier for the IDE */
  readonly ide: string;
  /** Human-readable display name */
  readonly displayName: string;
  /** Directory name for IDE-specific files (e.g., '.claude', '.cursor') */
  readonly skillsDir: string;
  /** CLI flag for this IDE (e.g., '--claude-code') */
  readonly cliFlag?: string;

  /**
   * Detect if this IDE is configured in the project
   * @param projectPath - Root path of the project
   * @returns true if IDE configuration is detected
   */
  detect(projectPath: string): Promise<boolean>;

  /**
   * Configure this IDE for use with transpec
   * @param projectPath - Root path of the project
   */
  configure(projectPath: string, options: IdeSetupOptions): Promise<void>;
}

export interface IdeSetupOptions {
  sourceFramework: string;
  targetFramework: string;
  preprocessSkillPath: string;
  postprocessSkillPath: string;
  preprocessContextPath: string;
  enhancedAnalysisPath: string;
  postprocessContextPath: string;
}

/**
 * IDE Registry - Singleton registry for IDE adapters
 */
export class IdeRegistry {
  private static instance: IdeRegistry;
  private adapters: Map<string, IdeAdapter> = new Map();

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): IdeRegistry {
    if (!IdeRegistry.instance) {
      IdeRegistry.instance = new IdeRegistry();
    }
    return IdeRegistry.instance;
  }

  /**
   * Register an IDE adapter
   * @param adapter - The IDE adapter to register
   */
  register(adapter: IdeAdapter): void {
    if (this.adapters.has(adapter.ide)) {
      logger.warn('IDE adapter already registered, overwriting', { ide: adapter.ide });
    }
    this.adapters.set(adapter.ide, adapter);
    logger.debug('IDE adapter registered', { ide: adapter.ide, displayName: adapter.displayName });
  }

  /**
   * Get an IDE adapter by IDE identifier
   * @param ide - The IDE identifier
   * @returns The adapter or undefined if not found
   */
  get(ide: string): IdeAdapter | undefined {
    return this.adapters.get(ide);
  }

  /**
   * Detect which IDE is configured in a project
   * @param projectPath - Root path of the project
   * @returns The first detected IDE adapter, or undefined if none detected
   */
  async detect(projectPath: string): Promise<IdeAdapter | undefined> {
    logger.debug('Detecting IDE in project', { path: projectPath });

    for (const adapter of this.adapters.values()) {
      try {
        const detected = await adapter.detect(projectPath);
        if (detected) {
          logger.info('IDE detected', { ide: adapter.ide, displayName: adapter.displayName });
          return adapter;
        }
      } catch (error) {
        logger.warn('Error detecting IDE', { ide: adapter.ide, error });
      }
    }

    logger.debug('No IDE detected');
    return undefined;
  }

  /**
   * Get list of all registered IDE identifiers
   * @returns Array of IDE identifiers
   */
  getSupportedIdes(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get all registered IDE adapters
   * @returns Array of IDE adapters
   */
  getAllAdapters(): IdeAdapter[] {
    return Array.from(this.adapters.values());
  }
}

/**
 * Check if a path exists and is a directory
 */
export async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if running in interactive terminal
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY && process.env.TERM !== 'dumb';
}

// Re-export adapters
export { ClaudeCodeAdapter } from './adapters/claude-code.js';
