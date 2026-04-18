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

---

## Scenario: Init Menuconfig Keyboard And Focus Contract

### 1. Scope / Trigger
- Trigger: `transpec init` interactive mode uses a custom keyboard-driven TUI instead of linear prompts.
- This is contract-level because regressions in key semantics or focus restoration directly break user workflow.

### 2. Signatures

```typescript
type MenuEventType = 'enter' | 'space' | 'escape' | 'ctrl-c';

interface MenuEvent {
  type: MenuEventType;
  focusedRowId: string | null;
  row: FocusableMenuRow | null;
}

async function waitForMenuEvent(
  frameBuilder: () => MenuFrame,
  focusRowId: string | null,
): Promise<MenuEvent>;
```

### 3. Contracts

Keyboard semantics:
- `Enter`: enter submenu or execute action; must not toggle single/multi selections.
- `Space`: toggle/select for choice rows (`< >/<*>`, `[ ]/[*]`, toggle rows).
- `Esc`: return to parent menu; at root menu can be no-op by design.

Focus restoration contract:
- After returning from submenu, parent menu focus must stay on the row that opened that submenu.
- Example: enter `Target Framework` submenu, press `Esc`, parent focus must remain on `Target Framework`.

Main menu row grammar contract:
- `Source Framework`, `Target Framework`, `Analysis Mode`, `Code Spec Organization` are action-entry rows with `--->` and no leading single-choice marker.
- Multi-select rows use `[ ]/[*]`.
- Single-choice rows inside submenus use `< >/<*>`.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| `Esc` inside any submenu | Return one level up |
| `Esc` at root menu | Keep current screen (no forced exit) |
| Return from submenu | Focus remains on originating row |
| `Enter` on single-choice row | No selection change |
| `Space` on single-choice row | Selection changes to focused option |
| `Space` on multi-choice row | Toggle focused option only |

### 5. Good / Base / Bad Cases

- Good:
  - User enters `Target Framework`, presses `Esc`, lands back on `Target Framework` row.
  - User changes `Analysis Mode` with `Space` inside submenu; `Enter` does not toggle.
- Base:
  - User navigates only with arrows and `Enter`; no toggles occur accidentally.
- Bad:
  - Returning from submenu resets focus to first item (`IDE / Agent Setup`).
  - `Enter` on single-choice row changes selection.

### 6. Tests Required

- Keep pure helper tests for config serialization in `src/cli/commands/init.test.ts`.
- Add interaction-state tests when menu state transitions are extracted into testable helpers:
  - Focus restoration after submenu exit.
  - Key semantic matrix (`Enter` vs `Space` vs `Esc`) for each row type.
  - Root `Esc` no-op behavior.

### 7. Wrong vs Correct

#### Wrong

```typescript
// Submenu returns but parent focus is not restored.
await runTargetMenu(draft);
// focusRowId left unchanged or reset to first row by default render path.
```

#### Correct

```typescript
await runTargetMenu(draft);
focusRowId = 'edit-target';
```

## Scenario: Published CLI Package Metadata And README Badge Contract

### 1. Scope / Trigger
- Trigger: changing `packages/cli/package.json`, package-level README files, or root README badge/link content for the published `@magicdian/transpec` package.
- This is contract-level because npm package metadata, publish payload shape, and README badge links directly affect the public package page and release usability.

### 2. Signatures

```json
{
  "name": "@magicdian/transpec",
  "version": "YYMM.D.B",
  "main": "dist/cli/index.js",
  "types": "dist/cli/index.d.ts",
  "files": ["bin", "dist", "README.md", "README_CN.md"],
  "license": "Apache-2.0",
  "publishConfig": {
    "access": "public"
  },
  "engines": {
    "node": ">=18"
  }
}
```

```bash
npm run build
npx vitest run
NPM_CONFIG_CACHE=/tmp/transpec-npm-cache npm pack --dry-run
```

### 3. Contracts

Package metadata contract:
- `description` must present `transpec` as a universal conversion framework, while naming OpenSpec -> Trellis only as the currently production-ready workflow.
- `main` and `types` must point at built runtime entrypoints that actually exist after `npm run build`.
- `files` must whitelist runtime assets and package docs only; do not rely on implicit npm ignore behavior.
- `license` must match the repository root `LICENSE` file (`Apache-2.0`).

Build output contract:
- `npm run build` must remove stale `dist/` output before compiling, otherwise removed test files can remain publishable.
- `packages/cli/tsconfig.json` must exclude `src/**/*.test.ts` and `src/test/**/*` from publishable build output.

README / badge contract:
- Root README files are the full GitHub-facing docs; package README files are short npm entry docs that link back to the repo guides.
- License badges must use the GitHub license badge endpoint, not the npm license endpoint for this scoped package.
- Static license links in README badges must point to the stable `main` branch path:
  `https://github.com/magicdian/transpec/blob/main/LICENSE`

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| `npm pack --dry-run` includes `src/` or tests | Fix `files`, build cleanup, or `tsconfig` excludes before publishing |
| `main` points to missing file | Fix package entry fields before publish |
| README license badge shows `package not found` | Use GitHub license badge instead of npm license badge |
| README license link targets `dev` or another moving branch | Update link to `main` for stable public docs |
| Package metadata license differs from repo `LICENSE` | Align package metadata to repo license before publish |

### 5. Good / Base / Bad Cases

- Good:
  - `description` says universal framework first, and OpenSpec -> Trellis as the currently complete workflow.
  - `npm pack --dry-run` shows only `bin`, `dist`, and package README files.
  - README license badge renders and links to `main/LICENSE`.
- Base:
  - npm package page has a short package README and links to full GitHub docs.
- Bad:
  - README uses `img.shields.io/npm/l/...` and renders `package not found`.
  - `dist/` still contains compiled test files from a previous build.
  - `main` points to `dist/index.js` when only `dist/cli/index.js` exists.

### 6. Tests Required

- Packaging verification:
  - run `npm run build`
  - run `npx vitest run`
  - run `NPM_CONFIG_CACHE=/tmp/transpec-npm-cache npm pack --dry-run`
- Assertion points:
  - tarball contains no `src/` sources or compiled test artifacts
  - tarball still contains `bin/transpec.js`, runtime `dist/`, and package README files
  - package entrypoints in `package.json` match files present in `dist/`

### 7. Wrong vs Correct

#### Wrong

```md
[![license](https://img.shields.io/npm/l/%40magicdian%2Ftranspec)](...)
```

```json
{
  "main": "dist/index.js"
}
```

#### Correct

```md
[![license](https://img.shields.io/github/license/magicdian/transpec?style=flat-square)](https://github.com/magicdian/transpec/blob/main/LICENSE)
```

```json
{
  "main": "dist/cli/index.js",
  "types": "dist/cli/index.d.ts"
}
```
