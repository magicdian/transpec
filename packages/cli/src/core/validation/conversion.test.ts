import * as fs from 'fs/promises';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupTempDirs,
  createOpenSpecProject,
  createTempDir,
  seedEnhancedAnalysis,
  setupTranspecConfig,
} from '../../test/compat-fixtures.js';
import { applyCommand } from '../../cli/commands/apply.js';
import { preprocessCommand } from '../../cli/commands/preprocess.js';
import { validateConvertedProject } from './conversion.js';

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTempDirs(tempDirs);
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('conversion validation', () => {
  it('should pass for a freshly converted OpenSpec -> Trellis project', async () => {
    const projectPath = await createTempDir('transpec-validate-pass-', tempDirs);
    await createOpenSpecProject(projectPath, 'current');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    await seedEnhancedAnalysis(projectPath);
    await applyCommand({ projectPath });

    const result = await validateConvertedProject(projectPath);
    expect(result.success).toBe(true);
    expect(result.issues.filter(issue => issue.severity === 'error')).toHaveLength(0);
  });

  it('should fail when required Trellis runtime files are missing', async () => {
    const projectPath = await createTempDir('transpec-validate-fail-', tempDirs);
    await createOpenSpecProject(projectPath, 'current');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    await seedEnhancedAnalysis(projectPath);
    await applyCommand({ projectPath });

    await fs.rm(path.join(projectPath, '.trellis', 'workflow.md'), { force: true });

    const result = await validateConvertedProject(projectPath);
    expect(result.success).toBe(false);
    expect(result.issues.some(issue => issue.code === 'missing_workflow')).toBe(true);
  });

  it('should fail when enhanced-analysis IDs no longer match preprocess output', async () => {
    const projectPath = await createTempDir('transpec-validate-analysis-mismatch-', tempDirs);
    await createOpenSpecProject(projectPath, 'current');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    await seedEnhancedAnalysis(projectPath);
    await applyCommand({ projectPath });

    const analysisPath = path.join(projectPath, '.transpec', 'workspace', 'enhanced-analysis.json');
    const analysis = JSON.parse(await fs.readFile(analysisPath, 'utf-8')) as {
      entities: Record<string, unknown>;
    };
    analysis.entities = Object.fromEntries(
      Object.entries(analysis.entities).map(([id, value]) => [`stale-${id}`, value]),
    );
    await fs.writeFile(analysisPath, JSON.stringify(analysis, null, 2));

    const result = await validateConvertedProject(projectPath);
    expect(result.success).toBe(false);
    expect(result.issues.some(issue => issue.code === 'enhanced_analysis_id_mismatch')).toBe(true);
  });

  it('should fail when source tasks.md was not preserved as a Trellis artifact', async () => {
    const projectPath = await createTempDir('transpec-validate-missing-source-tasks-', tempDirs);
    await createOpenSpecProject(projectPath, 'current', 'archive');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    await seedEnhancedAnalysis(projectPath);
    await applyCommand({ projectPath });

    await fs.rm(
      path.join(projectPath, '.trellis', 'tasks', 'archive', '2026-04', '04-15-compact-style', 'source-tasks.md'),
      { force: true },
    );

    const result = await validateConvertedProject(projectPath);
    expect(result.success).toBe(false);
    expect(result.issues.some(issue => issue.code === 'missing_preserved_tasks_artifact')).toBe(true);
  });

  it('should warn when a UI-heavy task loses frontend context', async () => {
    const projectPath = await createTempDir('transpec-validate-ui-context-', tempDirs);
    await createOpenSpecProject(projectPath, 'current', 'archive', 'terminal-ui');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    await seedEnhancedAnalysis(projectPath);
    await applyCommand({ projectPath });

    const taskDir = path.join(projectPath, '.trellis', 'tasks', 'archive', '2026-04', '04-15-interaction-setup-navigation');
    await fs.writeFile(
      path.join(taskDir, 'implement.jsonl'),
      `${JSON.stringify({ file: '.trellis/workflow.md', reason: 'Project workflow and conventions' })}\n${JSON.stringify({ file: '.trellis/spec/backend/index.md', reason: 'Backend development guide' })}\n`,
    );
    const taskJsonPath = path.join(taskDir, 'task.json');
    const taskJson = JSON.parse(await fs.readFile(taskJsonPath, 'utf-8')) as Record<string, unknown>;
    taskJson.dev_type = 'backend';
    await fs.writeFile(taskJsonPath, JSON.stringify(taskJson, null, 2));

    const result = await validateConvertedProject(projectPath);
    expect(result.issues.some(issue => issue.code === 'ui_task_dev_type_degraded')).toBe(true);
    expect(result.issues.some(issue => issue.code === 'ui_task_missing_frontend_context')).toBe(true);
  });

  it('should not warn for interactive CLI tasks that do not have UI/TUI surfaces', async () => {
    const projectPath = await createTempDir('transpec-validate-interactive-cli-', tempDirs);
    await createOpenSpecProject(projectPath, 'current', 'archive', 'interactive-cli');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    await seedEnhancedAnalysis(projectPath);
    await applyCommand({ projectPath });

    const result = await validateConvertedProject(projectPath);
    expect(result.issues.some(issue => issue.code === 'ui_task_dev_type_degraded')).toBe(false);
    expect(result.issues.some(issue => issue.code === 'ui_task_missing_frontend_context')).toBe(false);
  });

  it('should warn when structured tasks.md metadata was not preserved into task.json meta', async () => {
    const projectPath = await createTempDir('transpec-validate-structured-tasks-', tempDirs);
    await createOpenSpecProject(projectPath, 'current', 'archive', 'terminal-ui');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    await seedEnhancedAnalysis(projectPath);
    await applyCommand({ projectPath });

    const taskJsonPath = path.join(
      projectPath,
      '.trellis',
      'tasks',
      'archive',
      '2026-04',
      '04-15-interaction-setup-navigation',
      'task.json',
    );
    const taskJson = JSON.parse(await fs.readFile(taskJsonPath, 'utf-8')) as { meta: Record<string, unknown> };
    delete taskJson.meta.sourceTaskSummary;
    delete taskJson.meta.sourceAcceptanceCriteria;
    delete taskJson.meta.sourceFollowUpSuggestions;
    delete taskJson.meta.sourceTaskSections;
    await fs.writeFile(taskJsonPath, JSON.stringify(taskJson, null, 2));

    const result = await validateConvertedProject(projectPath);
    expect(result.issues.some(issue => issue.code === 'missing_structured_tasks_metadata')).toBe(true);
  });

  it('should warn when repository state guide still claims scripts are missing after Trellis bootstrap is installed', async () => {
    const projectPath = await createTempDir('transpec-validate-stale-guide-', tempDirs);
    await createOpenSpecProject(projectPath, 'current');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    await seedEnhancedAnalysis(projectPath);
    await applyCommand({ projectPath });

    await fs.mkdir(path.join(projectPath, '.trellis', 'scripts'), { recursive: true });
    await fs.writeFile(
      path.join(projectPath, '.trellis', 'spec', 'guides', 'repository-and-conversion-state.md'),
      'The repo is converted, but there is no `.trellis/scripts/` directory in the current repo.\n',
    );

    const result = await validateConvertedProject(projectPath);
    expect(result.issues.some(issue => issue.code === 'stale_repository_state_guide')).toBe(true);
  });
});
