# Type Safety

> Type safety patterns in this project.

---

## Overview

This project uses **TypeScript strict mode** throughout. Type safety applies to:
- CLI command options
- Core IR types
- Framework adapter interfaces

---

## TypeScript Configuration

Strict mode is enabled in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

---

## Type Organization

### Core IR Types (`src/core/ir/types.ts`)

Single source of truth for conversion types:

```typescript
// packages/cli/src/core/ir/types.ts

export enum CoreType {
  DOCUMENT = 'DOCUMENT',
  WORKFLOW = 'WORKFLOW',
}

export interface CoreEntity {
  id: string;
  name: string;
  coreType: CoreType;
  extendedType: string;  // Framework-specific
  content: string;
  metadata: Record<string, unknown>;  // Framework-specific
  sourceFramework: string;
  sourcePath: string;
  createdAt: string;
  updatedAt: string;
}

export type FrameworkType = 'openspec' | 'trellis' | 'speckit' | 'superpower';
```

### CLI Options Types

Each command defines its options interface:

```typescript
// packages/cli/src/cli/commands/convert.ts

export interface ConvertOptions {
  source?: string;
  target?: string;
  mode?: string;
  dryRun?: boolean;
  verbose?: boolean;
  projectPath?: string;
}
```

---

## Type Patterns

### 1. Explicit Return Types for Public APIs

```typescript
// GOOD - explicit return
export async function convertCommand(options: ConvertOptions): Promise<void> {
  // ...
}

// GOOD - explicit type for complex returns
export async function detectCommand(options: DetectOptions): Promise<FrameworkDetails[]> {
  // ...
}
```

### 2. Type Narrowing for Validation

```typescript
// GOOD - narrowed type after check
if (!sourceAdapter) {
  throw new Error(`Source framework '${sourceFramework}' not supported`);
}
// TypeScript knows sourceAdapter is defined here

// BAD - assertion without check
const adapter = sourceAdapter!; // Dangerous!
```

### 3. Discriminated Unions for State

```typescript
// GOOD - discriminated union
type Result =
  | { success: true; data: CoreEntity[] }
  | { success: false; error: string };

function process(): Result {
  if (something) {
    return { success: true, data: [] };
  }
  return { success: false, error: 'Failed' };
}
```

---

## Validation

### Runtime Validation with Type Guards

```typescript
// Type guard for FrameworkType
function isFrameworkType(value: string): value is FrameworkType {
  return ['openspec', 'trellis', 'speckit', 'superpower'].includes(value);
}

// Usage
const framework = input as string;
if (!isFrameworkType(framework)) {
  throw new Error(`Unknown framework: ${framework}`);
}
```

### Config Parsing with Zod (if needed)

For complex config validation, use Zod:

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  project: z.object({
    sourceFramework: z.string(),
    targetFramework: z.string(),
    mode: z.enum(['sampling', 'full', 'on-demand']).optional(),
  }).optional(),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  }).optional(),
});

type Config = z.infer<typeof ConfigSchema>;
```

---

## Forbidden Patterns

### 1. `any` - Never

```typescript
// BAD
function process(data: any) { ... }

// GOOD
function process(data: CoreEntity) { ... }
function process(data: Record<string, unknown>) { ... }
```

### 2. Non-null Assertions Without Reason

```typescript
// BAD
const name = entity!.name;

// GOOD - explicit handling
const name = entity?.name ?? 'unnamed';
```

### 3. Type Assertions Without Validation

```typescript
// BAD
const adapter = registry.get(name as FrameworkType);

// GOOD - let TypeScript infer, then check
const adapter = registry.get(name);
if (!adapter) {
  throw new Error(`Framework '${name}' not supported`);
}
```

---

## Common Mistakes

### 1. Over-specifying Types

```typescript
// BAD - redundant
const name: string = entity.name;

// GOOD - TypeScript infers
const name = entity.name;
```

### 2. Not Using Type Guards

```typescript
// BAD - assumes valid input
emit(entity as CoreEntity, path);

// GOOD - validates first
if (!isValidEntity(entity)) {
  throw new Error('Invalid entity');
}
emit(entity, path);
```

### 3. Forgetting to Handle `undefined`

```typescript
// BAD
const adapter = registry.get(name);
adapter.parseAll(path); // Error if adapter is undefined!

// GOOD
const adapter = registry.get(name);
if (!adapter) {
  throw new Error(`Unknown framework: ${name}`);
}
adapter.parseAll(path);
```

---

## Summary

| Pattern | When to Use |
|---------|-------------|
| Explicit return types | Public API functions |
| Type guards | Runtime validation |
| Discriminated unions | Result types with success/failure |
| `Record<string, unknown>` | Dynamic metadata objects |
| `as` assertion | Only when types are proven safe |
