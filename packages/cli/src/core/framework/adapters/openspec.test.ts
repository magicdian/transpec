import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupTempDirs,
  createOpenSpecProject,
  createTempDir,
  writeFixtureFile,
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
    const compatibilitySpec = entities.find(entity => entity.extendedType === 'spec');

    expect(legacyChange?.metadata.requirementCount).toEqual({ added: 1, modified: 1 });
    expect(compactChange?.metadata.requirementCount).toEqual({ added: 1, modified: 1 });
    expect(compatibilitySpec?.name).toBe('compatibility flow');
    expect(compatibilitySpec?.content).toContain('### Stable Output');
    expect(compactChange?.metadata.subtasks).toEqual([
      { name: '1.1 Prepare runtime flow', status: 'completed' },
      { name: '1. Runtime flow', status: 'completed' },
      { name: '2.1 Verify compatibility', status: 'pending' },
      { name: '2. Compatibility validation', status: 'pending' },
      { name: '3. Documentation follow-up', status: 'pending' },
    ]);
    expect(compactChange?.metadata.sourceStatus).toBe('draft');
  });

  it('should generate stable entity IDs across repeated parses', async () => {
    const projectPath = await createTempDir('transpec-openspec-stable-ids-', tempDirs);
    const adapter = new OpenSpecAdapter();

    await createOpenSpecProject(projectPath, 'current');

    const firstPass = await adapter.parseAll(projectPath);
    const secondPass = await adapter.parseAll(projectPath);

    expect(firstPass.map(entity => entity.id)).toEqual(secondPass.map(entity => entity.id));
  });

  it('should preserve structured task sections beyond checkbox subtasks', async () => {
    const projectPath = await createTempDir('transpec-openspec-structured-tasks-', tempDirs);
    const adapter = new OpenSpecAdapter();

    const tasksPath = 'openspec/changes/2026-04-16-structured/tasks.md';
    await writeFixtureFile(
      projectPath,
      tasksPath,
      `# tasks for structured

## 概览
实现 MVP，并为后续拆分保留验收与跟进信息。

## 任务清单
1. 初始化
   - [x] 1.1 创建项目骨架
   - 估时：0.5 天

## 验收准则
- dry-run 能输出正确命令
- ambiguous remote 时返回明确错误

## 后续可选任务
- 支持 push-option
`,
    );

    const parsedTasks = await adapter.parseTasksFile(`${projectPath}/${tasksPath}`);

    expect(parsedTasks.subtasks).toEqual([
      { name: '1.1 创建项目骨架', status: 'completed' },
      { name: '1. 初始化', status: 'completed' },
    ]);
    expect(parsedTasks.summary).toContain('实现 MVP');
    expect(parsedTasks.acceptanceCriteria).toEqual([
      'dry-run 能输出正确命令',
      'ambiguous remote 时返回明确错误',
    ]);
    expect(parsedTasks.followUpSuggestions).toEqual([
      '支持 push-option',
    ]);
    expect(parsedTasks.estimates).toEqual([
      { scope: '1. 初始化', value: '0.5 天' },
    ]);
    expect(parsedTasks.sections.map(section => section.title)).toEqual([
      '概览',
      '任务清单',
      '验收准则',
      '后续可选任务',
    ]);
  });
});
