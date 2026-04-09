# Directory Structure

> How frontend code is organized in this project.

---

## Overview

**This is a CLI tool, not a web frontend application.**

There are NO React/Vue components, NO CSS, NO assets, and NO traditional frontend patterns.

This document describes the **CLI output patterns** since that's the "user-facing" part of this project.

---

## Why No Frontend?

This project (`@magicdian/transpec`) is a developer tool that:
- Runs as a CLI command (`transpec convert --source openspec --target trellis`)
- Has no web UI
- Outputs text to terminal using `chalk` for colors

If you need to add features, consider:
- Is this a **CLI command**? → Add to `src/cli/commands/`
- Is this **core logic**? → Add to `src/core/`
- Is this **storage**? → Add to `src/core/storage/`

---

## Directory Layout

Since this is a CLI tool, the relevant structure is:

```
packages/cli/
├── src/
│   ├── cli/                    # CLI layer (user-facing "frontend")
│   │   ├── main.ts            # Entry point
│   │   ├── utils/            # Output utilities
│   │   │   └── yaml.ts       # YAML parsing for CLI
│   │   └── commands/         # User commands
│   │
│   └── core/                  # Business logic (no user output)
│       ├── engine/
│       ├── framework/
│       ├── ir/
│       └── storage/
```

---

## CLI Output Patterns

### "Frontend" = CLI Output

The `cli/` directory is the **presentation layer**. It handles:
- Command-line argument parsing
- User output formatting (colors, tables, progress)
- Error message display

### Module Responsibility

| Module | Responsibility |
|--------|----------------|
| `cli/main.ts` | Entry point, argument parsing |
| `cli/commands/*.ts` | Command implementation, user feedback |
| `cli/utils/yaml.ts` | Config file parsing |

---

## Naming Conventions

Same as backend:
- Files: `kebab-case.ts`
- Directories: `kebab-case/`
- Commands: `camelCase` function names

---

## What's NOT Here

- No `components/` directory
- No `pages/` or `views/`
- No `hooks/`
- No `store/` or `state/`
- No CSS/styling files

If you're building a web frontend, this is not the right project.

---

## Adding New Commands

```
src/cli/commands/
├── index.ts          # Re-exports all commands
├── detect.ts         # Already exists
├── init.ts           # Already exists
├── convert.ts        # Already exists
└── new-command.ts    # Your new command
```

New command pattern:

```typescript
import chalk from 'chalk';
import { Logger, LogLevel, getLogger } from '../../core/logging/index.js';

const logger = getLogger(LogModules.CLI);

export interface NewCommandOptions {
  flag: string;
  verbose?: boolean;
}

export async function newCommand(options: NewCommandOptions) {
  Logger.configure({
    level: options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
    console: true,
  });

  console.log(chalk.blue(`\nRunning new command...\n`));

  try {
    // Implementation
    console.log(chalk.green(`\nDone!\n`));
  } catch (error) {
    logger.error('Command failed', { error: (error as Error).message });
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
```
