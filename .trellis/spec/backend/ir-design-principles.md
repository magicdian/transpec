# IR Design Principles

> Intermediate Representation (IR) design for framework-agnostic spec conversion.

---

## Overview

Transpec's core is a **stable ABI IR** inspired by LLVM IR. The IR schema is intentionally minimal and never changes when adding new frameworks. Framework-specific concepts are stored as strings, not schema additions.

**Schema Version**: Current version is `2.0.0` - includes enhanced analysis support.

---

## Core Design Philosophy

| Principle | Description |
|-----------|-------------|
| **Stable ABI** | IR schema never changes when adding frameworks |
| **Framework-agnostic** | No framework-specific concepts in core types |
| **Extensible metadata** | Framework-specific data stored as JSON blobs |
| **String-typed relations** | `relationType` is framework-defined (e.g., "implements", "depends_on") |
| **Dual-layer analysis** | RAW content + Enhanced analysis for semantic preservation |

---

## Core Types

### `CoreType` Enum

Two stable types cover all spec frameworks:

```typescript
export enum CoreType {
  DOCUMENT = 'DOCUMENT',  // Specs, proposals, guidelines
  WORKFLOW = 'WORKFLOW',   // Tasks, changes, actionable items
}
```

**Why only two?** All frameworks have concepts that map to either:
- **DOCUMENT**: Static content (specs, proposals, guidelines)
- **WORKFLOW**: Actionable items (tasks, changes, TODOs)

---

## CoreEntity

```typescript
export interface CoreEntity {
  id: string;
  name: string;
  coreType: CoreType;           // Stable ABI
  extendedType: string;         // Framework-specific: 'task', 'spec', 'change', 'proposal'
  content: string;              // Full text content - RAW, never parsed
  metadata: Record<string, unknown>;  // Framework-specific + Enhanced data
  sourceFramework: string;      // e.g., 'openspec', 'trellis'
  sourcePath: string;           // Original file path
  createdAt: string;            // ISO timestamp
  updatedAt: string;            // ISO timestamp
}
```

### Enhanced Analysis

Each entity can store framework-agnostic semantic analysis in `metadata.enhancedAnalysis`:

```typescript
export interface EnhancedAnalysis {
  intent: string;              // 设计意图
  keyPoints: string[];         // 关键要点
  dependencies: string[];       // 依赖关系
  constraints: string[];        // 约束条件
  requirement?: string[];      // 需求定义 (通用类型)
  design?: string[];            // 设计决策 (通用类型)
  implementNote?: string[];     // 实现备注 (通用类型)
}
```

### Field Semantics

| Field | Purpose | Notes |
|-------|---------|-------|
| `id` | Globally unique identifier | Deterministic for the same source entity when a stable seed exists |
| `name` | Human-readable name | Extracted from file/directory name |
| `coreType` | Maps to stable type | Only `DOCUMENT` or `WORKFLOW` |
| `extendedType` | Framework-specific type | Stored as string for flexibility |
| `content` | Full original content | Never parsed, stored as-is (RAW) |
| `metadata.enhancedAnalysis` | Framework-agnostic analysis | requirement, design, implement_note |
| `metadata` | Framework-specific data | JSON blob - schema-free |
| `sourceFramework` | Origin framework | For traceability |
| `sourcePath` | Original file location | For debugging and relinking |

---

## Entity Identity Contract

`CoreEntity.id` is not just an internal parse artifact. In the current runtime workflow it is also the join key for:

- `.transpec/workspace/preprocess-context.json`
- `.transpec/workspace/enhanced-analysis.json`
- emitted `CoreRelation.sourceId/targetId`
- conversion validation and postprocess context derivation

Identity rules:

- Parse reruns for the same source entity MUST keep the same `id` whenever the adapter has a stable seed.
- Relation extraction MUST use the same stable entity IDs that are exported to workspace JSON.
- Enhanced-analysis continuity MUST be preserved either by stable IDs or by an explicit remap/reconciliation step before rewriting preprocess context.
- Random fallback IDs are allowed only when no stable source reference exists, and they MUST NOT become part of a persisted runtime contract.

