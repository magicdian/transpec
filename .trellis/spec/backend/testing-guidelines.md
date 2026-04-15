# Testing Guidelines

> How to write and organize tests for Transpec.

---

## Overview

Transpec uses **Vitest** as the test framework. Tests are **required** for:
- New features
- Bug fixes
- Adapter implementations
- Core engine phases

**Principle**: Tests are not optional. A feature without tests is considered incomplete.

---

## Test Framework

```bash
# Run all tests
npm test

# Run tests in watch mode (development)
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Configuration

Vitest is configured in `vitest.config.ts` (if added) or `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## Test File Organization

### Location Convention

Tests live **next to source files**:

```
packages/cli/src/
├── core/
│   ├── engine/
│   │   ├── engine.ts              # Source
│   │   └── engine.test.ts         # Tests
│   ├── framework/
│   │   ├── adapters/
│   │   │   ├── trellis.ts
│   │   │   └── trellis.test.ts
│   │   └── adapters/
│   │       ├── openspec.ts
│   │       └── openspec.test.ts
│   └── ir/
│       ├── types.ts
│       └── types.test.ts
```

### Naming Convention

| Item | Convention | Example |
|------|-----------|---------|
| Test file | `{module}.test.ts` | `engine.test.ts` |
| Test directory | Same as source | `engine/` |
| Fixture file | `{name}.fixture.ts` | `trellis.fixture.ts` |

---

## Test Structure

### Anatomy of a Test

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ConversionEngine } from './engine.js';
import { SQLiteStorage } from '../storage/sqlite.js';

describe('ConversionEngine', () => {
  let engine: ConversionEngine;
  let storage: SQLiteStorage;

  beforeEach(() => {
    // Setup before each test
    storage = new SQLiteStorage(':memory:');
    engine = new ConversionEngine({ /* options */ }, ':memory:');
  });

  describe('initialize()', () => {
    it('should load source and target adapters', async () => {
      await engine.initialize();

      expect(engine.sourceAdapter).toBeDefined();
      expect(engine.targetAdapter).toBeDefined();
    });

    it('should throw when source framework is unsupported', async () => {
      const invalidEngine = new ConversionEngine({
        sourceFramework: 'unsupported',
        targetFramework: 'trellis',
        projectPath: '/tmp',
        mode: 'full',
        dryRun: true,
      }, ':memory:');

      await expect(invalidEngine.initialize()).rejects.toThrow('Source framework');
    });
  });
});
```

### Given-When-Then Pattern

Use comments to clarify test intent:

```typescript
describe('TrellisAdapter', () => {
  describe('parseFile()', () => {
    it('should extract metadata from task frontmatter', async () => {
      // Given: A task file with frontmatter
      const taskContent = `---
status: completed
priority: P1
---
# Task Title`;

      // When: We parse the file
      const entity = await adapter.parseFile('tasks/01-01-task/prd.md');

      // Then: Metadata should be extracted
      expect(entity.metadata.status).toBe('completed');
      expect(entity.metadata.priority).toBe('P1');
    });
  });
});
```

---

## Test Categories

### 1. Unit Tests

Test individual functions/classes in isolation:

```typescript
it('should slugify task names correctly', () => {
  expect(slugify('My Task Name')).toBe('my-task-name');
  expect(slugify('Task 01 - First')).toBe('task-01-first');
});
```

### 2. Integration Tests

Test adapter parsing and emission:

```typescript
describe('TrellisAdapter', () => {
  describe('parseAll()', () => {
    it('should parse all tasks and specs from .trellis directory', async () => {
      // Use fixture directory
      const projectPath = './fixtures/trellis-complete';

      const entities = await adapter.parseAll(projectPath);

      expect(entities).toHaveLength(5);
      expect(entities.filter(e => e.extendedType === 'task')).toHaveLength(3);
      expect(entities.filter(e => e.extendedType === 'spec')).toHaveLength(2);
    });
  });
});
```

### 3. Round-trip Tests

Test parse → emit → parse produces equivalent result:

```typescript
it('should maintain data integrity through round-trip', async () => {
  // Parse original
  const original = await adapter.parseFile('./fixtures/task.md');

  // Emit to temp location
  await adapter.emit(original, '/tmp/output');

  // Re-parse emitted file
  const reParsed = await adapter.parseFile('/tmp/output/task/prd.md');

  // Compare
  expect(reParsed.name).toBe(original.name);
  expect(reParsed.extendedType).toBe(original.extendedType);
  expect(reParsed.content).toBe(original.content);
});
```

---

## Fixture Management

### Test Fixtures Directory

```
packages/cli/src/
├── fixtures/                      # Shared fixtures
│   ├── trellis/
│   │   ├── .trellis/
│   │   │   ├── tasks/
│   │   │   │   └── 01-01-example-task/
│   │   │   │       └── prd.md
│   │   │   └── spec/
│   │   │       └── example.md
│   │   └── config.yaml
│   └── openspec/
│       ├── openspec/
│       │   ├── specs/
│       │   │   └── capability/
│       │   │       └── spec.md
│       │   └── changes/
│       │       └── 2024-01-15-feature/
│       │           └── proposal.md
```

### Loading Fixtures

```typescript
import { readFile } from 'fs/promises';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '../../fixtures');

