import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupTempDirs,
  createOpenSpecProject,
  createTempDir,
} from '../../../test/compat-fixtures.js';
import { OpenSpecAdapter } from './openspec.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await cleanupTempDirs(tempDirs);
});

describe('OpenSpecAdapter compatibility', () => {
  it('should parse legacy and compact requirement heading styles consistently', async () => {
    const projectPath = await createTempDir('transpec-openspec-compat-', tempDirs);
    const adapter = new OpenSpecAdapter();

    await createOpenSpecProject(projectPath, 'legacy');
    await createOpenSpecProject(projectPath, 'current');

    const entities = await adapter.parseAll(projectPath);

    expect(entities).toHaveLength(3);

    const legacyChange = entities.find(entity => entity.name === 'legacy style');
    const compactChange = entities.find(entity => entity.name === 'compact style');
    const capabilitySpec = entities.find(entity => entity.extendedType === 'spec');

    expect(legacyChange?.metadata.requirementCount).toEqual({ added: 1, modified: 1 });
    expect(compactChange?.metadata.requirementCount).toEqual({ added: 1, modified: 1 });
    expect(capabilitySpec?.content).toContain('### Stable Output');
    expect(compactChange?.metadata.subtasks).toEqual([
      { name: '1.1 Prepare runtime flow', status: 'completed' },
      { name: '1.2 Verify compatibility', status: 'pending' },
    ]);
  });
});
