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
import { applyCommand } from './apply.js';
import { postprocessCommand } from './postprocess.js';
import { preprocessCommand } from './preprocess.js';

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTempDirs(tempDirs);
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('postprocess command', () => {
  it('should regenerate grounded Trellis specs from postprocess context', async () => {
    const projectPath = await createTempDir('transpec-postprocess-command-', tempDirs);
    await createOpenSpecProject(projectPath, 'current');
    await setupTranspecConfig(projectPath, 'openspec', 'trellis');

    await preprocessCommand({ projectPath });
    await seedEnhancedAnalysis(projectPath);
    await applyCommand({ projectPath });

    const guidesDoc = path.join(projectPath, '.trellis', 'spec', 'guides', 'repository-and-conversion-state.md');
    const backendDir = path.join(projectPath, '.trellis', 'spec', 'backend');
    const backendFiles = (await fs.readdir(backendDir)).filter(file => file !== 'index.md');
    expect(backendFiles.length).toBeGreaterThan(0);

    await fs.rm(guidesDoc, { force: true });
    await Promise.all(
      backendFiles.map(file => fs.rm(path.join(backendDir, file), { force: true })),
    );

    await postprocessCommand({ projectPath });

    await expect(fs.access(guidesDoc)).resolves.toBeUndefined();
    const regeneratedBackendFiles = (await fs.readdir(backendDir)).filter(file => file !== 'index.md');
    expect(regeneratedBackendFiles.length).toBeGreaterThan(0);
  });
});
