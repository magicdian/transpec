# Logging Guidelines

> How logging is done in this project.

---

## Overview

This project uses a **custom logger** (`src/core/logging/logger.ts`) that provides:
- Module-scoped logging (each module has its own logger)
- Structured log levels (debug, info, warn, error)
- JSON output support (for log files)
- Console output with color (for CLI)

---

## Log Levels

| Level | When to Use | Example |
|-------|--------------|---------|
| `DEBUG` | Detailed diagnostics during development | `logger.debug('Entity parsed', { id, type })` |
| `INFO` | Normal operation milestones | `logger.info('Conversion started', { source, target })` |
| `WARN` | Recoverable issues, degraded operation | `logger.warn('Config not found, using defaults')` |
| `ERROR` | Operation failed, but application can continue | `logger.error('Parse failed', { error: message })` |

---

## Logger Module System

Each module creates its own logger with a module identifier:

```typescript
// In src/core/engine/engine.ts
const logger = getLogger(LogModules.ENGINE);

// In src/cli/commands/convert.ts
const logger = getLogger(LogModules.CLI);

// In src/core/framework/adapters/trellis.ts
const logger = getLogger(LogModules.ADAPTER);
```

The `LogModules` enum centralizes module names:

```typescript
export enum LogModules {
  CLI = 'cli',
  ENGINE = 'engine',
  ADAPTER = 'adapter',
  STORAGE = 'storage',
  IR = 'ir',
  LOGGING = 'logging',
}
```

---

## Structured Logging

All logs accept an optional context object as second parameter:

```typescript
// Simple message
logger.debug('Starting conversion');

// With context (preferred)
logger.info('Conversion completed', {
  success: true,
  duration: `${duration}ms`,
  phases: ['parse', 'analyze', 'transform', 'validate', 'emit'],
});
```

**Required fields in context**:
- `error` - always include for ERROR level
- `source` / `target` - for conversion operations
- `duration` - for completed operations
- `phase` - for phase-specific logs

---

## What to Log

### Phase Transitions
```typescript
logger.info(`[${ConversionPhase.PARSE}] Starting`);
logger.info(`[${ConversionPhase.PARSE}] Completed`, { entities: count });
```

### Configuration Loading
```typescript
logger.debug('Config loaded from file', { sourceFramework, targetFramework });
logger.debug('No config file found, using CLI options');
```

### Entity Processing
```typescript
logger.debug('Entity parsed', { id: entity.id, type: entity.extendedType });
logger.debug('Entity transformed', {
  id: entity.id,
  originalType: original,
  newType: transformed,
});
```

### Operation Results
```typescript
logger.info('Conversion successful', {
  conversionId,
  entitiesProcessed,
  outputPath,
});
logger.error('Conversion failed', { issues });
```

---

## What NOT to Log

1. **Secrets, API keys, tokens** - Never
2. **Full file contents** - Too noisy
3. **PII (names, emails)** - Avoid unless necessary for debugging
4. **Debug noise in production** - Use DEBUG level appropriately

---

## CLI vs Core Logging

### In CLI commands (`src/cli/`)

Configure for user-facing output:

```typescript
Logger.configure({
  level: options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
  console: true,
});

// Use chalk for colored user output
console.log(chalk.blue(`\nStarting conversion...\n`));
console.log(chalk.green(`Conversion complete!\n`));
console.error(chalk.red(`Error: ${message}\n`));
```

### In Core layer (`src/core/`)

Never use `console.*` directly - always use logger:

```typescript
// GOOD - in core layer
logger.debug('Parsing files', { adapter: this.sourceAdapter?.framework });

// BAD - console in core
console.log('Parsing files'); // Never do this
```

---

## Common Mistakes

### 1. Logging but not including context

```typescript
// BAD - useless for debugging
logger.error('Conversion failed');

// GOOD - includes context
logger.error('Conversion failed', {
  error: error.message,
  sourceFramework,
  targetFramework,
  entitiesProcessed,
});
```

### 2. Using INFO for debug details

```typescript
// BAD - INFO is for milestones, not every step
logger.info('Entity parsed', { id });

// GOOD - DEBUG for detailed flow
logger.debug('Entity parsed', { id });
logger.info('Parse phase completed', { count: entities.length });
```

### 3. Not configuring logger in CLI

```typescript
// BAD - logger might not output anything
const logger = getLogger(LogModules.CLI);
logger.info('Starting'); // Might not show!

// GOOD - configure first
Logger.configure({ level: LogLevel.INFO, console: true });
logger.info('Starting');
```

---

## Configuration

Logger is configured via `Logger.configure()`:

```typescript
interface LoggerConfig {
  level: LogLevel;      // Minimum level to output
  console: boolean;     // Output to console
  file?: string;        // Optional file path for JSON logs
}
```

For tests, disable console to reduce noise:

```typescript
Logger.configure({ level: LogLevel.ERROR, console: false });
```
