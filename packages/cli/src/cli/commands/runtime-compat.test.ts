import * as fs from 'fs/promises';
import * as path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLiteStorage } from '../../core/storage/sqlite.js';
import {
  getProjectEnhancedAnalysisPath,
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
      const preprocessBeforeApply = JSON.parse(
        await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8'),
      );
      expect(preprocessBeforeApply.entityCount).toBe(2);
      expect(preprocessBeforeApply.relationCount).toBeGreaterThan(0);

      await seedEnhancedAnalysis(projectPath);
      await applyCommand({ projectPath });

      const taskSlug = variant === 'legacy' ? 'legacy-style' : 'compact-style';
      const taskDir = path.join(projectPath, '.trellis', 'tasks', `04-15-${taskSlug}`);
      await expect(fs.access(path.join(taskDir, 'prd.md'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(taskDir, 'source-tasks.md'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(taskDir, 'source-manifest.yaml'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(taskDir, 'implement.jsonl'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(taskDir, 'check.jsonl'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(taskDir, 'debug.jsonl'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(projectPath, '.trellis', 'workflow.md'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(projectPath, '.trellis', 'spec', 'backend', 'index.md'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(projectPath, '.trellis', 'spec', 'frontend', 'index.md'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(projectPath, '.trellis', 'spec', 'guides', 'index.md'))).resolves.toBeUndefined();
      await expect(
        fs.access(path.join(projectPath, '.trellis', 'spec', 'guides', 'repository-and-conversion-state.md')),
      ).resolves.toBeUndefined();
      await expect(
        fs.access(path.join(projectPath, '.trellis', 'legacy', 'specs', 'compatibility-flow', 'spec.md')),
      ).resolves.toBeUndefined();
      const backendSpecFiles = await fs.readdir(path.join(projectPath, '.trellis', 'spec', 'backend'));
      expect(backendSpecFiles.some(file => file !== 'index.md')).toBe(true);

      const taskJson = JSON.parse(await fs.readFile(path.join(taskDir, 'task.json'), 'utf-8'));
      expect(taskJson).toMatchObject({
        id: taskSlug,
        name: taskSlug,
        status: 'planning',
        creator: 'transpec',
        assignee: '',
        current_phase: 0,
        base_branch: null,
        dev_type: 'backend',
      });
      expect(taskJson.meta).toMatchObject({
        originalExtendedType: 'change',
        sourceStatus: 'draft',
        isArchived: false,
        sourceUpdatedAt: taskJson.meta.sourceCreatedAt,
        preservedSourceFiles: {
          tasksMd: 'source-tasks.md',
          manifestYaml: 'source-manifest.yaml',
        },
      });

      const preprocessAfterApply = JSON.parse(
        await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8'),
      );
      expect(preprocessAfterApply.entities.every((entity: { hasEnhancedAnalysis: boolean }) => entity.hasEnhancedAnalysis)).toBe(true);

      const postprocessContext = JSON.parse(
        await fs.readFile(getProjectPostprocessContextPath(projectPath), 'utf-8'),
      );
      expect(postprocessContext.postprocessSkill).toBe('.transpec/skills/postprocess/trellis/SKILL.md');
      expect(postprocessContext.entitiesTransformed).toBe(2);
    },
  );

  it('should preserve enhanced analysis across a full preprocess rerun and refresh hasEnhancedAnalysis flags', async () => {
    const projectPath = await createTempDir('transpec-preprocess-refresh-', tempDirs);
    await createOpenSpecProject(projectPath, 'current');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    const preprocessBeforeRerun = JSON.parse(
      await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8'),
    );
    await seedEnhancedAnalysis(projectPath);
    await preprocessCommand({ projectPath, force: true });

    const analysisFile = JSON.parse(
      await fs.readFile(getProjectEnhancedAnalysisPath(projectPath), 'utf-8'),
    );
    expect(Object.keys(analysisFile.entities)).toHaveLength(2);

    const preprocessContext = JSON.parse(
      await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8'),
    );
    expect(preprocessContext.entities.map((entity: { id: string }) => entity.id)).toEqual(
      preprocessBeforeRerun.entities.map((entity: { id: string }) => entity.id),
    );
    expect(
      preprocessContext.entities.every((entity: { hasEnhancedAnalysis: boolean }) => entity.hasEnhancedAnalysis),
    ).toBe(true);
  });

  it('should remap enhanced analysis from previous preprocess IDs when legacy analysis files exist', async () => {
    const projectPath = await createTempDir('transpec-preprocess-remap-', tempDirs);
    await createOpenSpecProject(projectPath, 'current');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    const currentPreprocess = JSON.parse(
      await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8'),
    );

    const legacyIds = currentPreprocess.entities.map((_: unknown, index: number) => `legacy-${index}`);
    const legacyPreprocess = {
      ...currentPreprocess,
      entities: currentPreprocess.entities.map((entity: { name: string; type: string; sourcePath: string }, index: number) => ({
        ...entity,
        id: legacyIds[index],
        hasEnhancedAnalysis: true,
      })),
    };
    await fs.writeFile(
      getProjectPreprocessContextPath(projectPath),
      JSON.stringify(legacyPreprocess, null, 2),
    );
    await fs.writeFile(
      getProjectEnhancedAnalysisPath(projectPath),
      JSON.stringify(
        {
          version: '1.0.0',
          generatedAt: '2026-04-15T00:00:00.000Z',
          sourceFramework: currentPreprocess.sourceFramework,
          targetFramework: currentPreprocess.targetFramework,
          entities: Object.fromEntries(
            legacyPreprocess.entities.map((entity: { id: string; name: string }) => [
              entity.id,
              {
                intent: `Intent for ${entity.name}`,
                keyPoints: [],
                dependencies: [],
                constraints: [],
                requirement: [],
                design: [],
                implementNote: [],
              },
            ]),
          ),
        },
        null,
        2,
      ),
    );

    await preprocessCommand({ projectPath, force: true });

    const refreshedAnalysis = JSON.parse(
      await fs.readFile(getProjectEnhancedAnalysisPath(projectPath), 'utf-8'),
    );
    const refreshedPreprocess = JSON.parse(
      await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8'),
    );

    expect(Object.keys(refreshedAnalysis.entities)).toEqual(
      refreshedPreprocess.entities.map((entity: { id: string }) => entity.id),
    );
    expect(
      refreshedPreprocess.entities.every((entity: { hasEnhancedAnalysis: boolean }) => entity.hasEnhancedAnalysis),
    ).toBe(true);
  });

  it('should remap enhanced analysis from transpec logs when previous preprocess IDs are no longer on disk', async () => {
    const projectPath = await createTempDir('transpec-preprocess-log-remap-', tempDirs);
    await createOpenSpecProject(projectPath, 'current');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    const currentPreprocess = JSON.parse(
      await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8'),
    );

    const legacyIds = currentPreprocess.entities.map((_: unknown, index: number) => `legacy-log-${index}`);
    await fs.writeFile(
      getProjectEnhancedAnalysisPath(projectPath),
      JSON.stringify(
        {
          version: '1.0.0',
          generatedAt: '2026-04-15T00:00:00.000Z',
          sourceFramework: currentPreprocess.sourceFramework,
          targetFramework: currentPreprocess.targetFramework,
          entities: Object.fromEntries(
            currentPreprocess.entities.map((entity: { name: string }, index: number) => [
              legacyIds[index],
              {
                intent: `Intent for ${entity.name}`,
                keyPoints: [],
                dependencies: [],
                constraints: [],
                requirement: [],
                design: [],
                implementNote: [],
              },
            ]),
          ),
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(projectPath, '.transpec', 'logs', 'transpec.log'),
      `${currentPreprocess.entities.map((entity: { name: string; type: string }, index: number) => JSON.stringify({
        timestamp: '2026-04-15T00:00:00.000Z',
        level: 'DEBUG',
        module: 'adapter',
        message: entity.type === 'spec' ? 'Parsed spec' : 'Parsed archived change',
        data: {
          name: entity.name,
          id: legacyIds[index],
        },
      })).join('\n')}\n`,
    );

    await preprocessCommand({ projectPath, force: true });

    const refreshedAnalysis = JSON.parse(
      await fs.readFile(getProjectEnhancedAnalysisPath(projectPath), 'utf-8'),
    );
    const refreshedPreprocess = JSON.parse(
      await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8'),
    );

    expect(Object.keys(refreshedAnalysis.entities)).toEqual(
      refreshedPreprocess.entities.map((entity: { id: string }) => entity.id),
    );
    expect(
      refreshedPreprocess.entities.every((entity: { hasEnhancedAnalysis: boolean }) => entity.hasEnhancedAnalysis),
    ).toBe(true);
  });

  it('should recover relations from preprocess context when the IR database is stale', async () => {
    const projectPath = await createTempDir('transpec-apply-relations-recovery-', tempDirs);
    await createOpenSpecProject(projectPath, 'current');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    await seedEnhancedAnalysis(projectPath);

    const db = new Database(getProjectIrDbPath(projectPath));
    db.prepare('DELETE FROM relations').run();
    db.close();

    await applyCommand({ projectPath });

    const preprocessContext = JSON.parse(
      await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8'),
    );
    expect(preprocessContext.relationCount).toBeGreaterThan(0);
    expect(preprocessContext.relations.length).toBeGreaterThan(0);
  });

  it('should emit archived OpenSpec changes into Trellis archive paths', async () => {
    const projectPath = await createTempDir('transpec-openspec-archived-flow-', tempDirs);
    await createOpenSpecProject(projectPath, 'current', 'archive');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    await seedEnhancedAnalysis(projectPath);
    await applyCommand({ projectPath });

    const archivedTaskDir = path.join(
      projectPath,
      '.trellis',
      'tasks',
      'archive',
      '2026-04',
      '04-15-compact-style',
    );
    await expect(fs.access(path.join(archivedTaskDir, 'prd.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(archivedTaskDir, 'task.json'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(archivedTaskDir, 'source-tasks.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(archivedTaskDir, 'source-manifest.yaml'))).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(projectPath, '.trellis', 'tasks', '04-15-compact-style', 'prd.md')),
    ).rejects.toThrow();

    const archivedTask = JSON.parse(await fs.readFile(path.join(archivedTaskDir, 'task.json'), 'utf-8'));
    expect(archivedTask.meta).toMatchObject({
      isArchived: true,
      originalExtendedType: 'change',
      sourceStatus: 'draft',
      sourceArchivedAt: null,
    });
    expect(archivedTask.completedAt).toBeNull();
  });

  it('should infer fullstack context for UI-heavy OpenSpec changes', async () => {
    const projectPath = await createTempDir('transpec-openspec-ui-flow-', tempDirs);
    await createOpenSpecProject(projectPath, 'current', 'archive', 'terminal-ui');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    await seedEnhancedAnalysis(projectPath);
    await applyCommand({ projectPath });

    const archivedTaskDir = path.join(
      projectPath,
      '.trellis',
      'tasks',
      'archive',
      '2026-04',
      '04-15-interaction-setup-navigation',
    );
    const taskJson = JSON.parse(await fs.readFile(path.join(archivedTaskDir, 'task.json'), 'utf-8'));
    const implementContext = await fs.readFile(path.join(archivedTaskDir, 'implement.jsonl'), 'utf-8');

    expect(taskJson.dev_type).toBe('fullstack');
    expect(taskJson.meta).toMatchObject({
      sourceTaskSummary: '重构交互式 setup 为单栏、逐级进入的 terminal UI，并补充 contextual help。',
      sourceAcceptanceCriteria: [
        'setup 菜单支持进入、返回与快捷键提示',
      ],
      sourceFollowUpSuggestions: [
        'add locale-specific help copy',
      ],
      sourceTaskEstimates: [
        { scope: '1. Setup navigation', value: '0.5 天' },
      ],
    });
    expect(taskJson.meta.sourceTaskSections.map((section: { title: string }) => section.title)).toEqual([
      '概览',
      '任务清单',
      '验收准则',
      '后续可选任务',
    ]);
    expect(implementContext).toContain('.trellis/spec/backend/index.md');
    expect(implementContext).toContain('.trellis/spec/frontend/index.md');
    expect(implementContext).toContain('.trellis/spec/guides/cross-layer-thinking-guide.md');
  });

  it('should keep interactive CLI changes on backend-only context', async () => {
    const projectPath = await createTempDir('transpec-openspec-interactive-cli-flow-', tempDirs);
    await createOpenSpecProject(projectPath, 'current', 'archive', 'interactive-cli');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    await seedEnhancedAnalysis(projectPath);
    await applyCommand({ projectPath });

    const archivedTaskDir = path.join(
      projectPath,
      '.trellis',
      'tasks',
      'archive',
      '2026-04',
      '04-15-guided-cli-install',
    );
    const taskJson = JSON.parse(await fs.readFile(path.join(archivedTaskDir, 'task.json'), 'utf-8'));
    const implementContext = await fs.readFile(path.join(archivedTaskDir, 'implement.jsonl'), 'utf-8');
    const frontendSpecFiles = (await fs.readdir(path.join(projectPath, '.trellis', 'spec', 'frontend')))
      .filter(file => file !== 'index.md');

    expect(taskJson.dev_type).toBe('backend');
    expect(implementContext).toContain('.trellis/spec/backend/index.md');
    expect(implementContext).not.toContain('.trellis/spec/frontend/index.md');
    expect(implementContext).not.toContain('.trellis/spec/guides/cross-layer-thinking-guide.md');
    expect(frontendSpecFiles).toHaveLength(0);
  });

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
