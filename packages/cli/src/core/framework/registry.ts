/**
 * Framework Adapter Registry
 *
 * Manages registration and lookup of framework adapters.
 */

import { FrameworkAdapter, FrameworkDetails } from './base-adapter.js';
import { FrameworkType } from '../ir/types.js';
import { OpenSpecAdapter } from './adapters/openspec.js';
import { TrellisAdapter } from './adapters/trellis.js';

export class FrameworkRegistry {
  private adapters: Map<FrameworkType, FrameworkAdapter> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register(new OpenSpecAdapter());
    this.register(new TrellisAdapter());
  }

  register(adapter: FrameworkAdapter): void {
    this.adapters.set(adapter.framework, adapter);
  }

  get(framework: FrameworkType): FrameworkAdapter | undefined {
    return this.adapters.get(framework);
  }

  getAll(): FrameworkAdapter[] {
    return Array.from(this.adapters.values());
  }

  async detect(projectPath: string): Promise<FrameworkDetails[]> {
    const results: FrameworkDetails[] = [];

    for (const adapter of this.adapters.values()) {
      const exists = await adapter.detect(projectPath);
      if (exists) {
        const details: FrameworkDetails = {
          framework: adapter.framework,
          entityCount: 0,
          path: projectPath,
        };

        if (adapter.getDetails) {
          const additionalDetails = await adapter.getDetails(projectPath);
          results.push({ ...details, ...additionalDetails });
        } else {
          results.push(details);
        }
      }
    }

    return results;
  }

  getSupportedFrameworks(): FrameworkType[] {
    return Array.from(this.adapters.keys());
  }
}

// Singleton instance
export const frameworkRegistry = new FrameworkRegistry();
