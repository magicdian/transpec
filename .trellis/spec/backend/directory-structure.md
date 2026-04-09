# Directory Structure

> How backend code is organized in this project.

---

## Overview

This is a TypeScript CLI tool (`packages/cli`). The codebase follows a **layered architecture** with clear separation between CLI commands, core business logic, and storage.

---

## Directory Layout

```
packages/cli/
├── src/
│   ├── cli/                    # CLI layer - user-facing commands
│   │   ├── main.ts             # CLI entry point
│   │   ├── index.ts            # CLI exports
│   │   ├── utils/              # CLI utilities (YAML parsing, etc.)
│   │   │   ├── index.ts
│   │   │   └── yaml.ts
│   │   └── commands/           # Command implementations
│   │       ├── index.ts
│   │       ├── detect.ts       # Framework detection
│   │       ├── init.ts         # Project initialization
│   │       ├── convert.ts      # Spec conversion
│   │       └── apply.ts        # Apply changes
│   │
│   ├── core/                   # Core business logic
│   │   ├── engine/             # Conversion engine
│   │   │   ├── engine.ts      # Main engine orchestrator
│   │   │   └── index.ts
│   │   ├── framework/          # Framework adapters (OpenSpec, Trellis, etc.)
│   │   │   ├── index.ts        # Framework registry
│   │   │   ├── registry.ts     # Adapter registry
│   │   │   ├── base-adapter.ts # Base adapter interface
│   │   │   └── adapters/       # Framework adapters
│   │   │       ├── index.ts
│   │   │       ├── openspec.ts # OpenSpec framework adapter
│   │   │       └── trellis.ts  # Trellis framework adapter
│   │   ├── ir/                 # Intermediate Representation
│   │   │   ├── types.ts        # Core IR type definitions
│   │   │   └── index.ts
│   │   ├── storage/            # Data persistence (SQLite)
│   │   │   ├── sqlite.ts        # SQLite storage manager
│   │   │   └── index.ts
│   │   ├── logging/             # Logging infrastructure
│   │   │   ├── logger.ts        # Custom logger
│   │   │   └── index.ts
│   │   └── skill/               # Skill system
│   │       ├── index.ts
│   │       └── skill.ts
│   │
│   └── ide/                    # IDE integration (future)
│
├── bin/                        # CLI entry points
│   └── transpec.js             # Shebang entry point
│
├── dist/                       # Compiled output
├── package.json
└── tsconfig.json
```

---

## Module Organization

### CLI Layer (`src/cli/`)

Contains user-facing command implementations. Each command:
- Handles command-line arguments and validation
- Configures logging
- Orchestrates core components
- Formats and displays output

**Example**: `src/cli/commands/convert.ts`
```typescript
export async function convertCommand(options: ConvertOptions) {
  // 1. Configure logging
  Logger.configure({ level: LogLevel.INFO, console: true });
  
  // 2. Validate options
  if (!sourceFramework || !targetFramework) {
    console.error(chalk.red('Source and target frameworks must be specified.'));
    process.exit(1);
  }
  
  // 3. Create and run engine
  const engine = new ConversionEngine(options, dbPath);
  await engine.initialize();
  const result = await engine.run();
  
  // 4. Display results
  console.log(chalk.green(`\nConversion complete!\n`));
}
```

### Core Layer (`src/core/`)

Contains pure business logic with **no CLI dependencies**. This separation allows:
- Core logic to be imported as a library
- Unit testing without CLI overhead
- Future API/IDE integrations

**Key principle**: Core layer imports Node.js built-ins only (`fs`, `path`, etc.) - no `chalk`, `commander`, etc.

### Framework Adapters (`src/core/framework/adapters/`)

Each framework (OpenSpec, Trellis, etc.) has its own adapter that:
- Implements `FrameworkAdapter` interface
- Converts framework-specific format ↔ Core IR
- Is loaded dynamically via the registry

---

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Source files | `kebab-case.ts` | `sqlite.ts`, `convert.ts` |
| Directories | `kebab-case/` | `framework/`, `core/ir/` |
| Classes | `PascalCase` | `ConversionEngine`, `SQLiteStorage` |
| Interfaces | `PascalCase` | `FrameworkAdapter`, `ConvertOptions` |
| Enums | `PascalCase` | `ConversionPhase`, `LogLevel` |
| Type aliases | `PascalCase` | `CoreEntity`, `IRDocument` |
| Private methods | `camelCase` | `runParsePhase()`, `extractRelations()` |
| Constants | `SCREAMING_SNAKE_CASE` | `LogModules`, `CoreType` |

---

## File Organization Rules

1. **One export per file** for classes and functions (except small related utilities)
2. **Index files** (`index.ts`) for public API surface of each module
3. **Barrel exports** at module level to avoid deep imports
4. **`.js` extension** required in imports (Node.js ESM requirement)

---

## Examples

### Good: Well-organized command
- `packages/cli/src/cli/commands/convert.ts` - Clear structure: validate → configure → execute → display

### Good: Core engine with phases
- `packages/cli/src/core/engine/engine.ts` - Orchestrates Parse → Analyze → Transform → Validate → Emit

### Good: Type definitions
- `packages/cli/src/core/ir/types.ts` - Single source of truth for IR types

---

## What's NOT Here

This is a CLI tool, so there is NO:
- HTTP server / API routes
- Database ORM (raw SQLite only)
- Authentication / authorization
- Frontend components

If you're adding a feature, ask: "Is this CLI logic or core logic?" and place accordingly.
