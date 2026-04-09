# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

**This is a CLI tool** - these guidelines cover CLI output quality and TypeScript standards.

Since there's no UI, "frontend quality" means:
- Clear, colored terminal output
- Helpful error messages
- Consistent command interface

---

## CLI Output Quality

### Use Colors Appropriately

```typescript
import chalk from 'chalk';

// Information - blue
console.log(chalk.blue(`\nStarting conversion...\n`));

// Success - green
console.log(chalk.green(`\nConversion complete!\n`));

// Warning - yellow
console.log(chalk.yellow(`\nDry run - no files written.\n`));

// Error - red
console.error(chalk.red(`\nConversion failed.\n`));
```

### Show Progress for Long Operations

```typescript
// Before long operation
console.log(chalk.bold('\nRunning conversion pipeline...\n'));

// After completion
console.log(chalk.bold('Conversion Results:'));
console.log(`  Status: ${result.success ? chalk.green('SUCCESS') : chalk.red('FAILED')}`);
console.log(`  Entities processed: ${result.entitiesProcessed}`);
```

### Format Error Messages for Humans

```typescript
// BAD - technical jargon
console.error(chalk.red(`ERR: SQLite constraint violation on entities.id`));

// GOOD - helpful message
console.error(chalk.red(`\nError: Could not write converted file.`));
console.log(`  Check that the target directory is writable.\n`);
```

---

## Command Interface Quality

### Consistent Option Patterns

```typescript
export interface ConvertOptions {
  source?: string;        // Framework to convert from
  target?: string;        // Framework to convert to
  mode?: string;          // 'sampling' | 'full' | 'on-demand'
  dryRun?: boolean;       // Don't write files
  verbose?: boolean;      // Debug logging
  projectPath?: string;   // Target project directory
}
```

### Always Provide Help

```typescript
// When options are missing
if (!sourceFramework || !targetFramework) {
  console.error(chalk.red('Source and target frameworks must be specified.'));
  console.log('Usage: transpec convert --source <framework> --target <framework>\n');
  process.exit(1);
}
```

### Validate Early, Fail Fast

```typescript
// Validate at start - before any work begins
if (!projectPath || !fs.existsSync(projectPath)) {
  console.error(chalk.red(`Project path does not exist: ${projectPath}`));
  process.exit(1);
}
```

---

## TypeScript Quality

Same rules as backend - no `any`, strict mode, explicit types.

```typescript
// GOOD
export async function convertCommand(options: ConvertOptions): Promise<void> {
  const result = await engine.run();
  displayResults(result);
}

// BAD
export async function convertCommand(options: any): Promise<any> {
  const result = await engine.run();
  displayResults(result);
}
```

---

## Testing

CLI commands can be tested by:

1. **Unit test the core logic** (engine, adapters)
2. **Integration test commands** by capturing output

```typescript
// Example Vitest test for convert command
import { describe, it, expect } from 'vitest';
import { convertCommand } from './convert';

describe('convertCommand', () => {
  it('should exit with error if frameworks not specified', async () => {
    const exit = await import.meta.exit;
    // Test that process.exit was called
  });
});
```

---

## Forbidden Patterns

1. **No ANSI codes in error messages** - use chalk
2. **No stack traces in user output** - log internally, show friendly message
3. **No empty error messages** - always explain what went wrong
4. **No silent failures** - always log and display
5. **No `any` types** - same as backend rules

---

## Code Review Checklist

### User Experience
- [ ] Colors used appropriately (info/success/warn/error)
- [ ] Error messages are helpful, not technical
- [ ] Progress shown for long operations
- [ ] Help text provided when arguments missing

### Code Quality
- [ ] No `any` types
- [ ] Async/await for all I/O
- [ ] Errors logged AND displayed
- [ ] Types explicit on public functions

---

## Summary

Since this is a CLI tool, "frontend" quality = CLI UX quality.

The goal: When a user runs `transpec convert`, they should always know:
1. What is happening (progress)
2. What went wrong (errors)
3. What succeeded (results)
