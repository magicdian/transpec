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

Always configure logger through project-aware helper:

```typescript
await configureProjectLogger({
  projectPath,
  verbose: options.verbose,
  logFile: options.logFile, // optional override
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
// BAD - ignores .transpec/config.yaml and project defaults
Logger.configure({ level: LogLevel.INFO, console: true });

// GOOD - use shared project-aware setup
await configureProjectLogger({ projectPath, verbose: options.verbose });
const logger = getLogger(LogModules.CLI);
logger.info('Starting');
```

---

## Configuration

Logger is configured via `Logger.configure()`:

```typescript
interface LoggerConfig {
  level: LogLevel;  // Minimum level to output
  console?: boolean;
  file?: {
    enabled: boolean;
    path?: string;
    maxSize?: number; // bytes
    maxFiles?: number;
  };
  moduleLevels?: Record<string, LogLevel>;
}
```

For tests, disable console to reduce noise:

```typescript
Logger.configure({ level: LogLevel.ERROR, console: false });
```

---

## Scenario: Project Log Persistence for CLI Runtime

### 1. Scope / Trigger
- Trigger: CLI command logging now depends on `.transpec/config.yaml` and file persistence under `.transpec/logs/`.
- This is infra-level because it changes runtime behavior across `init`, `convert`, `apply`, `detect`, and `preprocess`.

### 2. Signatures

```typescript
interface ConfigureProjectLoggerOptions {
  projectPath: string;
  verbose?: boolean;
  logFile?: string;
  enableFileLoggingByDefault?: boolean;
}

async function configureProjectLogger(
  options: ConfigureProjectLoggerOptions,
): Promise<void>;

class Logger {
  static configure(config: Partial<LoggerConfig>): void;
  static getConfig(): LoggerConfig;
  static reset(): void;
}
```

### 3. Contracts

Config contract in `.transpec/config.yaml`:

```yaml
logging:
  level: info
  console: true
  file:
    enabled: true
    path: .transpec/logs/transpec.log
    maxSize: 10485760
    maxFiles: 5
```

Behavior contract:
- `transpec init` must write the logging section above with file logging enabled by default.
- Commands must call `configureProjectLogger(...)` instead of directly using `Logger.configure(...)`.
- If `--log-file` is passed, file logging is forced on and uses that path.
- If file path is relative, it resolves against project root.
- Logger file writer must create parent directories and append JSON log entries line-by-line.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| `.transpec/config.yaml` missing | Continue with defaults; no throw for missing file |
| `logging.level` unknown | Fallback to `INFO` |
| `verbose=true` and config level is `WARN/ERROR` | Effective level becomes `DEBUG` |
| `logging.file.enabled=false` with explicit `path` | File logging stays disabled |
| Legacy `enabled=false` without `path` in project | File logging still enabled at default project path |
| Log file write fails | Write one stderr warning and continue command flow |

### 5. Good / Base / Bad Cases

- Good:
  - Initialized project (`.transpec` exists), run command, `.transpec/logs/transpec.log` is created, includes `INFO/WARN/ERROR`.
- Base:
  - Non-initialized directory, command still runs with console logging and no file requirement.
- Bad:
  - Command directly calls `Logger.configure(...)` and bypasses project config/file defaults.

### 6. Tests Required

- `src/cli/utils/logging.test.ts`
  - Assert legacy `enabled: false` without explicit path still resolves to project log file path and enables file logging.
  - Assert explicit `enabled: false` + explicit `path` keeps file logging disabled.
- `src/core/logging/logger.test.ts`
  - Assert logger created before `Logger.configure(...)` still writes to file after configure.
  - Assert configured `TRACE` level is persisted to log file.

### 7. Wrong vs Correct

#### Wrong

```typescript
// In command handler
Logger.configure({
  level: options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
  console: true,
});
```

#### Correct

```typescript
await configureProjectLogger({
  projectPath,
  verbose: options.verbose,
  logFile: options.logFile,
});
```
