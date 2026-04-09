# Database Guidelines

> SQLite storage patterns in this project.

---

## Overview

This project uses **SQLite** via `better-sqlite3` for:
- Storing Core IR entities during conversion
- Tracking conversion history and logs
- Caching parsed framework data

The schema is **intentionally simple** and **framework-agnostic**:
- Framework-specific data is stored as JSON blobs
- Adding new frameworks does NOT require schema changes

---

## Schema Design

### Core Principle: Fixed Schema, Flexible Metadata

```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  core_type TEXT NOT NULL CHECK(core_type IN ('DOCUMENT', 'WORKFLOW')),
  extended_type TEXT NOT NULL,        -- Framework-specific type (e.g., 'task', 'spec')
  content TEXT NOT NULL,                -- Full content as string
  metadata TEXT NOT NULL,               -- JSON blob for framework-specific data
  source_framework TEXT NOT NULL,
  source_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Why this works**:
- `core_type` is the stable ABI (like LLVM IR)
- `extended_type` captures framework-specific concepts as strings
- `metadata` JSON column stores anything framework-specific without schema changes

---

## Database Path

Database is stored in project-local `.transpec/ir/` directory:

```typescript
const irPath = path.join(projectPath, '.transpec', 'ir');
await fs.mkdir(irPath, { recursive: true });
const dbPath = path.join(irPath, `conversion-${Date.now()}.db`);
```

Each conversion gets a timestamped database file (not a single shared DB).

---

## Transaction Patterns

### Batch Inserts - ALWAYS use transactions

```typescript
// GOOD - fast and atomic
saveEntities(entities: CoreEntity[]): void {
  const insert = this.db.prepare(`INSERT INTO entities ...`);
  const transaction = this.db.transaction((items) => {
    for (const entity of items) {
      insert.run(entity.id, entity.name, /* ... */);
    }
  });
  transaction(entities);
}

// BAD - slow and not atomic per batch
saveEntities(entities: CoreEntity[]): void {
  for (const entity of entities) {
    this.db.prepare(`INSERT INTO entities ...`).run(/* ... */);
  }
}
```

### Single Operations - direct execution is fine

```typescript
// Simple case - no transaction needed
saveEntity(entity: CoreEntity): void {
  const stmt = this.db.prepare(`INSERT OR REPLACE INTO entities ...`);
  stmt.run(entity.id, entity.name, /* ... */);
}
```

---

## Query Patterns

### Parameterized Queries - ALWAYS

```typescript
// GOOD - safe from SQL injection
const rows = this.db.prepare('SELECT * FROM entities WHERE source_framework = ?')
  .all(framework);

// BAD - SQL injection vulnerability
const rows = this.db.prepare(`SELECT * FROM entities WHERE source_framework = '${framework}'`)
  .all();
```

### Dynamic Queries - build safely

```typescript
loadRelations(sourceId?: string, targetId?: string): CoreRelation[] {
  let sql = 'SELECT * FROM relations WHERE 1=1';
  const params: string[] = [];

  if (sourceId) {
    sql += ' AND source_id = ?';
    params.push(sourceId);
  }
  if (targetId) {
    sql += ' AND target_id = ?';
    params.push(targetId);
  }

  const rows = this.db.prepare(sql).all(...params);
  return rows.map(row => this.rowToRelation(row));
}
```

---

## Type Mapping

### JavaScript → SQLite

```typescript
// Entity fields to SQL
stmt.run(
  entity.id,
  entity.name,
  entity.coreType,              // enum → string
  entity.extendedType,
  entity.content,
  JSON.stringify(entity.metadata),  // object → JSON string
  entity.sourceFramework,
  entity.sourcePath,
  entity.createdAt,
  entity.updatedAt
);
```

### SQLite → JavaScript

```typescript
// Row to Entity
private rowToEntity(row: any): CoreEntity {
  return {
    id: row.id,
    name: row.name,
    coreType: row.core_type as CoreType,  // string → enum
    extendedType: row.extended_type,
    content: row.content,
    metadata: JSON.parse(row.metadata),    // JSON string → object
    sourceFramework: row.source_framework,
    sourcePath: row.source_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
```

---

## Indexes

```sql
-- Entity lookups
CREATE INDEX idx_entities_type ON entities(core_type);
CREATE INDEX idx_entities_extended_type ON entities(extended_type);
CREATE INDEX idx_entities_framework ON entities(source_framework);

-- Relation lookups (for graph traversal)
CREATE INDEX idx_relations_source ON relations(source_id);
CREATE INDEX idx_relations_target ON relations(target_id);

-- Log queries
CREATE INDEX idx_conversion_logs ON conversion_logs(conversion_id);
```

Indexes are created `IF NOT EXISTS` so repeated initialization is safe.

---

## Forbidden Patterns

### 1. No ORM - raw SQL only

This project doesn't use TypeORM, Prisma, or similar. Direct `better-sqlite3` only.

### 2. No migrations - fixed schema

Schema is created with `CREATE TABLE IF NOT EXISTS`. No migration system.

### 3. No CROSS JOINs on large tables

Always filter before joining.

---

## Common Mistakes

### 1. Forgetting to close the database

```typescript
// GOOD - always close
try {
  // use database
} finally {
  this.db.close();
}

// Or in ConversionEngine
finally {
  this.storage.close();
}
```

### 2. Storing non-string in TEXT column

```typescript
// BAD - objects go in metadata as JSON
stmt.run(JSON.stringify({ array: [1, 2, 3] })); // Wrong column!

// GOOD - content is always string
stmt.run(content); // If content is object, stringify before storing
```

### 3. Not using transactions for batch inserts

```typescript
// BAD - 1000 entities = 1000 commits
for (const entity of entities) {
  insert.run(entity);
}

// GOOD - 1000 entities = 1 commit
const transaction = this.db.transaction((items) => {
  for (const item of items) insert.run(item);
});
transaction(entities);
```
