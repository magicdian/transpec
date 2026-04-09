/**
 * Trellis Framework Adapter
 *
 * Parses Trellis format to Core IR and emits Core IR to Trellis format.
 *
 * Trellis Structure:
 * - .trellis/
 *   ├── config.yaml
 *   ├── spec/
 *   │   ├── backend/
 *   │   │   ├── index.md
 *   │   │   └── *.md
 *   │   ├── frontend/
 *   │   │   └── *.md
 *   │   └── guides/
 *   │       └── *.md
 *   ├── tasks/
 *   │   └── {MM-DD-slug-assignee}/
 *   │       ├── task.json
 *   │       ├── prd.md
 *   │       ├── implement.jsonl
 *   │       └── check.jsonl
 *   └── workspace/
 *       └── {developer}/
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseFrameworkAdapter, FrameworkDetails } from '../base-adapter.js';
import { CoreEntity, CoreType, FrameworkType } from '../../ir/types.js';
import { getLogger, LogModules } from '../../logging/index.js';

const logger = getLogger(LogModules.ADAPTER);

export class TrellisAdapter extends BaseFrameworkAdapter {
  readonly framework: FrameworkType = 'trellis';
  readonly coreTypes: CoreType[] = [CoreType.DOCUMENT, CoreType.WORKFLOW];
  readonly supportedExtendedTypes = ['spec', 'task'];

  private readonly markers = [
    '.trellis/config.yaml',
    '.trellis/tasks/',
    '.trellis/spec/'
  ];

  async detect(projectPath: string): Promise<boolean> {
    for (const marker of this.markers) {
      const fullPath = path.join(projectPath, marker);
      try {
        await fs.access(fullPath);
        logger.debug('Trellis marker found', { path: fullPath });
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  async getDetails(projectPath: string): Promise<FrameworkDetails> {
    const trellisPath = path.join(projectPath, '.trellis');
    let specCount = 0;
    let taskCount = 0;

    try {
      const specsPath = path.join(trellisPath, 'spec');
      specCount = await this.countFiles(specsPath, '.md');
      logger.debug('Spec files count', { count: specCount });

      const tasksPath = path.join(trellisPath, 'tasks');
      taskCount = await this.countDirectories(tasksPath);
      logger.debug('Task directories count', { count: taskCount });
    } catch (error) {
      logger.warn('Error getting Trellis details', { error });
    }

    return {
      framework: 'trellis',
      version: await this.getVersion(trellisPath),
      path: trellisPath,
      entityCount: specCount + taskCount,
      additionalInfo: { specCount, taskCount }
    };
  }

  async parseFile(filePath: string): Promise<CoreEntity> {
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(process.cwd(), filePath);

    logger.debug('Parsing Trellis file', { path: filePath, relativePath });

    const isTask = relativePath.includes('/tasks/') || relativePath.includes('\\tasks\\');
    const extendedType = isTask ? 'task' : 'spec';
    const name = this.extractName(filePath);
    const now = new Date().toISOString();

    const metadata = this.parseMetadata(content, extendedType, filePath);

    return {
      id: this.generateId(`trellis-${extendedType}`),
      name,
      coreType: isTask ? CoreType.WORKFLOW : CoreType.DOCUMENT,
      extendedType,
      content,
      metadata,
      sourceFramework: 'trellis',
      sourcePath: filePath,
      createdAt: (metadata.createdAt as string) || now,
      updatedAt: now
    };
  }

  async parseAll(projectPath: string): Promise<CoreEntity[]> {
    const entities: CoreEntity[] = [];
    const trellisPath = path.join(projectPath, '.trellis');

    logger.info('Parsing all Trellis entities', { path: trellisPath });

    // Parse specs
    const specsPath = path.join(trellisPath, 'spec');
    try {
      const specEntities = await this.parseSpecDirectory(specsPath);
      entities.push(...specEntities);
    } catch (error) {
      logger.warn('Spec directory not found', { path: specsPath });
    }

    // Parse tasks
    const tasksPath = path.join(trellisPath, 'tasks');
    try {
      const taskDirs = await fs.readdir(tasksPath);
      logger.debug('Found task directories', { count: taskDirs.length });

      for (const dir of taskDirs) {
        const taskDir = path.join(tasksPath, dir);
        const stat = await fs.stat(taskDir);
        if (!stat.isDirectory()) continue;

        // Parse prd.md if exists
        const prdFile = path.join(taskDir, 'prd.md');
        try {
          const entity = await this.parseFile(prdFile);
          entities.push(entity);
          logger.debug('Parsed task', { name: entity.name, id: entity.id });
        } catch (error) {
          logger.warn('Failed to parse task prd', { file: prdFile });
        }

        // Also parse task.json for metadata
        const taskJsonFile = path.join(taskDir, 'task.json');
        try {
          const taskJson = await fs.readFile(taskJsonFile, 'utf-8');
          const taskData = JSON.parse(taskJson);
          // Attach task.json data to the last entity's metadata
          const lastEntity = entities[entities.length - 1];
          if (lastEntity && lastEntity.extendedType === 'task') {
            lastEntity.metadata.taskJson = taskData;
          }
        } catch {
          // task.json might not exist
        }
      }
    } catch (error) {
      logger.warn('Tasks directory not found', { path: tasksPath });
    }

    logger.info('Trellis parsing complete', { entities: entities.length });
    return entities;
  }

  async emit(entity: CoreEntity, targetPath: string): Promise<void> {
    logger.debug('Emitting Trellis entity', { name: entity.name, type: entity.extendedType });

    const isTask = entity.extendedType === 'task';

    if (isTask) {
      // Emit task to .trellis/tasks/
      const baseDir = path.join(targetPath, '.trellis', 'tasks', this.slugify(entity.name));
      await fs.mkdir(baseDir, { recursive: true });

      // Emit prd.md (proposal content)
      const prdPath = path.join(baseDir, 'prd.md');
      await fs.writeFile(prdPath, entity.content);
      logger.debug('Emitted prd.md', { path: prdPath });

      // Create task.json with proper structure including subtasks
      const subtasks = entity.metadata.subtasks as Array<{ name: string; status: string }> | undefined;
      const date = entity.metadata.date as string | undefined;

      // Generate task ID with date prefix if available
      const datePrefix = date ? date.replace(/-/g, '') + '-' : '';
      const taskId = this.slugify(datePrefix + entity.name);

      const taskJson = {
        id: taskId,
        name: taskId,
        title: entity.name,
        description: this.extractDescription(entity.content),
        status: this.determineStatus(subtasks),
        priority: 'P2',
        createdAt: entity.createdAt,
        completedAt: subtasks?.every(t => t.status === 'completed') ? new Date().toISOString() : null,
        subtasks: subtasks?.map((t, idx) => ({
          id: `${idx + 1}`,
          name: t.name,
          status: t.status,
        })) || [],
        children: [],
        parent: null,
        relatedFiles: entity.metadata.relatedFiles || [],
        notes: `Converted from OpenSpec change: ${entity.sourcePath}`,
        meta: {
          convertedFrom: 'openspec',
          originalExtendedType: entity.extendedType,
        },
      };

      await fs.writeFile(path.join(baseDir, 'task.json'), JSON.stringify(taskJson, null, 2));
      logger.debug('Emitted task.json', { path: baseDir, subtasks: subtasks?.length || 0 });

      // Optionally emit design.md if available
      if (entity.metadata.designContent) {
        await fs.writeFile(path.join(baseDir, 'design.md'), entity.metadata.designContent as string);
        logger.debug('Emitted design.md', { path: baseDir });
      }
    } else {
      // For spec entities, emit to legacy/specs/ since OpenSpec specs
      // are feature specifications, not Trellis development guidelines
      const legacyDir = path.join(targetPath, '.trellis', 'legacy', 'specs', this.slugify(entity.name));
      await fs.mkdir(legacyDir, { recursive: true });

      const specPath = path.join(legacyDir, 'spec.md');
      await fs.writeFile(specPath, entity.content);
      logger.debug('Emitted spec to legacy location', { path: specPath });
    }
  }

  getFilePatterns(): string[] {
    return [
      '.trellis/spec/**/*.md',
      '.trellis/tasks/*/prd.md'
    ];
  }

  protected getTypeMapping(): Record<string, CoreType> {
    return {
      'spec': CoreType.DOCUMENT,
      'task': CoreType.WORKFLOW
    };
  }

  protected getReverseTypeMapping(): Record<CoreType, string[]> {
    return {
      [CoreType.DOCUMENT]: ['spec'],
      [CoreType.WORKFLOW]: ['task']
    };
  }

  private async parseSpecDirectory(specsPath: string): Promise<CoreEntity[]> {
    const entities: CoreEntity[] = [];

    async function walkDir(dir: string, subPath: string = '') {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
          await walkDir(fullPath, `${subPath}/${entry}`);
        } else if (entry.endsWith('.md') && entry !== 'index.md') {
          const entity = await new TrellisAdapter().parseFile(fullPath);
          entity.name = `${subPath}/${entry}`.replace(/^\//, '').replace(/\.md$/, '');
          entities.push(entity);
        }
      }
    }

    await walkDir(specsPath);
    return entities;
  }

  private async countFiles(dir: string, extension: string): Promise<number> {
    let count = 0;

    async function walk(d: string) {
      try {
        const entries = await fs.readdir(d);
        for (const entry of entries) {
          const fullPath = path.join(d, entry);
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) {
            await walk(fullPath);
          } else if (entry.endsWith(extension)) {
            count++;
          }
        }
      } catch {
        // Ignore
      }
    }

    await walk(dir);
    return count;
  }

  private async countDirectories(dir: string): Promise<number> {
    try {
      const entries = await fs.readdir(dir);
      let count = 0;
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) count++;
      }
      return count;
    } catch {
      return 0;
    }
  }

  private parseMetadata(content: string, extendedType: string, filePath: string): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      originalPath: filePath,
    };

    // Extract frontmatter if present
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (frontmatterMatch) {
      try {
        const frontmatter = frontmatterMatch[1];
        const lines = frontmatter.split('\n');
        for (const line of lines) {
          const match = line.match(/^(\w+):\s*(.+)$/);
          if (match) {
            let value: string | number | boolean = match[2].replace(/["']/g, '');
            if (value === 'true') value = true;
            if (value === 'false') value = false;
            if (!isNaN(Number(value))) value = Number(value);
            metadata[match[1]] = value;
          }
        }
      } catch (error) {
        logger.warn('Failed to parse frontmatter', { file: filePath });
      }
    }

    // Extract frontmatter from YAML content blocks
    if (extendedType === 'task') {
      // Look for task status, priority, etc.
      const statusMatch = content.match(/Status:\s*(.+)/i);
      const priorityMatch = content.match(/Priority:\s*(.+)/i);
      const assigneeMatch = content.match(/Assignee:\s*(.+)/i);

      if (statusMatch) metadata.status = statusMatch[1].trim();
      if (priorityMatch) metadata.priority = priorityMatch[1].trim();
      if (assigneeMatch) metadata.assignee = assigneeMatch[1].trim();
    }

    return metadata;
  }

  private extractName(filePath: string): string {
    const parts = filePath.split(/[/\\]/);
    const fileName = parts[parts.length - 1];
    const dirName = parts[parts.length - 2];

    // For tasks, use directory name
    if (fileName === 'prd.md') {
      return dirName.replace(/^\d{2}-\d{2}-/, ''); // Remove date prefix
    }

    // For specs, use filename without extension
    return fileName.replace(/\.md$/, '');
  }

  private async getVersion(trellisPath: string): Promise<string | undefined> {
    try {
      const versionFile = path.join(trellisPath, '.version');
      return await fs.readFile(versionFile, 'utf-8');
    } catch {
      return undefined;
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private extractDescription(content: string): string {
    // Extract first paragraph or summary from content
    const lines = content.split('\n');
    const paragraphs: string[] = [];
    let currentParagraph: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentParagraph.length > 0) {
          paragraphs.push(currentParagraph.join(' '));
          currentParagraph = [];
        }
      } else if (!trimmed.startsWith('#') && !trimmed.startsWith('- [') && !trimmed.startsWith('##')) {
        currentParagraph.push(trimmed);
      }
    }

    if (currentParagraph.length > 0) {
      paragraphs.push(currentParagraph.join(' '));
    }

    const description = paragraphs.join(' ').trim();
    return description.length > 200 ? description.substring(0, 197) + '...' : description;
  }

  private determineStatus(subtasks?: Array<{ name: string; status: string }>): string {
    if (!subtasks || subtasks.length === 0) {
      return 'pending';
    }
    const completedCount = subtasks.filter(t => t.status === 'completed').length;
    if (completedCount === 0) {
      return 'pending';
    }
    if (completedCount === subtasks.length) {
      return 'completed';
    }
    return 'in_progress';
  }
}
