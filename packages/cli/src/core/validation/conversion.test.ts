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
});
