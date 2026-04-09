# Framework Adapter Pattern

> How to implement framework adapters for Transpec.

---

## Overview

Framework adapters translate between framework-specific formats and the universal Core IR. Each framework (OpenSpec, Trellis, etc.) has its own adapter that implements the `FrameworkAdapter` interface.

**Key principle**: Adding a new framework requires NO changes to Core IR or existing adapters.

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Source Format  │ ──▶ │   Core IR       │ ──▶ │  Target Format  │
│  (OpenSpec)     │     │   (Stable)      │     │  (Trellis)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                        │                        │
        ▼                        ▼                        ▼
  OpenSpecAdapter          CoreEntity              TrellisAdapter
  parseFile()              CoreRelation            emit()
  parseAll()                                         emit()
```

---

## FrameworkAdapter Interface

```typescript
export interface FrameworkAdapter {
  readonly framework: FrameworkType;           // 'openspec' | 'trellis' | etc.
  readonly coreTypes: CoreType[];              // Which CoreTypes this adapter handles
  readonly supportedExtendedTypes: string[];   // Framework-specific types

  // Detection
  detect(projectPath: string): Promise<boolean>;
  getDetails?(projectPath: string): Promise<FrameworkDetails>;

  // Parsing (framework format → Core IR)
  parseFile(filePath: string): Promise<CoreEntity>;
  parseAll(projectPath: string): Promise<CoreEntity[]>;

  // Emission (Core IR → framework format)
  emit(entity: CoreEntity, targetPath: string): Promise<void>;

  // Type mapping
  mapToCoreType(frameworkType: string): CoreType;
  mapFromCoreType(coreType: CoreType): string[];

  // File patterns for this framework
  getFilePatterns(): string[];
}
```

---

## BaseFrameworkAdapter

Abstract base class providing common functionality:

```typescript
export abstract class BaseFrameworkAdapter implements FrameworkAdapter {
  abstract readonly framework: FrameworkType;
  abstract readonly coreTypes: CoreType[];
  abstract readonly supportedExtendedTypes: string[];

  // Required to implement
  abstract detect(projectPath: string): Promise<boolean>;
  abstract parseFile(filePath: string): Promise<CoreEntity>;
  abstract parseAll(projectPath: string): Promise<CoreEntity[]>;
  abstract emit(entity: CoreEntity, targetPath: string): Promise<void>;

  // Provided implementations
  mapToCoreType(frameworkType: string): CoreType { ... }
  mapFromCoreType(coreType: CoreType): string[] { ... }
  getFilePatterns(): string[] { return []; }

  protected abstract getTypeMapping(): Record<string, CoreType>;
  protected abstract getReverseTypeMapping(): Record<CoreType, string[]>;

  protected generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
```

---

## Required Adapter Methods

### 1. `detect(projectPath: string): Promise<boolean>`

Detects if this framework exists in the project. Use marker files/directories:

```typescript
// Example from TrellisAdapter
private readonly markers = [
  '.trellis/config.yaml',
  '.trellis/tasks/',
  '.trellis/spec/'
];

async detect(projectPath: string): Promise<boolean> {
  for (const marker of this.markers) {
    const fullPath = path.join(projectPath, marker);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}
```

### 2. `parseFile(filePath: string): Promise<CoreEntity>`

Parse a single file to CoreEntity:

```typescript
async parseFile(filePath: string): Promise<CoreEntity> {
  const content = await fs.readFile(filePath, 'utf-8');
  const now = new Date().toISOString();

  return {
    id: this.generateId(`openspec-${extendedType}`),
    name: this.extractName(filePath),
    coreType: this.mapToCoreType(extendedType),
    extendedType,
    content,  // Always preserve original content
    metadata: this.parseMetadata(content, extendedType, filePath),
    sourceFramework: this.framework,
    sourcePath: filePath,
    createdAt: now,
    updatedAt: now
  };
}
```

### 3. `parseAll(projectPath: string): Promise<CoreEntity[]>`

Parse all entities of this framework type:

```typescript
async parseAll(projectPath: string): Promise<CoreEntity[]> {
  const entities: CoreEntity[] = [];
  const frameworkPath = path.join(projectPath, this.framework);

  // Walk directories and parse each file
  const dirs = await fs.readdir(frameworkPath);
  for (const dir of dirs) {
    if (dir.startsWith('.')) continue;  // Skip hidden
    const fullPath = path.join(frameworkPath, dir);
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      // Parse files in directory
      const files = await fs.readdir(fullPath);
      for (const file of files) {
        const entity = await this.parseFile(path.join(fullPath, file));
        entities.push(entity);
      }
    }
  }

  return entities;
}
```

### 4. `emit(entity: CoreEntity, targetPath: string): Promise<void>`

Write CoreEntity to framework-specific format:

```typescript
async emit(entity: CoreEntity, targetPath: string): Promise<void> {
  const isTask = entity.extendedType === 'task';
  const baseDir = path.join(targetPath, this.framework, isTask ? 'tasks' : 'specs');
  await fs.mkdir(baseDir, { recursive: true });

  const fileName = isTask ? 'proposal.md' : 'spec.md';
  const filePath = path.join(baseDir, this.slugify(entity.name), fileName);

  await fs.writeFile(filePath, entity.content);
}
```

### 5. Type Mapping Methods

```typescript
protected getTypeMapping(): Record<string, CoreType> {
  return {
    'change': CoreType.DOCUMENT,  // OpenSpec
    'spec': CoreType.DOCUMENT,
    'task': CoreType.WORKFLOW,    // Trellis
  };
}

protected getReverseTypeMapping(): Record<CoreType, string[]> {
  return {
    [CoreType.DOCUMENT]: ['change', 'spec'],
    [CoreType.WORKFLOW]: ['task'],
  };
}
```

---

## FrameworkRegistry

Singleton registry for looking up adapters:

```typescript
export class FrameworkRegistry {
  private adapters: Map<FrameworkType, FrameworkAdapter> = new Map();

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
      if (await adapter.detect(projectPath)) {
        results.push({
          framework: adapter.framework,
          entityCount: 0,
          path: projectPath,
          ...(adapter.getDetails ? await adapter.getDetails(projectPath) : {})
        });
      }
    }
    return results;
  }
}