it('should parse openspec change', async () => {
  const filePath = path.join(fixturesDir, 'openspec/changes/2024-01-15-feature/proposal.md');
  const content = await readFile(filePath, 'utf-8');

  expect(content).toContain('## Summary');
});
```

---

## Required Test Coverage

### Minimum Coverage by Layer

| Layer | What to Test | Coverage Target |
|-------|--------------|-----------------|
| `core/ir/types.ts` | Type serialization, deserialization | 100% |
| `core/storage/sqlite.ts` | CRUD operations, queries, transactions | 90% |
| `core/engine/engine.ts` | Each phase, error handling | 90% |
| `core/framework/adapters/` | parseFile, parseAll, emit, detect | 85% |

### Test Requirements by Feature

| Feature Type | Required Tests |
|--------------|----------------|
| New adapter | detect, parseFile, parseAll, emit, round-trip |
| New engine phase | Phase execution, error handling, result construction |
| New IR type | Serialization, validation, edge cases |
| Bug fix | Regression test (test that previously failed now passes) |

---

## Mocking

### When to Mock

- **Storage**: Use in-memory SQLite (`:memory:`)
- **File system**: Use fixture files
- **External dependencies**: Mock if necessary

### When NOT to Mock

- **Core business logic**: Test with real behavior
- **Type transformations**: Test actual output
- **Adapter parsing**: Use real fixture files

### Mock Example

```typescript
import { vi } from 'vitest';

it('should handle storage errors gracefully', async () => {
  // Mock storage to throw
  const mockStorage = {
    saveEntities: vi.fn().mockRejectedValue(new Error('Disk full')),
  };

  const engine = new ConversionEngine(options, mockStorage);

  await expect(engine.run()).rejects.toThrow('Disk full');
});
```

---

## Test Naming

### Method: `should <expected behavior>`

```typescript
it('should throw when source framework is unsupported');
it('should return empty array when no entities found');
it('should preserve original content during parse');
```

### Method: `when <condition>`

```typescript
describe('when dry run is enabled', () => {
  it('should skip emit phase');
});
```

### Method: `given <precondition>`

```typescript
describe('given a valid project path', () => {
  describe('when parsing', () => {
    it('should extract all entities');
  });
});
```

---

## Test Organization

### Describe Hierarchy

```
describe(ConversionEngine)
  ├── describe(lifecycle)
  │   ├── it(should initialize)
  │   └── it(should cleanup on error)
  ├── describe(run())
  │   ├── describe(PARSE phase)
  │   │   ├── it(should parse all entities)
  │   │   └── it(should handle parse errors)
  │   ├── describe(ANALYZE phase)
  │   │   └── it(should skip when mode is on-demand)
  │   └── describe(EMIT phase)
  │       ├── it(should emit all entities)
  │       └── it(should continue on individual emit failure)
```

---

## Edge Cases to Test

### Empty/Null Cases

```typescript
it('should handle empty project directory');
it('should handle entities with no metadata');
it('should handle missing optional files');
```

### Error Cases

```typescript
it('should throw when database path is invalid');
it('should throw when adapter is not found');
it('should handle malformed frontmatter gracefully');
```

### Boundary Cases

```typescript
it('should handle very long entity names');
it('should handle entities with special characters in names');
it('should handle deep directory nesting');
```

---

## Running Tests

### Local Development

```bash
# Run all tests once
npm test

# Run specific test file
npm test -- engine.test.ts

# Run tests matching pattern
npm test -- "parseFile"

# Watch mode during development
npm run test:watch
```

### CI/Pre-commit

Tests must pass before code is considered ready:

```bash
# Run tests in CI mode (no watch)
npm run test:ci
```

---

## Scenario: Compatibility Matrix Fixtures

### 1. Scope / Trigger
- Trigger: Adapter or command changes are meant to stay compatible with both legacy and current upstream framework layouts.
- Trigger: A submodule update changes markdown shape, monorepo spec layout, or task runtime metadata without changing the high-level conversion flow.

### 2. Signatures

Shared fixture helpers:

```typescript
// packages/cli/src/test/compat-fixtures.ts
export type FrameworkVariant = 'legacy' | 'current';

export async function createOpenSpecProject(
  projectPath: string,
  variant: FrameworkVariant,
): Promise<void>;

export async function createTrellisProject(
  projectPath: string,
  variant: FrameworkVariant,
): Promise<void>;

export async function setupTranspecConfig(
  projectPath: string,
  sourceFramework: 'openspec' | 'trellis',
  targetFramework: 'openspec' | 'trellis',
): Promise<void>;

