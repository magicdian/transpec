# Conversion Pipeline

> The 6-phase conversion pipeline that orchestrates spec framework migrations.

---

## Overview

The ConversionEngine orchestrates the full conversion pipeline. It separates concerns into distinct phases, each with specific responsibilities and validation rules.

---

## Pipeline Phases

```
┌─────────┐   ┌─────────┐   ┌───────────┐   ┌─────────┐   ┌───────────┐   ┌─────────┐
│ PARSE   │ ─▶│ ANALYZE │ ─▶│ TRANSFORM │ ─▶│ VALIDATE│ ─▶│ CONFIRM   │ ─▶│ EMIT    │
└─────────┘   └─────────┘   └───────────┘   └─────────┘   └───────────┘   └─────────┘
     │             │              │              │            │              │
     ▼             ▼              ▼              ▼            ▼              ▼
 Source       AI Semantic    Type/Entity     Integrity     User          Output
 Files         Analysis      Mapping         Checks        Approval       Files
```

---

## Phase Details

### Phase 1: PARSE

**Responsibility**: Source files → Core IR entities

**What happens**:
1. Get source adapter from registry
2. Call `adapter.parseAll(projectPath)`
3. Extract relations between entities
4. Save entities to SQLite storage

**Code flow**:
```typescript
private async runParsePhase(): Promise<PhaseResult> {
  this.entities = await this.sourceAdapter!.parseAll(this.options.projectPath);
  this.relations = this.extractRelations(this.entities);
  this.storage.saveEntities(this.entities);
  this.storage.saveRelations(this.relations);
}
```

**Validation issues**:
- Parse failures (file not found, malformed)
- Empty entities (no content extracted)

**Success criteria**: All source files parsed without errors

---

### Phase 2: ANALYZE (optional)

**Responsibility**: AI-powered semantic analysis

**When run**:
- `sampling` mode: Always runs
- `full` mode: Always runs
- `on-demand` mode: **Skipped**

**What happens**:
- AI analyzes entity relationships
- Identifies semantic equivalences
- Suggests type mappings for ambiguous entities

**Current status**: Placeholder - not yet implemented

```typescript
private async runAnalyzePhase(): Promise<PhaseResult> {
  logger.warn('AI analysis not yet implemented - entities used as-is');
  return { phase: ConversionPhase.ANALYZE, success: true, issues: [] };
}
```

**Future enhancement**: Integrate with AI providers for semantic analysis

---

### Phase 3: TRANSFORM

**Responsibility**: Convert entities for target framework

**What happens**:
1. Map `extendedType` from source to target framework
2. Update metadata for target framework conventions
3. Transform content format if needed

**Type mapping**:
```typescript
private mapExtendedType(type: string): string {
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
```

**Metadata transformation**:
```typescript
for (const entity of this.entities) {
  entity.extendedType = this.mapExtendedType(entity.extendedType);
  entity.metadata = {
    ...entity.metadata,
    convertedFrom: entity.extendedType,
    convertedAt: new Date().toISOString(),
  };
}
```

---

### Phase 4: VALIDATE

**Responsibility**: Ensure entity integrity before emission

**Checks performed**:

**Entity integrity**:
```typescript
for (const entity of this.entities) {
  if (!entity.id) issues.push({ type: 'error', message: 'Entity missing ID' });
  if (!entity.name) issues.push({ type: 'error', message: 'Entity missing name' });
  if (!entity.extendedType) issues.push({ type: 'error', message: 'Entity missing extendedType' });
}
```

**Relation integrity**:
```typescript
const entityIds = new Set(this.entities.map(e => e.id));
for (const rel of this.relations) {
  if (!entityIds.has(rel.sourceId)) {
    issues.push({ type: 'warning', message: `Relation ${rel.id} references missing source` });
  }
  if (!entityIds.has(rel.targetId)) {
    issues.push({ type: 'warning', message: `Relation ${rel.id} references missing target` });
  }
}
```

**Success criteria**:
- No `error` level issues
- `warning` issues are logged but don't fail

---

### Phase 5: CONFIRM

**Responsibility**: User approval before writing files

**Current behavior**: Auto-confirm for CLI mode

```typescript
// Simplified - auto-confirm for CLI
logger.debug(`[${ConversionPhase.CONFIRM}] Auto-confirmed for CLI mode`);
```

**Future enhancement**: Interactive confirmation with preview

---

### Phase 6: EMIT

**Responsibility**: Core IR → Target framework files

**What happens**:
1. Get target adapter from registry
2. For each entity, call `adapter.emit(entity, outputPath)`
3. Write files to target directory

```typescript
private async runEmitPhase(): Promise<PhaseResult> {
  let emitted = 0;

  for (const entity of this.entities) {
    try {
      await this.targetAdapter!.emit(entity, outputPath);
      emitted++;
    } catch (error) {
      issues.push({
        type: 'warning',
        message: `Failed to emit entity ${entity.id}: ${(error as Error).message}`,
      });
    }
  }

  return {
    phase: ConversionPhase.EMIT,
    success: issues.filter(i => i.type === 'error').length === 0,
    entitiesProcessed: emitted,
    issues,
  };
}
```

---

## ConversionEngine Structure

