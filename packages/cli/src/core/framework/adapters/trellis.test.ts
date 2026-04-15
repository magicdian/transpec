import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupTempDirs,
  createTempDir,
  createTrellisProject,
} from '../../../test/compat-fixtures.js';
import { TrellisAdapter } from './trellis.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await cleanupTempDirs(tempDirs);
});

describe('TrellisAdapter compatibility', () => {
  it('should detect and parse both legacy and current Trellis project layouts', async () => {
    const legacyProject = await createTempDir('transpec-trellis-legacy-', tempDirs);
    const currentProject = await createTempDir('transpec-trellis-current-', tempDirs);
    const adapter = new TrellisAdapter();

    await createTrellisProject(legacyProject, 'legacy');
    await createTrellisProject(currentProject, 'current');

    await expect(adapter.detect(legacyProject)).resolves.toBe(true);
    await expect(adapter.detect(currentProject)).resolves.toBe(true);

    const legacyEntities = await adapter.parseAll(legacyProject);
    const currentEntities = await adapter.parseAll(currentProject);

    expect(legacyEntities.map(entity => entity.extendedType).sort()).toEqual(['spec', 'task']);
    expect(currentEntities.map(entity => entity.extendedType).sort()).toEqual(['spec', 'task']);

    const legacyTask = legacyEntities.find(entity => entity.extendedType === 'task');
    const currentTask = currentEntities.find(entity => entity.extendedType === 'task');
    const currentSpec = currentEntities.find(entity => entity.name === 'cli/backend/error-handling');

    expect(legacyTask?.metadata).toMatchObject({
      status: 'active',
      priority: 'P1',
      taskJson: { id: 'legacy-task', status: 'active' },
    });
    expect(currentTask?.metadata).toMatchObject({
      taskJson: {
        id: 'current-task',
        status: 'pending',
        title: 'Current Task',
        current_phase: 2,
        children: ['04-15-current-task-subtask'],
      },
    });
    expect((currentTask?.metadata.taskJson as { next_action?: Array<{ action: string }> }).next_action).toEqual([
      { phase: 3, action: 'implement' },
      { phase: 4, action: 'check' },
    ]);
    expect(currentTask?.createdAt).toBe('2026-04-15T00:00:00.000Z');
    expect(currentTask?.metadata.taskJson).toMatchObject({ parent: null });
    expect(currentSpec?.extendedType).toBe('spec');
  });
});