### Good

```typescript
return {
  id: this.generateStableId('openspec-change', `change:${sourceSlug}`),
  // ...
};
```

Why this is good:

- The same OpenSpec change gets the same IR ID after `preprocess` reruns.
- Existing enhanced analysis can be reattached safely.
- Relations and validator output continue to point at the same logical entity.

### Bad

```typescript
return {
  id: this.generateId(`openspec-${extendedType}`),
  // ...
};
```

Why this is bad:

- Every parse refresh invents new entity IDs.
- `enhanced-analysis.json` and `preprocess-context.json` silently drift apart.
- Downstream postprocess and validation can only recover by heuristics.

---

## CoreRelation

```typescript
export interface CoreRelation {
  id: string;
  sourceId: string;           // Reference to source entity
  targetId: string;           // Reference to target entity
  relationType: string;        // Framework-defined: "implements", "depends_on", "follows"
  metadata?: Record<string, unknown>;
}
```

### Why `relationType` is a String

Different frameworks use different relationship semantics:

| Framework | Relation Type | Meaning |
|-----------|---------------|---------|
| OpenSpec | `implements` | Change implements a spec |
| OpenSpec | `depends_on` | Change depends on another |
| Trellis | `blocks` | Task blocks another |
| Trellis | `related_to` | Task is related to spec |

**By storing as string**, we avoid schema proliferation. The string is framework-specific but the *structure* (source → relation → target) is universal.

### Transform Strategy

During Transform phase:
- **Mappable relations**: Convert to target framework semantics (e.g., `implements` → `blocks`)
- **Unmappable relations**: Discard, but post-process skill extracts key info as comments in target docs

---

## IRDocument

```typescript
export interface IRDocument {
  id: string;
  version: string;             // IR schema version (for future compatibility)
  sourceFramework: string;
  targetFramework: string;
  entities: CoreEntity[];
  relations: CoreRelation[];
  metadata: IRMetadata;
}
```

---

## IRMetadata

```typescript
export interface IRMetadata {
  convertedAt: string;
  conversionMode: 'sampling' | 'full' | 'on-demand';

  // AI processing status
  aiPreProcessed: boolean;     // LLM pre-process completed (transpec-preprocess)
  aiPostProcessed: boolean;     // AI post-process completed (transpec-apply)

  issues: ValidationIssue[];

  // Pre-process results
  preprocessedAt?: string;
  preprocessedBy?: string;
  projectSummary?: ProjectSummary;
}
```

### Project Summary

```typescript
export interface ProjectSummary {
  overallArchitecture: string;
  keyRequirements: string[];
  designDecisions: string[];
  developmentGuidelines: string;
}
```

### AI Processing States

| State | Description | Command |
|------|-------------|---------|
| `aiPreProcessed = false` | Raw parse only | `transpec parse` |
| `aiPreProcessed = true` | Parse + LLM analysis done | `transpec-preprocess` |
| `aiPostProcessed = false` | Pre-processed, awaiting apply | After preprocess |
| `aiPostProcessed = true` | Full pipeline complete | `transpec-apply` |

---

## Metadata Pattern

### Framework-Specific Data

All framework-specific data goes in `metadata`:

```typescript
// OpenSpec change metadata
entity.metadata = {
  isArchived: boolean,
  archivedAt: string,
  subtasks: Array<{ name: string; status: string }>,
  sourceTaskSummary: string | null,
  sourceAcceptanceCriteria: string[],
  sourceFollowUpSuggestions: string[],
  sourceTaskEstimates: Array<{ scope: string | null, value: string }>,
  sourceTaskSections: Array<{
    title: string,
    level: number,
    kind: string,
    content: string,
    items: string[],
  }>,
  designContent: string,
  requirementCount: { added: number, modified: number }
};

// Trellis task metadata
entity.metadata = {
  taskJson: { /* full task.json contents */ },
  sourceTaskSummary: string | null,
  sourceAcceptanceCriteria: string[],
  sourceFollowUpSuggestions: string[],
  sourceTaskEstimates: Array<{ scope: string | null, value: string }>,
  sourceTaskSections: Array<Record<string, unknown>>,
  date: string,
  status: string,
  priority: string,
  assignee: string
};
```

