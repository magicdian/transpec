/**
 * OpenSpec Framework Adapter
 *
 * Parses OpenSpec format to Core IR and emits Core IR to OpenSpec format.
 *
 * OpenSpec Structure:
 * - openspec/
 *   ├── config.yaml
 *   ├── specs/
 *   │   └── {capability}/
 *   │       └── spec.md
 *   └── changes/
 *       ├── {date}-{feature}/
 *       │   ├── proposal.md
 *       │   ├── design.md
 *       │   ├── tasks.md
 *       │   ├── specs/
 *       │   │   └── {capability}/
 *       │   │       └── spec.md
 *       │   └── verification.md
 *       └── archive/
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseFrameworkAdapter, FrameworkDetails } from '../base-adapter.js';
import { CoreEntity, CoreType, FrameworkType } from '../../ir/types.js';
import { getLogger, LogModules } from '../../logging/index.js';

const logger = getLogger(LogModules.ADAPTER);

export class OpenSpecAdapter extends BaseFrameworkAdapter {
  readonly framework: FrameworkType = 'openspec';
  readonly coreTypes: CoreType[] = [CoreType.DOCUMENT];
  readonly supportedExtendedTypes = ['change', 'spec'];

  private readonly markers = [
    'openspec/config.yaml',
    'openspec/specs/',
    'openspec/changes/'
  ];

  async detect(projectPath: string): Promise<boolean> {
    for (const marker of this.markers) {
      const fullPath = path.join(projectPath, marker);
      try {
        await fs.access(fullPath);
        logger.debug('OpenSpec marker found', { path: fullPath });
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  async getDetails(projectPath: string): Promise<FrameworkDetails> {
    const openspecPath = path.join(projectPath, 'openspec');
    let specCount = 0;
    let changeCount = 0;

    try {
      const specsPath = path.join(openspecPath, 'specs');
      const specDirs = await fs.readdir(specsPath).catch(() => []);
      specCount = specDirs.length;
      logger.debug('Specs count', { count: specCount });

      const changesPath = path.join(openspecPath, 'changes');
      const changeDirs = await fs.readdir(changesPath).catch(() => []);
      changeCount = changeDirs.filter(d => d !== 'archive').length;
      logger.debug('Changes count', { count: changeCount });
    } catch (error) {
      logger.warn('Error getting OpenSpec details', { error });
    }

    return {
      framework: 'openspec',
      path: openspecPath,
      entityCount: specCount + changeCount,
      additionalInfo: { specCount, changeCount }
    };
  }

  async parseFile(filePath: string): Promise<CoreEntity> {
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(process.cwd(), filePath);

    logger.debug('Parsing OpenSpec file', { path: filePath, relativePath });

    const isChange = relativePath.includes('/changes/') || relativePath.includes('\\changes\\');
    const extendedType = isChange ? 'change' : 'spec';
    const name = this.extractName(filePath);
    const now = new Date().toISOString();

    // Parse metadata from content
    const metadata = this.parseMetadata(content, extendedType, filePath);

    return {
      id: this.generateId(`openspec-${extendedType}`),
      name,
      coreType: CoreType.DOCUMENT,
      extendedType,
      content,
      metadata,
      sourceFramework: 'openspec',
      sourcePath: filePath,
      createdAt: (metadata.createdAt as string) || now,
      updatedAt: now
    };
  }

  async parseAll(projectPath: string): Promise<CoreEntity[]> {
    const entities: CoreEntity[] = [];
    const openspecPath = path.join(projectPath, 'openspec');

    logger.info('Parsing all OpenSpec entities', { path: openspecPath });

    // Parse specs
    const specsPath = path.join(openspecPath, 'specs');
    try {
      const specDirs = await fs.readdir(specsPath);
      logger.debug('Found spec directories', { count: specDirs.length });

      for (const dir of specDirs) {
        // Skip hidden files/directories (like .DS_Store)
        if (dir.startsWith('.')) {
          logger.debug('Skipping hidden directory', { dir });
          continue;
        }

        const specFile = path.join(specsPath, dir, 'spec.md');
        try {
          const entity = await this.parseFile(specFile);
          entities.push(entity);
          logger.debug('Parsed spec', { name: entity.name, id: entity.id });
        } catch (error) {
          logger.warn('Failed to parse spec file', { file: specFile, error });
        }
      }
    } catch (error) {
      logger.warn('Specs directory not found', { path: specsPath });
    }

    // Parse changes (including archive for migration purposes)
    const changesPath = path.join(openspecPath, 'changes');
    try {
      const changeDirs = await fs.readdir(changesPath);
      logger.debug('Found change directories', { count: changeDirs.length });

      for (const dir of changeDirs) {
        // Skip hidden directories only (archive is migrated as historical record)
        if (dir.startsWith('.')) {
          logger.debug('Skipping hidden directory', { dir });
          continue;
        }

        const changeDir = path.join(changesPath, dir);
        const stat = await fs.stat(changeDir);

        if (!stat.isDirectory()) continue;

        // If this is the archive directory, walk its subdirectories
        if (dir === 'archive') {
          await this.parseArchiveDirectory(changeDir, entities);
        } else {
          // Parse single change directory
          await this.parseChangeDirectory(changeDir, entities);
        }
      }
    } catch (error) {
      logger.warn('Changes directory not found', { path: changesPath });
    }

    logger.info('OpenSpec parsing complete', { entities: entities.length });
    return entities;
  }

  private async parseChangeDirectory(changeDir: string, entities: CoreEntity[]): Promise<void> {
    const proposalFile = path.join(changeDir, 'proposal.md');
    const tasksFile = path.join(changeDir, 'tasks.md');
    const designFile = path.join(changeDir, 'design.md');

    try {
      const entity = await this.parseFile(proposalFile);
      entity.metadata.isArchived = false;

      // Parse tasks.md if exists and attach subtasks
      try {
        const { subtasks } = await this.parseTasksFile(tasksFile);
        entity.metadata.subtasks = subtasks;
        logger.debug('Parsed tasks', { name: entity.name, tasks: subtasks.length });
      } catch {
        logger.debug('No tasks.md found', { changeDir });
      }

      // Parse design.md content if exists
      try {
        const designContent = await fs.readFile(designFile, 'utf-8');
        entity.metadata.designContent = designContent;
      } catch {
        logger.debug('No design.md found', { changeDir });
      }

      entities.push(entity);
      logger.debug('Parsed change', { name: entity.name, id: entity.id });
    } catch (error) {
      logger.warn('Failed to parse change proposal', { file: proposalFile, error: (error as Error).message });
    }
  }

  private async parseArchiveDirectory(archiveDir: string, entities: CoreEntity[]): Promise<void> {
    const archivedDirs = await fs.readdir(archiveDir);
    logger.debug('Found archived change directories', { count: archivedDirs.length });

    for (const dir of archivedDirs) {
      if (dir.startsWith('.')) continue;

      const changeDir = path.join(archiveDir, dir);
      const stat = await fs.stat(changeDir);

      if (!stat.isDirectory()) continue;

      const proposalFile = path.join(changeDir, 'proposal.md');
      const tasksFile = path.join(changeDir, 'tasks.md');
      const designFile = path.join(changeDir, 'design.md');

      try {
        const entity = await this.parseFile(proposalFile);
        entity.metadata.isArchived = true;
        entity.metadata.archivedAt = stat.mtime.toISOString();

        // Parse tasks.md if exists and attach subtasks
        try {
          const { subtasks } = await this.parseTasksFile(tasksFile);
          entity.metadata.subtasks = subtasks;
          logger.debug('Parsed archived tasks', { name: entity.name, tasks: subtasks.length });
        } catch {
          logger.debug('No tasks.md found in archive', { changeDir });
        }

        // Parse design.md content if exists
        try {
          const designContent = await fs.readFile(designFile, 'utf-8');
          entity.metadata.designContent = designContent;
        } catch {
          logger.debug('No design.md found in archive', { changeDir });
        }

        entities.push(entity);
        logger.debug('Parsed archived change', { name: entity.name, id: entity.id });
      } catch (error) {
        logger.warn('Failed to parse archived change proposal', { file: proposalFile, error: (error as Error).message });
      }
    }
  }

  async emit(entity: CoreEntity, targetPath: string): Promise<void> {
    logger.debug('Emitting OpenSpec entity', { name: entity.name, type: entity.extendedType });

    const dir = entity.extendedType === 'change'
      ? path.join(targetPath, 'openspec', 'changes', this.slugify(entity.name))
      : path.join(targetPath, 'openspec', 'specs', this.slugify(entity.name));

    await fs.mkdir(dir, { recursive: true });

    const fileName = entity.extendedType === 'change' ? 'proposal.md' : 'spec.md';
    const filePath = path.join(dir, fileName);

    await fs.writeFile(filePath, entity.content);
    logger.debug('Emitted file', { path: filePath });

    // If this is a change, also create tasks.md and design.md from metadata if available
    if (entity.extendedType === 'change' && entity.metadata.tasks) {
      await fs.writeFile(path.join(dir, 'tasks.md'), entity.metadata.tasks as string);
    }
    if (entity.extendedType === 'change' && entity.metadata.design) {
      await fs.writeFile(path.join(dir, 'design.md'), entity.metadata.design as string);
    }
  }

  getFilePatterns(): string[] {
    return [
      'openspec/specs/*/spec.md',
      'openspec/changes/*/proposal.md'
    ];
  }

  protected getTypeMapping(): Record<string, CoreType> {
    return {
      'change': CoreType.DOCUMENT,
      'spec': CoreType.DOCUMENT
    };
  }

  protected getReverseTypeMapping(): Record<CoreType, string[]> {
    return {
      [CoreType.DOCUMENT]: ['change', 'spec'],
      [CoreType.WORKFLOW]: []
    };
  }

  /**
   * Parse tasks.md file and extract subtasks from checkbox items
   */
  async parseTasksFile(filePath: string): Promise<{ subtasks: Array<{ name: string; status: string }> }> {
    const content = await fs.readFile(filePath, 'utf-8');
    const subtasks: Array<{ name: string; status: string }> = [];

    // Match checkbox items like "- [x] 1.1 Task description" or "- [ ] 2.1 Task description"
    const checkboxRegex = /- \[([ x])\] (\d+\.\d+(?:\.\d+)?)?\s*(.+)/g;
    let match;

    while ((match = checkboxRegex.exec(content)) !== null) {
      const status = match[1] === 'x' ? 'completed' : 'pending';
      const number = match[2] || '';
      const description = match[3].trim();

      subtasks.push({
        name: number ? `${number} ${description}` : description,
        status,
      });
    }

    logger.debug('Parsed tasks.md', { filePath, subtasks: subtasks.length });
    return { subtasks };
  }

  private parseMetadata(content: string, extendedType: string, filePath: string): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      originalPath: filePath,
    };

    // Extract frontmatter if present
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (frontmatterMatch) {
      try {
        // Simple YAML parsing for frontmatter
        const frontmatter = frontmatterMatch[1];
        const lines = frontmatter.split('\n');
        for (const line of lines) {
          const match = line.match(/^(\w+):\s*(.+)$/);
          if (match) {
            metadata[match[1]] = match[2].replace(/["']/g, '');
          }
        }
      } catch (error) {
        logger.warn('Failed to parse frontmatter', { file: filePath });
      }
    }

    // Extract section headers for changes
    if (extendedType === 'change') {
      const sections = this.extractSections(content);
      metadata.sections = Object.keys(sections);

      // Look for requirements
      const addedReqs = content.match(/## ADDED Requirements\n([\s\S]*?)(?=## |$)/g);
      const modifiedReqs = content.match(/## MODIFIED Requirements\n([\s\S]*?)(?=## |$)/g);

      metadata.requirementCount = {
        added: addedReqs ? (addedReqs[0].match(/### Requirement:/g) || []).length : 0,
        modified: modifiedReqs ? (modifiedReqs[0].match(/### Requirement:/g) || []).length : 0,
      };
    }

    // Extract date from path for changes
    if (extendedType === 'change') {
      const dateMatch = filePath.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        metadata.date = dateMatch[1];
      }
    }

    return metadata;
  }

  private extractSections(content: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const lines = content.split('\n');
    let currentSection = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        if (currentSection) {
          sections[currentSection] = currentContent.join('\n').trim();
        }
        currentSection = headerMatch[2];
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    if (currentSection) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return sections;
  }

  private extractName(filePath: string): string {
    const parts = filePath.split(/[/\\]/);
    const dirName = parts[parts.length - 2] || parts[parts.length - 1];
    return dirName
      .replace(/^\d{4}-\d{2}-\d{2}-/, '') // Remove date prefix for changes
      .replace(/-/g, ' ')
      .replace(/_/g, ' ');
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
