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
    // parse-time fallback only
  }

  protected generateStableId(
    prefix: string,
    ...parts: Array<string | number | boolean | null | undefined>
  ): string {
    // hash(prefix + stable seed)
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
  const metadata = this.parseMetadata(content, extendedType, filePath);

  return {
    id: this.buildEntityId(filePath, extendedType, metadata),
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

### Adapter Identity Rule

`parseFile()` may use `generateId()` only as a true last-resort fallback. Adapters that parse persisted framework artifacts MUST derive entity identity from stable source references such as:

- framework slug or manifest name
- source-relative file path
- task/spec directory key
- target framework native ID in `task.json`

---

## Scenario: Deterministic Identity And Workflow-Target Emit

### 1. Scope / Trigger

- Trigger: An adapter parses persisted source files that later feed workspace JSON, relations, enhanced analysis, or target workflow tooling.
- Trigger: An adapter emits into a workflow-driven target such as Trellis where downstream tools auto-read task directories, workflow files, and spec indexes.

### 2. Signatures

Relevant signatures in the current implementation:

```typescript
protected generateStableId(
  prefix: string,
  ...parts: Array<string | number | boolean | null | undefined>
): string

private buildEntityId(
  filePath: string,
  extendedType: string,
  metadata?: Record<string, unknown>,
): string

private async ensureWorkflowSkeleton(targetPath: string): Promise<void>

private async writeTaskContextFiles(
  taskDir: string,
  devType: 'backend' | 'frontend' | 'fullstack',
): Promise<void>
```

### 3. Contracts

- `buildEntityId(...)` MUST derive the same ID for the same source entity across parse reruns.
- OpenSpec change IDs SHOULD prefer manifest slug or stable change directory reference over timestamps or process-local randomness.
- Trellis task IDs SHOULD prefer task directory key or `task.json.id` over parse-time randomness.
- Emitting into Trellis MUST create the minimum runtime skeleton if it does not already exist:
  - `.trellis/workflow.md`
  - `.trellis/spec/backend/index.md`
  - `.trellis/spec/frontend/index.md`
  - `.trellis/spec/guides/index.md`
- Archived source work MUST emit into `.trellis/tasks/archive/<YYYY-MM>/<MM-DD-slug>/`.
- Active work MUST emit into `.trellis/tasks/<MM-DD-slug>/`.
- Every emitted Trellis task MUST include `implement.jsonl`, `check.jsonl`, and `debug.jsonl`.
- Emit helpers may preserve existing bootstrap files, but they MUST NOT skip required runtime files altogether.

### 4. Validation & Error Matrix

| Condition | Expected behavior | Severity |
|-----------|-------------------|----------|
| Same source file parsed twice | Same `CoreEntity.id` is produced | error if unstable |
| Target bootstrap file already exists | Preserve existing file, do not overwrite blindly | info |
| Archived change emitted into active task root | Treat as incorrect adapter output | error |
| Task emitted without context jsonl files | Treat as incorrect adapter output | error |
| Adapter lacks stable seed for an entity | Use fallback ID only for non-persisted or non-contractual cases | warning |

### 5. Good/Base/Bad Cases

#### Good

- OpenSpec adapter derives change IDs from `.openspec.yaml.name` or stable archive path, so rerunning `preprocess` keeps the same entity IDs.
- Trellis adapter emits archive imports into `.trellis/tasks/archive/2026-04/04-01-xgit-auto-remote-push/` and writes all three context jsonl files.

#### Base

- Target project already contains `.trellis/workflow.md`; emit preserves it and creates only missing indexes or task runtime files.
- A Trellis task parsed from `task.json.id` produces the same identity even if `prd.md` content changes.

#### Bad

- Adapter uses `Date.now()` or `Math.random()` in normal parse flow; existing enhanced-analysis data becomes unreachable after the next parse.
- Archived imports land in `.trellis/tasks/<slug>/` and pollute active-task discovery.
- Emitted task looks structurally present but lacks `implement.jsonl`, so downstream agents cannot inject the required context.

### 6. Tests Required

Required regression coverage:

- `packages/cli/src/core/framework/adapters/openspec.test.ts`
  - Assert repeated parses of the same fixture produce identical entity IDs.
- `packages/cli/src/cli/commands/runtime-compat.test.ts`
  - Assert archived OpenSpec changes emit into Trellis archive paths.
  - Assert emitted Trellis tasks include `implement.jsonl`, `check.jsonl`, and `debug.jsonl`.
- Framework-specific adapter tests
  - Assert task/spec identity comes from stable source references rather than parse time.

### 7. Wrong vs Correct

#### Wrong

```typescript
return {
  id: this.generateId(`openspec-${extendedType}`),
  // ...
};
```

Why this is wrong:

- Adapter identity depends on parse time instead of source identity.
- Workspace JSON, enhanced analysis, and relations lose continuity on refresh.

#### Correct

```typescript
return {
  id: this.generateStableId('openspec-change', `change:${sourceSlug}`),
  // ...
};
```

Why this is correct:

- Adapter identity is derived from a stable, reviewable source key.
- Runtime workspace artifacts can be refreshed without semantic drift.

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

## Scenario: Upstream Framework Compatibility

### 1. Scope / Trigger
- Trigger: OpenSpec and Trellis upstream projects evolve document headers, task metadata, and spec directory layout without changing the fundamental framework identity.
- Trigger: Adapter logic and engine relation extraction must continue to parse both legacy and current project shapes after submodule updates.

### 2. Signatures

Compatibility-sensitive entry points:

```typescript
// packages/cli/src/core/framework/adapters/openspec-format.ts
export function countOpenSpecRequirements(
  content: string,
  section: 'ADDED' | 'MODIFIED',
): number;

export function extractOpenSpecRequirementNames(content: string): string[];

// packages/cli/src/core/framework/adapters/openspec.ts
async parseAll(projectPath: string): Promise<CoreEntity[]>;

// packages/cli/src/core/framework/adapters/trellis.ts
async detect(projectPath: string): Promise<boolean>;
async parseAll(projectPath: string): Promise<CoreEntity[]>;

// packages/cli/src/core/engine/engine.ts
private extractRelations(entities: CoreEntity[]): CoreRelation[];
```

### 3. Contracts

OpenSpec parsing contract:
- Accept both `### Requirement: <name>` and `### <name>` inside `## ADDED Requirements` / `## MODIFIED Requirements`.
- Ignore requirement-looking headings that appear inside fenced code blocks.
- Preserve original markdown in `entity.content`; compatibility helpers may only affect metadata extraction and relation discovery.

Trellis parsing contract:
- `detect()` must succeed for both single-repo markers (`.trellis/spec/backend/...`) and package-scoped monorepo markers (`.trellis/spec/<package>/<layer>/...`) as long as `.trellis/config.yaml`, `.trellis/tasks/`, or `.trellis/spec/` exists.
- `parseAll()` must recurse under `.trellis/spec/` and preserve nested package prefixes in `entity.name` (example: `cli/backend/error-handling`).
- `task.json` fields such as `current_phase`, `next_action`, `children`, and `parent` are runtime metadata and must survive as `entity.metadata.taskJson` without special-case stripping.

Engine relation contract:
- `extractRelations()` must use the same compatibility helper as adapter metadata extraction so legacy/current OpenSpec requirement headings produce the same discovered requirement names.

### 4. Validation & Error Matrix

| Boundary | Validation | Failure behavior |
|----------|------------|------------------|
| OpenSpec change parsing | Count requirement headers from compatible heading forms only | Requirement metadata under-counts and relation extraction drifts |
| OpenSpec fenced code examples | Ignore `### Requirement:` lines inside code fences | Example snippets are falsely treated as real requirements |
| Trellis detection | Accept legacy and monorepo package-scoped spec layouts | `detect()` returns false for valid updated projects |
| Trellis spec recursion | Preserve nested package path in emitted `entity.name` | Converted OpenSpec spec slugs lose package context |
| Trellis task metadata | Keep lifecycle fields under `metadata.taskJson` | Updated Trellis task runtime state becomes invisible after parse |

### 5. Good/Base/Bad Cases

#### Good
- OpenSpec current spec uses `### Stable Output` and current change proposal contains a fenced `### Requirement:` example; adapter counts only the real requirement header.
- Trellis current project stores specs under `.trellis/spec/cli/backend/` and current task state in `task.json.next_action`; adapter detects the project and exposes `cli/backend/...` entity names plus full `taskJson`.

#### Base
- OpenSpec legacy project uses only `### Requirement:` headings; requirement counts and relation extraction match previous behavior.
- Trellis legacy single-repo project stores specs under `.trellis/spec/backend/` and task status in `prd.md`; adapter still parses one spec plus one task.

#### Bad
- Regex is duplicated in adapter and engine, but only one side is updated for compact headings; metadata and relation extraction disagree after an upstream format change.
- Trellis parser flattens package-scoped spec names to `backend/error-handling`; converted OpenSpec output loses package context.

### 6. Tests Required

Required regression coverage:
- `packages/cli/src/core/framework/adapters/openspec-format.test.ts`
  - Assert compact headings count the same as legacy headings.
  - Assert fenced code block headers are ignored.
- `packages/cli/src/core/framework/adapters/openspec.test.ts`
  - Assert one fixture project can contain both legacy and current OpenSpec change formats.
- `packages/cli/src/core/framework/adapters/trellis.test.ts`
  - Assert legacy single-repo and current monorepo package-scoped layouts both detect and parse.
  - Assert `metadata.taskJson.next_action` and related lifecycle fields survive parse.
- `packages/cli/src/cli/commands/runtime-compat.test.ts`
  - Assert `convert -> preprocess -> apply` works for legacy/current OpenSpec and legacy/current Trellis project shapes.

### 7. Wrong vs Correct

#### Wrong

```typescript
const specMatches = entity.content.match(
  /## (?:ADDED|MODIFIED) Requirements\n+### Requirement: (.+)/g,
);
```

Why this is wrong:
- Only accepts one OpenSpec heading style.
- Misaligns engine behavior from adapter metadata if copied in multiple places.
- Cannot exclude fenced code examples safely.

#### Correct

```typescript
for (const specName of extractOpenSpecRequirementNames(entity.content)) {
  logger.debug('Found spec reference', { change: entity.name, spec: specName });
}
```

Why this is correct:
- One compatibility helper owns the evolving parse rule.
- Adapter metadata and engine relation extraction stay in sync.
- Future upstream drift is handled by extending one helper plus its fixture matrix.

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
