import * as fs from 'fs/promises';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLiteStorage } from '../../core/storage/sqlite.js';
import {
  getProjectIrDbPath,
  getProjectPostprocessContextPath,
  getProjectPreprocessContextPath,
} from '../../core/skill/index.js';
import {
  cleanupTempDirs,
  createOpenSpecProject,
  createTempDir,
  createTrellisProject,
  seedEnhancedAnalysis,
  setupTranspecConfig,
} from '../../test/compat-fixtures.js';
import { convertCommand } from './convert.js';
import { preprocessCommand } from './preprocess.js';
import { applyCommand } from './apply.js';

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTempDirs(tempDirs);
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('runtime compatibility flows', () => {
  it.each(['legacy', 'current'] as const)(
    'should run convert/preprocess/apply for OpenSpec %s projects targeting Trellis',
    async variant => {
      const projectPath = await createTempDir(`transpec-openspec-flow-${variant}-`, tempDirs);
      await createOpenSpecProject(projectPath, variant);
      await setupTranspecConfig(projectPath, 'openspec', 'trellis');

      await convertCommand({
        projectPath,
        source: 'openspec',
        target: 'trellis',
        dryRun: true,
      });
      await expect(fs.access(getProjectIrDbPath(projectPath))).rejects.toThrow();

      await preprocessCommand({ projectPath });

      const dbPath = getProjectIrDbPath(projectPath);
      const storage = new SQLiteStorage(dbPath);
      const entities = storage.loadAllEntities();
      storage.close();

      expect(entities).toHaveLength(2);
      expect(JSON.parse(await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8')).entityCount).toBe(2);

      await seedEnhancedAnalysis(projectPath);
      await applyCommand({ projectPath });

      const taskSlug = variant === 'legacy' ? 'legacy-style' : 'compact-style';
      await expect(fs.access(path.join(projectPath, '.trellis', 'tasks', taskSlug, 'prd.md'))).resolves.toBeUndefined();
      await expect(
        fs.access(path.join(projectPath, '.trellis', 'legacy', 'specs', 'capability', 'spec.md')),
      ).resolves.toBeUndefined();

      const postprocessContext = JSON.parse(
        await fs.readFile(getProjectPostprocessContextPath(projectPath), 'utf-8'),
      );
      expect(postprocessContext.postprocessSkill).toBe('.transpec/skills/postprocess/trellis/SKILL.md');
      expect(postprocessContext.entitiesTransformed).toBe(2);
    },
  );

  it.each(['legacy', 'current'] as const)(
    'should run convert/preprocess/apply for Trellis %s projects targeting OpenSpec',
    async variant => {
      const projectPath = await createTempDir(`transpec-trellis-flow-${variant}-`, tempDirs);
      await createTrellisProject(projectPath, variant);
      await setupTranspecConfig(projectPath, 'trellis', 'openspec');

      await convertCommand({
        projectPath,
        source: 'trellis',
        target: 'openspec',
        dryRun: true,
      });
      await expect(fs.access(getProjectIrDbPath(projectPath))).rejects.toThrow();

      await preprocessCommand({ projectPath });
      await seedEnhancedAnalysis(projectPath);
      await applyCommand({ projectPath });

      const changeSlug = variant === 'legacy' ? 'legacy-task' : 'current-task';
      await expect(
        fs.access(path.join(projectPath, 'openspec', 'changes', changeSlug, 'proposal.md')),
      ).resolves.toBeUndefined();
      const specSlug = variant === 'legacy' ? 'backend-error-handling' : 'cli-backend-error-handling';
      await expect(
        fs.access(path.join(projectPath, 'openspec', 'specs', specSlug, 'spec.md')),
      ).resolves.toBeUndefined();

      const preprocessContext = JSON.parse(
        await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8'),
      );
      const postprocessContext = JSON.parse(
        await fs.readFile(getProjectPostprocessContextPath(projectPath), 'utf-8'),
      );

      expect(preprocessContext.preprocessSkill).toBe('.transpec/skills/preprocess/trellis/SKILL.md');
      expect(postprocessContext.postprocessSkill).toBe('.transpec/skills/postprocess/openspec/SKILL.md');
      expect(postprocessContext.entitiesTransformed).toBe(2);
    },
  );
});
