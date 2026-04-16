# Conversion Pipeline

> The 6-phase conversion pipeline that orchestrates spec framework migrations.

---

## Overview

The ConversionEngine orchestrates the full conversion pipeline. It separates concerns into distinct phases, each with specific responsibilities and validation rules.

The CLI command layer wraps those phases with runtime workspace artifacts:

- `preprocess` refreshes RAW IR and exports preprocess context
- enhanced analysis is produced outside the CLI and keyed by entity ID
- `apply` imports enhanced analysis, rewrites runtime context, emits target files, writes postprocess context, and runs deterministic target postprocess
- `validate` checks that the converted target is structurally consumable by downstream tooling

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

### CLI Commands vs Engine Phases

The CLI commands orchestrate engine phases and skills differently:

| Command | What it does |
|---------|--------------|
| `transpec convert` | Internal/debug command for deterministic PARSE → RAW IR only |
| `transpec preprocess` | Deterministic RAW IR preparation + preprocess context export |
| `transpec apply` | Import/reconcile enhanced analysis + Transform/Validate/Emit + postprocess context export + deterministic target postprocess |
| `transpec postprocess` | Re-run deterministic target postprocess from runtime workspace context |
| `transpec validate` | Verify runtime workspace JSON, emitted target skeleton, archive placement, and grounded docs |

### Command Workflow

```
transpec preprocess:
  ├── Step 1: Generate or refresh RAW IR (Parse phase only)
  ├── Step 2: Load entities from IR storage
  ├── Step 3: Export .transpec/workspace/preprocess-context.json
  └── Output: Agent-ready preprocess context + project-local preprocess skill path

transpec apply (target=trellis):
  ├── Step 1: Import .transpec/workspace/enhanced-analysis.json into RAW IR metadata
  ├── Step 2: Refresh .transpec/workspace/preprocess-context.json so hasEnhancedAnalysis matches disk truth
  ├── Step 3: Run Transform+Emit
  ├── Step 4: Export .transpec/workspace/postprocess-context.json
  ├── Step 5: Run deterministic Trellis postprocess
  └── Output: Minimum Trellis runtime skeleton + grounded docs + guided next step for optional target-specific refinement

transpec apply (target=other):
  └── Output: Transform+Emit + target-specific postprocess context when available
```

### Skills vs CLI

**Transpec CLI does NOT execute preprocess/postprocess skills** - agent commands execute them using project-local markdown copied into `.transpec/skills/`.

```typescript
// CLI writes deterministic runtime context
// Agent command reads:
//   .transpec/skills/preprocess/<source>/SKILL.md
//   .transpec/skills/postprocess/<target>/SKILL.md
//   .transpec/workspace/*.json
```

**Skill triggers**:
- `preprocess`: Agent-side semantic enrichment after RAW IR exists
- `postprocess`: Agent-side target-specific work after deterministic emit completes

Deterministic postprocess and agent postprocess are intentionally separate:

- Deterministic postprocess MUST generate the minimum target runtime artifacts that downstream tooling requires.
- Agent postprocess MAY further refine or expand target-specific content.
- Agent postprocess MUST NOT be the only mechanism that makes the converted target runnable.

### Example: trellis postprocess

This skill is Trellis-specific and is copied into `.transpec/skills/postprocess/trellis/SKILL.md` during `transpec init`:

1. CLI (`transpec apply`) merges enhanced analysis, writes `.transpec/workspace/postprocess-context.json`, and runs deterministic Trellis postprocess
2. Deterministic postprocess creates or refreshes minimum grounded docs under `.trellis/spec/`
3. Agent reads `.transpec/skills/postprocess/trellis/SKILL.md`
4. Agent optionally refines the generated Trellis-specific content further

```typescript
// In apply.ts
// 1. Merge .transpec/workspace/enhanced-analysis.json into entity metadata
// 2. Refresh preprocess context so hasEnhancedAnalysis is truthful
// 3. Run engine.runTransformEmit()
// 4. Write .transpec/workspace/postprocess-context.json
// 5. Run deterministic target postprocess
```

## Scenario: Agent-Driven Preprocess and Apply Runtime Contract

### 1. Scope / Trigger

- Trigger: Any change to `transpec init`, `transpec preprocess`, `transpec apply`, project-local skill materialization, or agent command generation.
- Why this requires code-spec depth:
  - The workflow crosses CLI commands, generated agent command assets, package-bundled skill assets, and project-local runtime files.
  - A path or payload mismatch at any boundary breaks the end-to-end flow even if individual commands still compile.

### 2. Signatures

CLI command signatures:

```bash
transpec init [--source <framework>] [--target <framework>] [--ide <ide>] [--mode <mode>] [--yes]
transpec preprocess [--project-path <path>] [--skip-convert] [--force]
transpec apply [--project-path <path>] [--force]
transpec postprocess [--project-path <path>]
transpec validate [--project-path <path>]
transpec convert [--project-path <path>] [--source <framework>] [--target <framework>] [--dry-run]
```

Core runtime helpers:

```typescript
materializeProjectSkills(projectPath, sourceFramework, targetFramework)
writePreprocessContext(projectPath, sourceFramework, targetFramework, entities, relations)
loadEnhancedAnalysisFile(projectPath)
mergeEnhancedAnalysis(entities, analysisFile)
writePostprocessContext(projectPath, sourceFramework, targetFramework, entitiesTransformed)
validateConvertedProject(projectPath)
runTargetPostprocess(projectPath, targetFramework)
```

Generated agent assets must reference:

```text
.transpec/skills/preprocess/<source>/SKILL.md
.transpec/skills/postprocess/<target>/SKILL.md
.transpec/workspace/preprocess-context.json
.transpec/workspace/enhanced-analysis.json
.transpec/workspace/postprocess-context.json
```

### 3. Contracts

#### 3.1 `.transpec/config.yaml`

Required fields:

```yaml
project:
  sourceFramework: <framework>
  targetFramework: <framework>
  ide: <primary ide>
  ides: <comma-separated ide ids>
  mode: <on-demand|full|sampling>
skills:
  preprocess: .transpec/skills/preprocess/<source>/SKILL.md
  postprocess: .transpec/skills/postprocess/<target>/SKILL.md
workspace:
  preprocessContext: .transpec/workspace/preprocess-context.json
  enhancedAnalysis: .transpec/workspace/enhanced-analysis.json
  postprocessContext: .transpec/workspace/postprocess-context.json
```

Rules:
- `skills.preprocess` and `skills.postprocess` must point to project-local markdown, not package-internal paths.
- `workspace.*` fields must remain relative to the initialized project root.
- `project.ide` is the primary/default IDE; `project.ides` records the full selected set for generated assets.

#### 3.2 `.transpec/workspace/preprocess-context.json`

Required shape:

```json
{
  "version": "1.0.0",
  "generatedAt": "ISO-8601 timestamp",
  "sourceFramework": "openspec",
  "targetFramework": "trellis",
  "preprocessSkill": ".transpec/skills/preprocess/openspec/SKILL.md",
  "enhancedAnalysisOutput": ".transpec/workspace/enhanced-analysis.json",
  "entityCount": 2,
  "relationCount": 3,
  "entities": [
    {
      "id": "entity-id",
      "name": "demo capability",
      "type": "spec",
      "sourcePath": "/absolute/path/to/source.md",
      "hasEnhancedAnalysis": true
    }
  ],
  "relations": [
    {
      "id": "rel-demo-change-demo-spec-implements",
      "sourceId": "change-id",
      "targetId": "spec-id",
      "type": "implements"
    }
  ]
}
```

Rules:
- `preprocessSkill` must be the project-relative path to the project-local copied skill.
- `enhancedAnalysisOutput` is the only supported write target for agent semantic output.
- `entities[*].sourcePath` is absolute so the agent can inspect source files directly.
- `relationCount` and `relations` must reflect the current exported relation graph, not just entity counts.
- `hasEnhancedAnalysis` must be derived after any ID reconciliation, not from stale on-disk metadata alone.
- `writePreprocessContext(...)` must try to reconcile stale enhanced-analysis IDs before finalizing these flags.

#### 3.3 `.transpec/workspace/enhanced-analysis.json`

Required shape:

```json
{
  "version": "1.0.0",
  "generatedAt": "ISO-8601 timestamp",
  "sourceFramework": "openspec",
  "targetFramework": "trellis",
  "entities": {
    "entity-id": {
      "intent": "One sentence",
      "keyPoints": ["Point 1"],
      "dependencies": ["dependency"],
      "constraints": ["constraint"],
      "requirement": ["requirement"],
      "design": ["design decision"],
      "implementNote": ["implementation note"]
    }
  }
}
```

Rules:
- Top-level `entities` keys should match current RAW IR entity IDs after reconciliation.
- Unknown entity IDs are ignored during merge.
- Missing entity IDs are allowed; they mean "no semantic enrichment for this entity".
- Stale IDs may be remapped by previous preprocess context or adapter parse identities recorded in `.transpec/logs/transpec.log`.
- `apply` merges this file into `entity.metadata.enhancedAnalysis` before transform/emit.