### Enhanced Analysis

Framework-agnostic semantic analysis goes in `metadata.enhancedAnalysis`:

```typescript
entity.metadata.enhancedAnalysis = {
  intent: "用户需要一个任务管理系统的核心功能",
  keyPoints: ["看板视图", "拖拽排序", "多人协作"],
  dependencies: ["需要数据库存储", "需要用户认证"],
  constraints: ["不能依赖外部服务", "必须支持离线"],
  requirement: ["用户可以创建任务", "用户可以分配任务"],
  design: ["使用看板组件", "数据存储在SQLite"],
  implementNote: ["先实现核心CRUD", "后续添加拖拽功能"]
};
```

---

## Type Mapping

### Framework → Core

Each adapter defines its mapping:

```typescript
// In TrellisAdapter
protected getTypeMapping(): Record<string, CoreType> {
  return {
    'spec': CoreType.DOCUMENT,
    'task': CoreType.WORKFLOW
  };
}
```

### Core → Framework

Reverse mapping for emission:

```typescript
// In TrellisAdapter
protected getReverseTypeMapping(): Record<CoreType, string[]> {
  return {
    [CoreType.DOCUMENT]: ['spec'],
    [CoreType.WORKFLOW]: ['task']
  };
}
```

**Note**: Reverse mapping returns `string[]` because multiple framework types may map to one CoreType.

---

## Validation Rules

### Entity Validation

Every entity must have:
- `id` - non-empty string
- `name` - non-empty string
- `coreType` - must be `DOCUMENT` or `WORKFLOW`
- `extendedType` - non-empty string
- `content` - non-empty string (preserves original)
- `sourceFramework` - non-empty string

### Relation Validation

Every relation must have:
- `id` - non-empty string
- `sourceId` - must reference existing entity
- `targetId` - must reference existing entity
- `relationType` - non-empty string

---

## Workflow: Parse → Pre-process → Apply

### Phase 1: Parse (transpec parse)

Mechanical conversion only:
1. Source adapter parses files → CoreEntity
2. Content preserved as-is (RAW)
3. `aiPreProcessed = false`, `aiPostProcessed = false`

### Phase 2: Pre-process (transpec-preprocess)

LLM analysis on RAW content:
1. Framework-specific skills analyze source files
2. Extract: intent, keyPoints, dependencies, constraints
3. Map to common types: requirement, design, implement_note
4. Generate projectSummary
5. `aiPreProcessed = true`, `aiPostProcessed = false`

### Phase 3: Apply (transpec-apply)

AI-assisted transformation:
1. Use enhancedAnalysis as context
2. Map mappable relations
3. Discard unmappable relations, extract key info to comments
4. Emit to target framework format
5. `aiPostProcessed = true`

---

## Large Project Processing: B+C Hybrid Strategy

For large projects that exceed model context limits, pre-process uses a **relation-driven batch processing** strategy.

### Why B+C Over Other Approaches

| Strategy | Information Loss | Complexity |
|----------|----------------|------------|
| MapReduce only | High - first layer compression loses detail | Medium |
| Relation-driven only | Low - relations preserved in order | High |
| Sliding window | Medium - iterative accumulation | Low |
| **B+C Hybrid** | **Lowest** - relation-first + bounded summaries | **Medium** |

### The B+C Strategy

```
批次 1: 处理无依赖的 entities (leaf nodes) → 生成 summaries
批次 2: 处理依赖批次1的 entities + summaries 作为上下文
批次 3: 处理依赖批次2的 entities + 所有前序 summaries
...
最终: 合并所有批次结果
```

### Implementation Pattern

