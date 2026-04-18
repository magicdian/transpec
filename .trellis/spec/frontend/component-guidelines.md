# Component Guidelines

> How components are built in this project.

---

## Overview

**This is a CLI tool - there are NO UI components.**

This document exists to explain why there are no component patterns and what to do instead.

---

## Why No Components?

This project (`@magicdian/transpec`) is a **spec conversion tool** that:
- Runs as `transpec convert --source openspec --target trellis`
- Outputs text to terminal
- Has no graphical user interface

There is no React, Vue, or any other UI framework.

---

## What IS There Instead?

### CLI Commands (User-Facing Units)

Instead of "components", this project has **CLI commands**:

```
src/cli/commands/
├── detect.ts    # Detect frameworks in project
├── init.ts      # Initialize .transpec config
├── convert.ts   # Convert between frameworks
└── apply.ts     # Apply converted changes
```

Each command:
1. Parses CLI arguments
2. Configures logging
3. Calls core business logic
4. Formats and displays results

### Example: Convert Command Structure

```typescript
// packages/cli/src/cli/commands/convert.ts

export async function convertCommand(options: ConvertOptions) {
  // 1. Configure logging
  Logger.configure({ level: LogLevel.INFO, console: true });

  // 2. Validate
  if (!sourceFramework || !targetFramework) {
    console.error(chalk.red('Source and target frameworks required.'));
    process.exit(1);
  }

  // 3. Execute
  const engine = new ConversionEngine(options, dbPath);
  const result = await engine.run();

  // 4. Display results
  if (result.success) {
    console.log(chalk.green('\nConversion complete!\n'));
  } else {
    console.log(chalk.red('\nConversion failed.\n'));
    process.exit(1);
  }
}
```

---

## If You Need a UI

This is not the right project. Look elsewhere for:
- Web interfaces → Next.js, Remix, etc.
- Desktop apps → Electron, Tauri
- Terminal UI → Inquirer.js,oclif

---

## What NOT to Do

1. **Don't add React/Vue components** to this project
2. **Don't add CSS or styling** (no stylesheet)
3. **Don't add component libraries** (no UI framework)
4. **Don't create "pages" or "views"** directories

If you need to improve CLI output, update the command files in `src/cli/commands/`.

---

## Summary

| Traditional Frontend | This Project |
|---------------------|--------------|
| Components | CLI Commands |
| Props | Command Options |
| State | Execution Context |
| Render | Console Output |
| CSS | chalk colors |