#### 3.4 `.transpec/workspace/postprocess-context.json`

Required shape:

```json
{
  "version": "1.0.0",
  "generatedAt": "ISO-8601 timestamp",
  "sourceFramework": "openspec",
  "targetFramework": "trellis",
  "postprocessSkill": ".transpec/skills/postprocess/trellis/SKILL.md",
  "enhancedAnalysisInput": ".transpec/workspace/enhanced-analysis.json",
  "entitiesTransformed": 2,
  "outputRoot": "."
}
```

Rules:
- `postprocessSkill` must be project-relative and target-specific.
- `entitiesTransformed` must equal the deterministic apply result count returned by `runTransformEmit()`.

#### 3.5 Trellis runtime bootstrap contract

Minimum deterministic output for OpenSpec -> Trellis:

```text
.trellis/workflow.md
.trellis/spec/backend/index.md
.trellis/spec/frontend/index.md
.trellis/spec/guides/index.md
.trellis/spec/guides/repository-and-conversion-state.md
.trellis/tasks/archive/<YYYY-MM>/<MM-DD-slug>/task.json
.trellis/tasks/archive/<YYYY-MM>/<MM-DD-slug>/prd.md
.trellis/tasks/archive/<YYYY-MM>/<MM-DD-slug>/implement.jsonl
.trellis/tasks/archive/<YYYY-MM>/<MM-DD-slug>/check.jsonl
.trellis/tasks/archive/<YYYY-MM>/<MM-DD-slug>/debug.jsonl
```

Rules:
- Deterministic emit/postprocess owns these files. Optional agent postprocess may refine them but must not be their only source.
- Archived OpenSpec changes must land under `.trellis/tasks/archive/`, not the active task pool.
- Grounded docs under `.trellis/spec/` are minimum runtime artifacts for Trellis workflow consumption, not purely decorative output.
- When source `tasks.md` contains structured sections, emitted `task.json.meta` must also preserve:
  - `sourceTaskSummary`
  - `sourceAcceptanceCriteria`
  - `sourceFollowUpSuggestions`
  - `sourceTaskEstimates`
  - `sourceTaskSections`
- `task.json.description` may fall back to `sourceTaskSummary` only when the source manifest does not provide a better description.

#### 3.6 RAW IR database path

Supported path:

```text
.transpec/ir/conversion.db
```

Rules:
- `preprocess` and `apply` must use the same fixed runtime DB path.
- `convert --dry-run` may use a temporary DB path, but normal runtime flow must not.
- Do not create timestamped DB filenames for the normal agent-driven workflow.

### 4. Validation & Error Matrix

| Boundary | Validation | Failure behavior |
|----------|------------|------------------|
| `init` → config | `sourceFramework` and `targetFramework` both present and different | Print user-facing error and exit |
| `init` → project skills | Built-in preprocess/postprocess asset exists for selected framework | If missing, generated config still points to expected runtime path, but this is a release bug and should fail tests |
| `preprocess` → RAW IR | `.transpec/ir/conversion.db` exists and loads `entities.length > 0` | Print user-facing error and stop |
| `preprocess` → relations export | `relationCount > 0` when relations exist in IR | `validate` reports `missing_relations` |
| `preprocess` → enhanced analysis continuity | stale IDs are reconciled before final `hasEnhancedAnalysis` flags are written | `validate` reports `enhanced_analysis_id_mismatch` or `enhanced_analysis_unsynced` if unresolved |
| agent → enhanced analysis file | JSON parses and matches expected top-level fields | `apply` treats unreadable file as missing |
| `apply` → enhanced analysis import | If file missing and no `--force`, stop before transform | Print user-facing warning and return |
| `apply` → workspace sync | `preprocess-context.json` rewritten after merge | `validate` reports stale `hasEnhancedAnalysis` if skipped |
| `apply` → transform/emit | `runTransformEmit()` returns success or issues | Print issues and continue only when engine reports non-fatal warnings |
| `apply` → deterministic postprocess | target bootstrap files, task runtime files, and grounded docs exist | `validate` reports missing runtime artifacts |
| `apply` → structured task metadata | source `tasks.md` sections survive into `task.json.meta.sourceTask*` fields | `validate` reports `missing_structured_tasks_metadata` |
| `validate` → Trellis runtime | archive placement, task fields, and grounded specs are all present | Fail command with explicit issue codes |

### 5. Good/Base/Bad Cases

#### Good