export async function seedEnhancedAnalysis(projectPath: string): Promise<void>;
```

Smoke coverage entry point:

```typescript
// packages/cli/src/cli/commands/runtime-compat.test.ts
await convertCommand({ projectPath, source, target, dryRun: true });
await preprocessCommand({ projectPath });
await applyCommand({ projectPath });
```

### 3. Contracts
- Compatibility fixtures must model both `legacy` and `current` project shapes for each supported framework.
- `current` OpenSpec fixtures should include compact H3 headings and fenced-code examples that resemble requirement headers.
- `current` Trellis fixtures should include package-scoped spec directories (`.trellis/spec/<package>/<layer>/...`) and modern `task.json` lifecycle fields (`current_phase`, `next_action`, `children`, `parent`).
- Command-level smoke tests must verify `.transpec/workspace/*.json`, `.transpec/ir/conversion.db`, and representative output files after `apply`.

### 4. Validation & Error Matrix

| Layer | Validation | Failure behavior |
|------|------------|------------------|
| Fixture helper | Legacy/current project skeletons build successfully in temp dirs | Test setup fails before real compatibility behavior is exercised |
| Adapter regression | `parseAll()` returns equivalent entity classes for legacy/current variants | Format drift is caught only in production projects |
| Runtime smoke flow | `convert`, `preprocess`, `apply` complete and write expected runtime artifacts | Adapter tests pass but CLI plumbing regresses |
| Output assertions | Representative target files exist after `apply` | Transform/emit breakage hides behind green parse-only tests |

### 5. Good/Base/Bad Cases

#### Good
- One shared helper creates current Trellis fixtures with package-scoped specs; both adapter tests and command smoke tests reuse it.
- Runtime compatibility test verifies `dryRun` leaves no persisted DB, then normal preprocess/apply creates the expected DB and context files.

#### Base
- Legacy OpenSpec and legacy Trellis fixtures still run through the same helper layer with only variant-specific content changes.

#### Bad
- Each test hand-rolls its own temp project; legacy/current cases silently diverge and a future update fixes one path while breaking another.
- Only adapter unit tests exist; command runtime regressions in `.transpec/workspace/` or output paths go undetected.

### 6. Tests Required
- `packages/cli/src/core/framework/adapters/openspec.test.ts`
- `packages/cli/src/core/framework/adapters/trellis.test.ts`
- `packages/cli/src/core/framework/adapters/openspec-format.test.ts`
- `packages/cli/src/cli/commands/runtime-compat.test.ts`

Assertion points:
- Legacy/current variants both detect and parse.
- Fenced code examples do not inflate OpenSpec requirement counts.
- Trellis package-scoped spec names keep package prefixes.
- `convert -> preprocess -> apply` writes expected output files and runtime contexts.

### 7. Wrong vs Correct

#### Wrong

```typescript
it('should parse current trellis', async () => {
  await fs.writeFile('.trellis/spec/backend/error-handling.md', '# Errors');
});
```

Why this is wrong:
- The test claims to cover current Trellis but actually uses legacy single-repo layout.
- It cannot catch package-scoped regressions from monorepo updates.

#### Correct

```typescript
const projectPath = await createTempDir('transpec-trellis-current-', tempDirs);
await createTrellisProject(projectPath, 'current');
await setupTranspecConfig(projectPath, 'trellis', 'openspec');
await preprocessCommand({ projectPath });
await applyCommand({ projectPath });
```

Why this is correct:
- The same current-layout fixture is reused across adapter and command tests.
- Package-scoped layout, task lifecycle metadata, and CLI runtime files are validated together.

---

## Common Mistakes

### 1. Test without assertions

```typescript
// BAD - no assertions
it('should parse file', async () => {
  const result = await adapter.parseFile(path);
});

// GOOD - has assertions
it('should parse file', async () => {
  const result = await adapter.parseFile(path);
  expect(result).toBeDefined();
  expect(result.extendedType).toBe('task');
});
```

### 2. Testing implementation details

```typescript
// BAD - fragile, tests how not what
it('should call extractMetadata() then setContent()');

// GOOD - tests behavior
it('should extract metadata from frontmatter');
```

### 3. Not cleaning up after tests

```typescript
// BAD - leaves temp files
afterEach(() => {
  // Missing cleanup
});

// GOOD - cleanup
afterEach(() => {
  fs.rmSync('/tmp/test-output', { recursive: true });
});
```

### 4. Hardcoding paths

```typescript
// BAD - breaks on other machines
const path = '/Users/john/project/fixtures';

// GOOD - use __dirname
const fixturesDir = path.join(__dirname, '../../fixtures');
```

---

## Test-Driven Development

For new features, follow TDD:

1. **Red**: Write a failing test
2. **Green**: Write minimal code to pass
3. **Refactor**: Improve code while keeping tests green

```typescript
// Step 1: Write failing test
it('should detect openspec framework by config.yaml', async () => {
  const adapter = new OpenSpecAdapter();
  const result = await adapter.detect('./fixtures/openspec');
  expect(result).toBe(true);
});

// Step 2: Implement to make it pass
// Step 3: Refactor if needed
```

---

## References

- Vitest docs: https://vitest.dev/
- Package config: `packages/cli/package.json`
- Example test patterns: (currently no tests exist - this guide defines the standard)