```typescript
interface PreprocessBatch {
  batchId: number;
  entityIds: string[];
  dependencies: string[];      // 前序批次的 entity IDs
  contextSummary?: string;       // 前序批次的摘要
  results: EnhancedAnalysis[];
}

interface PreprocessState {
  batches: PreprocessBatch[];
  entityResults: Map<string, EnhancedAnalysis>;
  globalSummary: ProjectSummary;
}

// Algorithm:
// 1. Build dependency graph from CoreRelations
// 2. Topological sort to determine processing order
// 3. Group into batches by context size limit
// 4. Process each batch with preceding summaries as context
// 5. Merge results
```

### Context Size Management

Each batch must fit within model's context limit:
- Reserve space for: preceding summaries + current entities + analysis prompt
- If single entity exceeds limit: process it alone with minimal context
- Track context usage across batches to avoid overflow

### Relation Preservation

```typescript
// Relations guide batch ordering, not discarded
const relationTypes = ['implements', 'depends_on', 'blocks', 'related_to'];

// Entities are grouped by their dependency depth
function computeBatchDepth(entityId: string, relations: CoreRelation[]): number {
  const deps = relations.filter(r => r.targetId === entityId);
  if (deps.length === 0) return 0;
  return 1 + max(deps.map(d => computeBatchDepth(d.sourceId, relations)));
}
```

---

## TODO: Multi-Framework Merge

**Not yet implemented** - Future consideration for merging IR from multiple independent frameworks.

### Use Case
- Framework A and Framework B developed independently
- Need to merge IR_A + IR_B → target Framework C

### Challenges
- Duplicate entity detection (fuzzy dedupe by name/content/relation similarity)
- Conflict resolution (e.g., A says PostgreSQL, B says MongoDB)
- Dependency alignment across frameworks

### Potential Approach
```
IR_A ∪ IR_B → IR_Merged (union + dedupe)
    ↓
AI Conflict Resolution
    ↓
IR_Resolved (unified)
    ↓
transpec-apply → Target C
```

---

## Adding New Frameworks

**Never modify IR schema**. To add a new framework:

1. Create new adapter in `src/core/framework/adapters/`
2. Implement `FrameworkAdapter` interface
3. Define `extendedType` mappings in adapter
4. Create framework-specific pre-process skill
5. Skill outputs to common format: requirement, design, implement_note

Example - adding spec-kit support:

```typescript
// No IR changes needed!
export class SpeckitAdapter extends BaseFrameworkAdapter {
  readonly framework: FrameworkType = 'speckit';
  readonly supportedExtendedTypes = ['capability', 'requirement'];

  protected getTypeMapping(): Record<string, CoreType> {
    return {
      'capability': CoreType.DOCUMENT,
      'requirement': CoreType.WORKFLOW
    };
  }
}
```

### Pre-process Skill Template

```markdown
## Framework-specific analysis (e.g., spec-kit)

Analyze the following content and extract:

1. **Intent** - What is this trying to achieve?
2. **Key Points** - Main points of this content
3. **Dependencies** - What does this depend on?
4. **Constraints** - What limitations exist?
5. **Requirements** - What must be implemented? (common type)
6. **Design** - What design decisions were made? (common type)
7. **Implement Notes** - Implementation hints? (common type)

Output in JSON format matching EnhancedAnalysis interface.
```

---

## OpenSpec vs Trellis Spec Semantics

**Critical**: OpenSpec `spec` and Trellis `spec/` directory have **different meanings**.

| Framework | Concept | Example |
|-----------|---------|---------|
| OpenSpec | Feature specification | "annotation normalization", "cross platform cli" |
| Trellis | Development guidelines | `spec/backend/index.md`, `spec/frontend/hook-guidelines.md` |

### OpenSpec Spec → Trellis Legacy

When converting OpenSpec specs to Trellis:
- OpenSpec specs go to `.trellis/legacy/specs/` (preserved, not transformed)
- They describe **what the project does** (features)
- Trellis spec/ describes **how to develop** (guidelines)

### Generating Trellis Spec Directory

Trellis `spec/` directory must be **generated from project analysis**, not converted from OpenSpec specs:

