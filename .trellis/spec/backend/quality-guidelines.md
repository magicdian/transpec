# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

This project uses **TypeScript strict mode** and follows these quality principles:
- Explicit over implicit
- Type safety first
- Small, focused functions
- Clear naming

---

## TypeScript Configuration

The project uses strict TypeScript (`tsconfig.json`):

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

**Forbidden compiler options**:
- `strict: false`
- `noImplicitAny: false`
- `skipLibCheck: false` (already set, keep it)

---

## Forbidden Patterns

### 1. `any` type - Never

```typescript
// BAD
function process(data: any) { ... }

// GOOD
function process(data: CoreEntity) { ... }
function process(data: Record<string, unknown>) { ... }
```

### 2. Non-null assertions without reason

```typescript
// BAD - hiding potential null
const name = entity!.name;

// GOOD - proper null handling
const name = entity?.name ?? 'unnamed';
```

### 3. Type assertions without validation

```typescript
// BAD
const adapter = registry.get(name as FrameworkType);

// GOOD - validate or handle unknown
const adapter = registry.get(name);
if (!adapter) {
  throw new Error(`Framework '${name}' not supported`);
}
```

### 4. Console in core layer

```typescript
// BAD - core should use logger
console.log('Starting');

// GOOD
logger.info('Starting');
```

### 5. Synchronous file operations in async functions

```typescript
// BAD
async function read() {
  const content = fs.readFileSync(path); // Blocks!
}

// GOOD
async function read() {
  const content = await fs.readFile(path, 'utf-8');
}
```

---

## Required Patterns

### 1. Async/await for all I/O

```typescript
// Always async for file, network, DB operations
async function parseAll(projectPath: string): Promise<CoreEntity[]> {
  const entities = await this.sourceAdapter.parseAll(projectPath);
  return entities;
}
```

### 2. Explicit return types for public functions

```typescript
// Public API functions should have explicit types
export async function convertCommand(options: ConvertOptions): Promise<void> {
  // ...
}
```

### 3. Error wrapping with context

```typescript
// BAD - loses context
catch (error) {
  throw error;
}

// GOOD - adds context
catch (error) {
  throw new Error(`Parse failed: ${(error as Error).message}`);
}
```

### 4. Interface for external dependencies

```typescript
// GOOD - depend on interfaces, not implementations
export class ConversionEngine {
  constructor(
    private options: ConversionOptions,
    private storage: SQLiteStorage  // Can be mocked
  ) {}
}
```

---

## Testing Requirements

### Minimum Coverage

| Layer | What to Test |
|-------|--------------|
| `core/engine/` | Conversion phases, entity transformations |
| `core/ir/` | Type serialization/deserialization |
| `core/storage/` | CRUD operations, query building |
| `core/framework/adapters/` | Parse, emit, detect for each framework |

### Test Structure

Tests live next to source files:

```
src/
├── core/
│   ├── engine/
│   │   ├── engine.ts
│   │   └── engine.test.ts   # Vitest tests
```

### Running Tests

```bash
npm test          # Run all tests
npm run test:watch  # Watch mode
```

---

## Code Review Checklist

### Type Safety
- [ ] No `any` types introduced
- [ ] All public functions have explicit return types
- [ ] Null checks handled explicitly

### Error Handling
- [ ] Errors logged before throwing
- [ ] User-friendly messages for CLI errors
- [ ] No swallowed exceptions without logging

### Naming
- [ ] Variables/functions: `camelCase`
- [ ] Classes/Interfaces/Types: `PascalCase`
- [ ] Constants: `SCREAMING_SNAKE_CASE`
- [ ] Files: `kebab-case.ts`

### Performance
- [ ] Batch operations use transactions (SQLite)
- [ ] No sync I/O in async functions
- [ ] Large files streamed, not loaded into memory

### Documentation
- [ ] JSDoc for public APIs
- [ ] Complex logic has comments explaining why
- [ ] No commented-out code

---

## Linting

This project uses **TypeScript's built-in type checking** as the primary lint tool.

ESLint configuration exists in sibling projects (`SpecFrameworks/OpenSpec/eslint.config.js`) - for this project, rely on:
1. `tsc --noEmit` for type checking
2. `npm test` for test coverage
3. Manual code review

---

## Common Mistakes

### 1. Adding features without tests

**Before**: "Tests can be added later"
**After**: "Tests are required for new engine phases and adapter methods"

### 2. Over-using interfaces

**Before**: "Everything should be an interface"
**After**: "Use interfaces for external dependencies; use types for internal data structures"

### 3. Not handling edge cases

**Before**: "Happy path is fine for now"
**After**: "Handle empty arrays, missing files, invalid input explicitly"
