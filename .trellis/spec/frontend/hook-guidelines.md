# Hook Guidelines

> How hooks are used in this project.

---

## Overview

**This is a CLI tool - there are NO React hooks or similar patterns.**

This document explains why and what patterns are used instead.

---

## Why No Hooks?

Hooks are a React concept for managing component state and side effects. This project:
- Is a Node.js CLI tool
- Has no React or UI framework
- Uses synchronous/asynchronous TypeScript functions directly

---

## What IS There Instead?

### Core Layer: Direct Function Calls

Instead of hooks, core logic is called directly:

```typescript
// Core engine - called directly, no hooks
const engine = new ConversionEngine(options, dbPath);
await engine.initialize();
const result = await engine.run();
```

### CLI Layer: Sequential Commands

CLI commands execute sequentially (no state between runs):

```typescript
// CLI command is just a function
export async function convertCommand(options: ConvertOptions) {
  const result = await engine.run();
  return result;
}
```

### Logging: Custom Logger Hook

The only "hook-like" pattern is the custom logger which uses module-level loggers:

```typescript
// In each module - get a logger instance
const logger = getLogger(LogModules.ENGINE);

// Use it like a hook
logger.info('Phase started');
logger.debug('Processing', { count: items.length });
logger.error('Failed', { error: message });
```

---

## Framework Adapter Pattern

The closest thing to "hooks" is the `FrameworkAdapter` interface that framework adapters implement:

```typescript
// packages/cli/src/core/framework/base-adapter.ts

export interface FrameworkAdapter {
  readonly framework: FrameworkType;

  // These are like lifecycle hooks
  detect(projectPath: string): Promise<boolean>;
  parseFile(filePath: string): Promise<CoreEntity>;
  parseAll(projectPath: string): Promise<CoreEntity[]>;
  emit(entity: CoreEntity, targetPath: string): Promise<void>;
}
```

Each framework (Trellis, OpenSpec, etc.) implements these methods to integrate with the conversion engine.

---

## If You Need React Patterns

This is the wrong project. Go build a React app if you need:
- `useState` → Just use variables
- `useEffect` → Use async/await
- Custom hooks → Extract to functions/classes

---

## What NOT to Do

1. **Don't create React hooks** - there's no React
2. **Don't use useState/useEffect** - no React runtime
3. **Don't create custom hook patterns** - unnecessary abstraction

If you're adding conversion logic, just write functions and classes in `src/core/`.

---

## Summary

| React Hook | This Project |
|-----------|--------------|
| `useState` | Variable assignment |
| `useEffect` | async/await |
| `useCallback` | Regular function |
| `useMemo` | Computed variable |
| Custom hook | Plain function/class |