export const frameworkRegistry = new FrameworkRegistry();
```

---

## Adding a New Framework Adapter

### Step 1: Create the adapter file

```typescript
// src/core/framework/adapters/newframework.ts
import { BaseFrameworkAdapter } from '../base-adapter.js';
import { CoreEntity, CoreType, FrameworkType } from '../../ir/types.js';
import { getLogger, LogModules } from '../../logging/index.js';

const logger = getLogger(LogModules.ADAPTER);

export class NewFrameworkAdapter extends BaseFrameworkAdapter {
  readonly framework: FrameworkType = 'newframework';
  readonly coreTypes: CoreType[] = [CoreType.DOCUMENT, CoreType.WORKFLOW];
  readonly supportedExtendedTypes = ['item', 'spec'];

  async detect(projectPath: string): Promise<boolean> {
    // Check for marker files
  }

  async parseFile(filePath: string): Promise<CoreEntity> { ... }
  async parseAll(projectPath: string): Promise<CoreEntity[]> { ... }
  async emit(entity: CoreEntity, targetPath: string): Promise<void> { ... }

  protected getTypeMapping(): Record<string, CoreType> {
    return { 'item': CoreType.WORKFLOW, 'spec': CoreType.DOCUMENT };
  }

  protected getReverseTypeMapping(): Record<CoreType, string[]> {
    return { [CoreType.WORKFLOW]: ['item'], [CoreType.DOCUMENT]: ['spec'] };
  }
}
```

### Step 2: Register in registry

```typescript
// src/core/framework/registry.ts
import { NewFrameworkAdapter } from './adapters/newframework.js';

register(new NewFrameworkAdapter());
```

### Step 3: Add to FrameworkType enum

```typescript
// src/core/ir/types.ts
export type FrameworkType = 'openspec' | 'trellis' | 'newframework';
```

---

## Required File Patterns

Each adapter should specify which files it handles:

```typescript
getFilePatterns(): string[] {
  return [
    'openspec/specs/*/spec.md',
    'openspec/changes/*/proposal.md'
  ];
}
```

This enables:
- Framework detection
- Selective parsing
- Validation of parse coverage

---

## Common Mistakes

### 1. Modifying content during parsing

```typescript
// BAD - transforms content
entity.content = entity.content.replace(/\r\n/g, '\n');

// GOOD - content stays as-is, only metadata extracted
entity.metadata.lineEndings = detectLineEndings(content);
```

### 2. Not handling missing files gracefully

```typescript
// BAD - crashes on missing optional file
const designContent = await fs.readFile(designPath, 'utf-8');

// GOOD - handle gracefully
let designContent: string | undefined;
try {
  designContent = await fs.readFile(designPath, 'utf-8');
} catch {
  logger.debug('No design.md found', { changeDir });
}
entity.metadata.designContent = designContent;
```

### 3. Forgetting to implement `getDetails`

```typescript
// GOOD - provides useful metadata
async getDetails(projectPath: string): Promise<FrameworkDetails> {
  const entityCount = (await this.parseAll(projectPath)).length;
  return {
    framework: this.framework,
    entityCount,
    path: projectPath
  };
}
```

---

## Testing Adapter

Each adapter should be tested with:

1. **Detection**: Correctly identifies framework in valid project
2. **Parsing**: All entity types parse correctly
3. **Round-trip**: Parse → Emit → Parse produces equivalent result
4. **Edge cases**: Missing optional files, empty directories

---

## References

- Base interface: `packages/cli/src/core/framework/base-adapter.ts`
- Registry: `packages/cli/src/core/framework/registry.ts`
- Trellis adapter: `packages/cli/src/core/framework/adapters/trellis.ts`
- OpenSpec adapter: `packages/cli/src/core/framework/adapters/openspec.ts`
