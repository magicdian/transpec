# Error Handling

> How errors are handled in this project.

---

## Overview

This project uses a **fail-fast, log-and-exit** pattern for CLI errors. Errors are:
1. Caught at boundary points
2. Logged with full context
3. Displayed to user with helpful message
4. Exit code set appropriately

---

## Error Types

### Built-in Error Classes

The project primarily uses JavaScript's built-in error types:

```typescript
// For programmer mistakes (assertions)
throw new Error(`Source adapter not initialized`);

// For expected failures with context
throw new Error(`Source framework '${sourceFramework}' not supported`);

// For file/IO operations
throw new Error(`Failed to read file: ${filePath}`);
```

### Custom Error Patterns

**Validation Errors** (user input):
```typescript
if (!sourceFramework || !targetFramework) {
  console.error(chalk.red('Source and target frameworks must be specified.'));
  process.exit(1);
}
```

**Operation Failures** (expected runtime failures):
```typescript
try {
  const content = await fs.readFile(configPath, 'utf-8');
} catch {
  logger.debug('No config file found, using CLI options');
}
```

---

## Error Handling Patterns

### Pattern 1: Fail-Fast with Logging

For CLI commands - catch, log, display, exit:

```typescript
try {
  const result = await conversionEngine.run();
  if (!result.success) {
    console.log(chalk.red('\nConversion completed with errors.\n'));
    process.exit(1);
  }
} catch (error) {
  logger.error('Conversion failed with exception', {
    error: (error as Error).message,
    stack: (error as Error).stack
  });
  console.error(chalk.red('Error during conversion:'), error);
  process.exit(1);
}
```

### Pattern 2: Graceful Degradation with Fallbacks

When optional operations fail, use defaults:

```typescript
try {
  const configContent = await fs.readFile(configPath, 'utf-8');
  const config = parseYaml(configContent);
  // Use config values...
} catch {
  logger.debug('No config file found, using CLI options'); // Not an error!
  // Use CLI defaults...
}
```

### Pattern 3: Partial Failure Tracking

For batch operations, collect issues and report:

```typescript
const issues: ValidationIssue[] = [];

// During processing...
for (const entity of this.entities) {
  if (!entity.name) {
    issues.push({ type: 'error', message: `Entity ${entity.id} missing name` });
  }
}

// At end...
if (issues.length > 0) {
  logger.warn('Validation completed with issues', { issues });
}
```

---

## Error Logging

Errors are logged BEFORE throwing/exiting:

```typescript
// Always log before throwing
logger.error('Conversion failed', { error: errorMessage });
throw new Error(errorMessage);

// Log before exit
logger.error('Conversion failed', { issues: result.issues });
console.error(chalk.red('\nConversion completed with errors.\n'));
process.exit(1);
```

**Log format** includes:
- Error message
- Relevant context (framework names, file paths, IDs)
- Stack trace (for unexpected errors)

---

## What NOT to Do

1. **Don't swallow errors silently**:
   ```typescript
   // BAD
   try { ... } catch { /* nothing */ }

   // GOOD
   try { ... } catch { logger.debug('Expected failure, continuing...'); }
   ```

2. **Don't throw from constructors** - use factory methods or initialize separately

3. **Don't mix logging and throwing** - choose one:
   ```typescript
   // BAD
   logger.error('Failed', { error }); throw new Error(error);

   // GOOD - log at the point where action is taken
   logger.error('Conversion failed', { issues });
   process.exit(1);
   ```

4. **Don't expose raw internal errors** to users:
   ```typescript
   // BAD - leaks implementation details
   console.error(chalk.red(`Database error: ${error.message}`));

   // GOOD - user-friendly message
   console.error(chalk.red('Failed to read project configuration.'));
   ```

---

## Common Mistakes

### 1. Forgetting to handle async errors

```typescript
// BAD - unhandled promise rejection
async function parseAll() {
  const entities = await sourceAdapter.parseAll(projectPath); // If this throws...
}

// GOOD - try-catch at top level
async function run() {
  try {
    const entities = await sourceAdapter.parseAll(projectPath);
  } catch (error) {
    issues.push({ type: 'error', message: `Parse failed: ${error.message}` });
  }
}
```

### 2. Not distinguishing between user errors and bugs

```typescript
// BAD - treating user error as system error
if (!framework) throw new Error('Framework not specified'); // User error, not a bug

// GOOD - graceful handling for user errors
if (!framework) {
  console.error('Please specify a framework with --framework');
  process.exit(1);
}
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (validation, conversion failure, user input) |
| 2+ | Reserved for future use |

Always use `process.exit(1)` for failures in CLI commands.