- `transpec preprocess` reruns on the same OpenSpec project and keeps or reconciles entity IDs so `hasEnhancedAnalysis` stays accurate.
- `transpec apply` imports enhanced analysis for every entity, emits archive tasks plus runtime jsonl files, runs deterministic Trellis postprocess, and `transpec validate` passes.
- OpenSpec source includes acceptance criteria and follow-up work in `tasks.md`; emitted Trellis task preserves them under `task.json.meta.sourceTask*` without requiring downstream markdown re-parse.

#### Base

- `transpec preprocess` on an initialized project with valid source files but no enhanced analysis yet
- Result:
  - `.transpec/ir/conversion.db` exists
  - `.transpec/workspace/preprocess-context.json` exists
  - `.transpec/workspace/enhanced-analysis.json` does not need to exist yet

#### Bad

- `transpec apply` before the agent has produced `.transpec/workspace/enhanced-analysis.json`
- Result:
  - Without `--force`, command prints a user-facing warning and stops before transform
  - With `--force`, command may continue with deterministic transform/emit only
- `preprocess` regenerates entity IDs without reconciliation
- Result:
  - old `enhanced-analysis.json` becomes detached from current entity IDs
  - `validate` reports `enhanced_analysis_id_mismatch`
- runtime correctness is delegated to an optional postprocess skill
- Result:
  - target appears converted but Trellis start/init-context cannot consume it reliably when the skill is skipped
- `source-tasks.md` is copied as a raw file, but `task.json.meta` drops all structured task sections
- Result:
  - converted task keeps the file for humans, but agents and validators lose access to acceptance criteria, estimates, and follow-up items

### 6. Tests Required

Required regression coverage:

- `materializeProjectSkills()`:
  - Assert project-local preprocess/postprocess markdown files are copied for selected frameworks.
- `writePreprocessContext()`:
  - Assert `preprocessSkill` and `enhancedAnalysisOutput` are project-relative `.transpec/...` paths.
-  Assert stale enhanced-analysis IDs can be reconciled from previous preprocess context or logged adapter parse identities.
- `loadEnhancedAnalysisFile()` + `mergeEnhancedAnalysis()`:
  - Assert matched entity IDs update `metadata.enhancedAnalysis`.
  - Assert unmatched IDs do not break the merge.
- IDE adapters:
  - Assert generated preprocess/apply commands or skills mention only project-local `.transpec/...` paths.
  - Assert they do not depend on `packages/cli/.transpec` or `dist/.transpec`.
- Smoke flow:
  - Assert `init -> preprocess -> apply -> validate` succeeds in a temp project.
  - Assert `.transpec/ir/conversion.db`, preprocess context, enhanced analysis file, and postprocess context all exist at the expected points.
  - Assert Trellis bootstrap files, grounded docs, archive placement, and task runtime jsonl files exist after apply.
  - Assert structured `tasks.md` sections appear in emitted `task.json.meta.sourceTask*`.

### 7. Wrong vs Correct

#### Wrong

```text
1. preprocess regenerates entity IDs without reconciliation
2. apply merges enhanced analysis in memory but does not rewrite preprocess-context.json
3. target runtime correctness depends on an optional postprocess skill creating workflow/bootstrap files
```

Why this is wrong:
- Workspace JSON drifts away from actual CLI state.
- Existing enhanced analysis becomes unreachable after a refresh.
- The converted target is only runnable when an optional LLM refinement step happens to run.

#### Correct

```text
1. preprocess exports current entities/relations and reconciles old enhanced-analysis IDs before finalizing hasEnhancedAnalysis
2. apply imports enhanced analysis, rewrites preprocess-context.json, then emits target files
3. deterministic postprocess creates minimum target bootstrap and grounded docs
4. target-specific agent postprocess only refines or expands what is already runnable
```

Why this is correct:
- Runtime workspace state and emitted target state stay in sync.
- Validation can enforce hard correctness before any optional semantic refinement runs.
- Deterministic plumbing and target-specific postprocess have clean, non-overlapping responsibilities.

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

## Generated Target Contract

When the emitted target is itself an operational workflow system, pipeline validation must go beyond entity counts.

Required checks for framework-to-framework conversions:
- [ ] Target bootstrap files required by downstream tools exist (`workflow.md`, spec indexes, equivalent entrypoints).
- [ ] Historical source items are emitted into archive paths, not active work queues.
- [ ] Entity IDs exported to runtime JSON are deterministic across preprocess reruns, or the pipeline provides an explicit migration/remap step.
- [ ] Emitted task metadata preserves source timestamps/status separately from import-time metadata.
- [ ] Runtime context exports are refreshed after enhanced-analysis merge so downstream flags remain truthful.
- [ ] Relation extraction and metadata extraction reuse the same compatibility helper when they depend on the same source syntax.

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
