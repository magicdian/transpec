# IR Design Principles

> Intermediate Representation (IR) design for framework-agnostic spec conversion.

---

## Overview

Transpec's core is a **stable ABI IR** inspired by LLVM IR. The IR schema is intentionally minimal and never changes when adding new frameworks. Framework-specific concepts are stored as strings, not schema additions.

---

## Core Design Philosophy

| Principle | Description |
|-----------|-------------|
| **Stable ABI** | IR schema never changes when adding frameworks |
| **Framework-agnostic** | No framework-specific concepts in core types |
| **Extensible metadata** | Framework-specific data stored as JSON blobs |
| **String-typed relations** | `relationType` is framework-defined (e.g., "implements", "depends_on") |

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
  content: string;              // Full text content
  metadata: Record<string, unknown>;  // Framework-specific data as JSON
  sourceFramework: string;      // e.g., 'openspec', 'trellis'
  sourcePath: string;           // Original file path
  createdAt: string;           // ISO timestamp
  updatedAt: string;           // ISO timestamp
}
```

### Field Semantics

| Field | Purpose | Notes |
|-------|---------|-------|
| `id` | Globally unique identifier | Generated: `{framework}-{type}-{timestamp}-{random}` |
| `name` | Human-readable name | Extracted from file/directory name |
| `coreType` | Maps to stable type | Only `DOCUMENT` or `WORKFLOW` |
| `extendedType` | Framework-specific type | Stored as string for flexibility |
| `content` | Full original content | Never parsed, stored as-is |
| `metadata` | Framework-specific data | JSON blob - schema-free |
| `sourceFramework` | Origin framework | For traceability |
| `sourcePath` | Original file location | For debugging and relinking |

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

**`version` field** ensures future schema evolution doesn't break existing conversions.

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
  designContent: string,
  requirementCount: { added: number, modified: number }
};

// Trellis task metadata
entity.metadata = {
  taskJson: { /* full task.json contents */ },
  date: string,
  status: string,
  priority: string,
  assignee: string
};
```

### Metadata Extraction

When parsing, metadata is extracted but **content is preserved**:

```typescript
// GOOD - content preserved, metadata extracted
const entity = await adapter.parseFile(filePath);
entity.metadata.extractedFields = parseYAML(content);

// BAD - content modified
const parsed = parseYAML(content);
entity.content = stringify(parsed); // Lost original format!
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

## Adding New Frameworks

**Never modify IR schema**. To add a new framework:

1. Create new adapter in `src/core/framework/adapters/`
2. Implement `FrameworkAdapter` interface
3. Define `extendedType` mappings in adapter
4. Store framework-specific data in `metadata`

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

---

## Common Mistakes

### 1. Parsing content instead of preserving

```typescript
// BAD - loses original content/formatting
entity.content = JSON.stringify(parseJSON(content));

// GOOD - preserves original, extracts for metadata
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

---

## References

- IR types: `packages/cli/src/core/ir/types.ts`
- Trellis adapter: `packages/cli/src/core/framework/adapters/trellis.ts`
- OpenSpec adapter: `packages/cli/src/core/framework/adapters/openspec.ts`