```
.trellis/
├── spec/
│   ├── backend/           # Generated from project analysis
│   │   ├── index.md      # Backend guidelines index
│   │   └── *.md          # Topic-specific backend docs
│   ├── frontend/          # Generated from project analysis
│   │   └── *.md          # Topic-specific frontend docs
│   └── guides/           # Generated from project analysis
│       └── *.md          # Thinking guides
├── legacy/
│   └── specs/            # Original OpenSpec specs (preserved)
│       └── {feature}/
│           └── spec.md
└── tasks/                # Converted from OpenSpec changes
    └── {task}/
```

### Adapter Emit Responsibility

Each adapter's `emit()` must handle framework-specific directory generation:

```typescript
// TrellisAdapter.emit() - for spec type entities
if (entity.extendedType === 'spec') {
  // OpenSpec specs → legacy/specs/ (preserve original)
  await emitToLegacy(entity);

  // Trellis spec/ → generated separately during init
  // (not during convert - that's a different operation)
}
```

---

## Common Mistakes

### 1. Parsing content instead of preserving

```typescript
// BAD - loses original content/formatting
entity.content = JSON.stringify(parseJSON(content));

// GOOD - preserves original, metadata contains parsed data
entity.content = content;
entity.metadata.parsed = parseJSON(content);
```

### 2. Adding framework-specific core types

```typescript
// BAD - IR schema pollution
export enum CoreType {
  DOCUMENT = 'DOCUMENT',
  WORKFLOW = 'WORKFLOW',
  CHANGE = 'CHANGE',  // OpenSpec-specific!
}

// GOOD - use extendedType for framework concepts
export enum CoreType {
  DOCUMENT = 'DOCUMENT',
  WORKFLOW = 'WORKFLOW',
}
// extendedType = 'change' for OpenSpec changes
```

### 3. Storing structured data in content field

```typescript
// BAD - mixing formats
entity.content = JSON.stringify({ tasks: [...], specs: [...] });

// GOOD - full text in content, structured data in metadata
entity.content = originalMarkdownContent;
entity.metadata.tasks = [...];
```

### 4. Skipping enhanced analysis

```typescript
// BAD - just storing RAW content
entity.content = content; // Done

// GOOD - also extract semantic meaning
entity.content = content;
entity.metadata.enhancedAnalysis = {
  intent: extractIntent(content),
  requirement: extractRequirements(content),
  // ...
};
```

### 5. Wrong skill directory path calculation

When accessing built-in skills from CLI commands, ensure path calculation is correct:

```typescript
// WRONG - miscounted path levels
const packageRoot = path.resolve(currentDir, '..', '..', '..', '..'); // Too many levels!
return path.join(packageRoot, 'src', 'core', 'skill', 'skills');

// CORRECT - count from dist/cli/commands/apply.js
// 1 level up = dist/cli/commands
// 2 levels up = dist/cli
// 3 levels up = dist
// 4 levels up = packages/cli (package root)
const packageRoot = path.resolve(currentDir, '..', '..', '..', '..');
return path.join(packageRoot, '.transpec', 'skills');
```

**Rule**: Built-in skills are in `.transpec/skills/` (copied during build), NOT `src/core/skill/skills`.

### 6. CLI doesn't execute skills - it guides agents

Transpec CLI does NOT call AI APIs. Skills are **executed by AI agents**, not by the CLI.

```typescript
// WRONG - CLI trying to execute skills
const result = await executor.execute(skill.name, skillContext); // simulateExecution!

// CORRECT - CLI lists skills and guides agents to execute them
console.log('Found skill:', skill.name);
console.log('Read .transpec/skills/' + skill.name + '/SKILL.md to execute');
```

**CLI workflow for skills**:
1. CLI lists available skills by trigger (e.g., `post-migration`)
2. CLI prints guidance for agents to read skill files
3. Agent reads skill file and executes the instructions

---

## References

- IR types: `packages/cli/src/core/ir/types.ts`
- Trellis adapter: `packages/cli/src/core/framework/adapters/trellis.ts`
- OpenSpec adapter: `packages/cli/src/core/framework/adapters/openspec.ts`
- Conversion engine: `packages/cli/src/core/engine/engine.ts`