```typescript
export class ConversionEngine {
  private storage: SQLiteStorage;
  private options: ConversionOptions;
  private sourceAdapter?: FrameworkAdapter;
  private targetAdapter?: FrameworkAdapter;
  private entities: CoreEntity[] = [];
  private relations: CoreRelation[] = [];
  private phaseResults: PhaseResult[] = [];

  async initialize(): Promise<void> {
    const registry = new FrameworkRegistry();
    this.sourceAdapter = registry.get(this.options.sourceFramework as FrameworkType);
    this.targetAdapter = registry.get(this.options.targetFramework as FrameworkType);

    if (!this.sourceAdapter) throw new Error(`Source framework not supported`);
    if (!this.targetAdapter) throw new Error(`Target framework not supported`);
  }

  async run(): Promise<ConversionResult> {
    // Run phases in order
    const phases = [
      ConversionPhase.PARSE,
      ConversionPhase.ANALYZE,  // conditional
      ConversionPhase.TRANSFORM,
      ConversionPhase.VALIDATE,
      ConversionPhase.CONFIRM,
      ConversionPhase.EMIT        // conditional on dryRun
    ];
    // ... execute phases
  }
}
```

---

## ConversionOptions

```typescript
export interface ConversionOptions {
  sourceFramework: string;
  targetFramework: string;
  projectPath: string;
  outputPath?: string;
  mode: 'sampling' | 'full' | 'on-demand';
  dryRun: boolean;
  analysisPrompt?: string;
}
```

### Mode Differences

| Mode | ANALYZE phase | EMIT phase | Use case |
|------|---------------|------------|----------|
| `sampling` | Runs | Runs | Test conversion with subset |
| `full` | Runs | Runs | Complete migration |
| `on-demand` | **Skipped** | Runs | Quick conversion, no AI |

### Dry Run

When `dryRun: true`:
- All phases except EMIT run normally
- Files are NOT written
- Useful for validation before committing to conversion

---

## PhaseResult

```typescript
export interface PhaseResult {
  phase: ConversionPhase;
  success: boolean;
  entitiesProcessed: number;
  issues: ValidationIssue[];
  duration?: number;
}
```

---

## ConversionResult

```typescript
export interface ConversionResult {
  success: boolean;
  conversionId: string;
  entitiesProcessed: number;
  issues: ValidationIssue[];
  outputPath?: string;
}
```

---

## ValidationIssue

```typescript
export interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  entityId?: string;
  message: string;
}
```

| Type | Meaning | Pipeline behavior |
|------|---------|------------------|
| `error` | Must fix | Phase fails, conversion stops |
| `warning` | May be OK | Logged, phase continues |
| `info` | Informational | Logged only |

---

## CLI Integration

```typescript
// In convertCommand
const engine = new ConversionEngine({
  sourceFramework,
  targetFramework,
  projectPath,
  outputPath: projectPath,
  mode: mode as 'sampling' | 'full' | 'on-demand',
  dryRun: options.dryRun || false,
}, dbPath);

await engine.initialize();
const result = await engine.run();

// Display results
if (!result.success) {
  console.error(chalk.red('\nConversion completed with errors.\n'));
  process.exit(1);
}
```

---

## Relation Extraction

Relations are extracted from entity content during Parse phase:

```typescript
private extractRelations(entities: CoreEntity[]): CoreRelation[] {
  const relations: CoreRelation[] = [];

  for (const entity of entities) {
    if (entity.extendedType === 'change') {
      // Look for spec references in content
      const specMatches = entity.content.match(/## (?:ADDED|MODIFIED) Requirements\n+### Requirement: (.+)/g);
      if (specMatches) {
        // Create relations for found references
        for (const match of specMatches) {
          logger.debug('Found spec reference', { change: entity.name, spec: match });
        }
      }
    }
  }

  return relations;
}
```

**Note**: Current implementation is simplified. Future versions will extract actual cross-references and build the relation graph.

---

## Error Handling

Errors in any phase:
1. Logged with full context
2. Added to `issues` array
3. Phase marked as failed if `error` level
4. Conversion stops if critical phase fails

```typescript
try {
  const result = await engine.run();
  if (!result.success) {
    for (const issue of result.issues) {
      if (issue.type === 'error') {
        logger.error('Conversion error', { message: issue.message });
      }
    }
    process.exit(1);
  }
} catch (error) {
  logger.error('Conversion failed', { error: (error as Error).message });
  process.exit(1);
}
```

---

## Common Mistakes

### 1. Skipping validation before emit

```typescript
// BAD - emit without validation
await this.targetAdapter!.emit(entity, outputPath);

// GOOD - validate first
if (!this.validateEntity(entity)) {
  issues.push({ type: 'error', message: `Invalid entity ${entity.id}` });
}
```

### 2. Not handling partial failures

```typescript
// BAD - abort on first error
for (const entity of this.entities) {
  await this.targetAdapter!.emit(entity, outputPath);  // Throws on error
}

// GOOD - collect issues and continue
for (const entity of this.entities) {
  try {
    await this.targetAdapter!.emit(entity, outputPath);
  } catch (error) {
    issues.push({ type: 'warning', message: `Failed to emit ${entity.id}` });
  }
}
```

### 3. Modifying entities after parse without tracking

```typescript
// BAD - lost traceability
entity.extendedType = this.mapExtendedType(entity.extendedType);

// GOOD - track original in metadata
entity.metadata.convertedFrom = entity.extendedType;
entity.extendedType = this.mapExtendedType(entity.extendedType);
```

---

## References

- Engine implementation: `packages/cli/src/core/engine/engine.ts`
- Conversion phases: `ConversionPhase` enum
- Types: `packages/cli/src/core/ir/types.ts`
- CLI integration: `packages/cli/src/cli/commands/convert.ts`
