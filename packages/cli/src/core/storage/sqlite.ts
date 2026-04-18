/**
 * SQLite Storage Manager
 *
 * SQLite schema is FIXED - new frameworks don't require schema changes.
 * Framework-specific data is stored as JSON blobs in the metadata column.
 */

import Database from 'better-sqlite3';
import { CoreEntity, CoreRelation, IRDocument, IRMetadata, CoreType } from '../ir/types.js';

export class SQLiteStorage {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        core_type TEXT NOT NULL CHECK(core_type IN ('DOCUMENT', 'WORKFLOW')),
        extended_type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL,
        source_framework TEXT NOT NULL,
        source_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS relations (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        metadata TEXT,
        FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ir_documents (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        source_framework TEXT NOT NULL,
        target_framework TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversion_logs (
        id TEXT PRIMARY KEY,
        conversion_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        level TEXT NOT NULL CHECK(level IN ('info', 'warning', 'error')),
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(core_type);
      CREATE INDEX IF NOT EXISTS idx_entities_extended_type ON entities(extended_type);
      CREATE INDEX IF NOT EXISTS idx_entities_framework ON entities(source_framework);
      CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id);
      CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_id);
      CREATE INDEX IF NOT EXISTS idx_conversion_logs ON conversion_logs(conversion_id);
    `);
  }

  saveEntity(entity: CoreEntity): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO entities
        (id, name, core_type, extended_type, content, metadata, source_framework, source_path, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entity.id,
      entity.name,
      entity.coreType,
      entity.extendedType,
      entity.content,
      JSON.stringify(entity.metadata),
      entity.sourceFramework,
      entity.sourcePath,
      entity.createdAt,
      entity.updatedAt
    );
  }

  saveEntities(entities: CoreEntity[]): void {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO entities
        (id, name, core_type, extended_type, content, metadata, source_framework, source_path, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((items: CoreEntity[]) => {
      for (const entity of items) {
        insert.run(
          entity.id,
          entity.name,
          entity.coreType,
          entity.extendedType,
          entity.content,
          JSON.stringify(entity.metadata),
          entity.sourceFramework,
          entity.sourcePath,
          entity.createdAt,
          entity.updatedAt
        );
      }
    });

    transaction(entities);
  }

  saveRelation(relation: CoreRelation): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO relations (id, source_id, target_id, relation_type, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      relation.id,
      relation.sourceId,
      relation.targetId,
      relation.relationType,
      relation.metadata ? JSON.stringify(relation.metadata) : null
    );
  }

  saveRelations(relations: CoreRelation[]): void {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO relations (id, source_id, target_id, relation_type, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((items: CoreRelation[]) => {
      for (const rel of items) {
        insert.run(
          rel.id,
          rel.sourceId,
          rel.targetId,
          rel.relationType,
          rel.metadata ? JSON.stringify(rel.metadata) : null
        );
      }
    });

    transaction(relations);
  }

  saveIRDocument(ir: IRDocument): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ir_documents (id, version, source_framework, target_framework, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      ir.id,
      ir.version,
      ir.sourceFramework,
      ir.targetFramework,
      new Date().toISOString(),
      JSON.stringify(ir.metadata)
    );
  }

  loadEntity(id: string): CoreEntity | null {
    const row = this.db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToEntity(row);
  }

  loadAllEntities(): CoreEntity[] {
    const rows = this.db.prepare('SELECT * FROM entities').all() as any[];
    return rows.map(row => this.rowToEntity(row));
  }

  loadEntitiesByFramework(framework: string): CoreEntity[] {
    const rows = this.db.prepare('SELECT * FROM entities WHERE source_framework = ?').all(framework) as any[];
    return rows.map(row => this.rowToEntity(row));
  }

  loadEntitiesByExtendedType(extendedType: string): CoreEntity[] {
    const rows = this.db.prepare('SELECT * FROM entities WHERE extended_type = ?').all(extendedType) as any[];
    return rows.map(row => this.rowToEntity(row));
  }

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

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.rowToRelation(row));
  }

  loadIRDocument(id: string): IRDocument | null {
    const row = this.db.prepare('SELECT * FROM ir_documents WHERE id = ?').get(id) as any;
    if (!row) return null;

    const entities = this.loadAllEntities().filter(e => {
      const irMeta = JSON.parse(row.metadata);
      return true;
    });

    return {
      id: row.id,
      version: row.version,
      sourceFramework: row.source_framework,
      targetFramework: row.target_framework,
      entities,
      relations: this.loadRelations(),
      metadata: JSON.parse(row.metadata)
    };
  }

  log(conversionId: string, phase: string, level: 'info' | 'warning' | 'error', message: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO conversion_logs (id, conversion_id, phase, level, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversionId,
      phase,
      level,
      message,
      new Date().toISOString()
    );
  }

  private rowToEntity(row: any): CoreEntity {
    return {
      id: row.id,
      name: row.name,
      coreType: row.core_type as CoreType,
      extendedType: row.extended_type,
      content: row.content,
      metadata: JSON.parse(row.metadata),
      sourceFramework: row.source_framework,
      sourcePath: row.source_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private rowToRelation(row: any): CoreRelation {
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      relationType: row.relation_type,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  close(): void {
    this.db.close();
  }
}
