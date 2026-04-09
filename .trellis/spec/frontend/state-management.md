# State Management

> How state is managed in this project.

---

## Overview

**This is a CLI tool - there is NO UI state management.**

This document explains why and how state is handled in this project.

---

## Why No State Management?

State management libraries (Redux, Zustand, React Context) exist to manage **UI state** in web applications. This project:
- Is a Node.js CLI tool
- Executes once and exits
- Has no persistent UI to maintain

State exists only:
1. During command execution (local variables)
2. In the SQLite database (persistent entity storage)

---

## What IS There Instead?

### 1. Local Variables (Execution State)

Commands use local variables:

```typescript
export async function convertCommand(options: ConvertOptions) {
  // Local state - exists only during execution
  let sourceFramework = options.source;
  let targetFramework = options.target;

  // Modify as needed
  if (!sourceFramework) {
    sourceFramework = 'openspec'; // Default
  }

  // Done - state discarded
}
```

### 2. Class Instances (Engine State)

The `ConversionEngine` class maintains state:

```typescript
export class ConversionEngine {
  private entities: CoreEntity[] = [];      // Parsed entities
  private relations: CoreRelation[] = [];   // Extracted relations
  private phaseResults: PhaseResult[] = []; // Phase execution history

  async run(): Promise<ConversionResult> {
    // State modified during execution
    await this.runParsePhase();
    await this.runTransformPhase();
    return this.getResults();
  }
}
```

### 3. SQLite (Persistent State)

Conversion data persists in SQLite:

```typescript
// State saved to database
this.storage.saveEntities(this.entities);
this.storage.saveRelations(this.relations);

// State loaded when needed
const entities = this.storage.loadAllEntities();
```

---

## State Flow

```
CLI Command (src/cli/)
    │
    ▼
Engine.run()
    │
    ├── Parse Phase → entities[]
    ├── Transform Phase → modified entities[]
    ├── Validate Phase → issues[]
    └── Emit Phase → files written
    │
    ▼
SQLite Storage (.transpec/ir/*.db)
```

---

## Framework Adapter State

Each adapter may maintain internal state, but it's encapsulated:

```typescript
export class TrellisAdapter extends BaseFrameworkAdapter {
  private readonly markers = [
    '.trellis/config.yaml',
    '.trellis/tasks/',
    '.trellis/spec/'
  ];

  // No exposed state - all internal
}
```

---

## What NOT to Do

1. **Don't add Redux/Zustand** - no UI to manage
2. **Don't create global state** - prefer dependency injection
3. **Don't persist state in memory** - use SQLite for persistence
4. **Don't share mutable state** between commands

Commands should be stateless - each run starts fresh.

---

## Summary

| Frontend Pattern | This Project |
|-----------------|--------------|
| Redux/Zustand | N/A (CLI) |
| React Context | N/A (CLI) |
| useState | Local variables |
| useRef | Class fields |
| LocalStorage | SQLite |
| SessionStorage | N/A (stateless) |
