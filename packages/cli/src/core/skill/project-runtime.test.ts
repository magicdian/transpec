import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { CoreType, type CoreEntity, type CoreRelation } from '../ir/types.js';
import {
  getProjectEnhancedAnalysisPath,
  getProjectPostprocessContextPath,
  getProjectPreprocessContextPath,
} from './paths.js';
import {
  loadEnhancedAnalysisFile,
  materializeProjectSkills,
  mergeEnhancedAnalysis,
  writePostprocessContext,
  writePreprocessContext,
} from './project-runtime.js';

const tempDirs: string[] = [];

async function createTempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'transpec-runtime-'));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, '.transpec'), { recursive: true });
  return dir;
}

const sampleEntities: CoreEntity[] = [
  {
    id: 'entity-1',
    name: 'Example Entity',
    coreType: CoreType.DOCUMENT,
    extendedType: 'spec',
    content: '# Example',
    metadata: {},
    sourceFramework: 'openspec',
    sourcePath: 'openspec/specs/example/spec.md',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const sampleRelations: CoreRelation[] = [
  {
    id: 'rel-1',
    sourceId: 'entity-1',
    targetId: 'entity-1',
    relationType: 'self',
  },
];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe('project runtime skill materialization', () => {
  it('should copy preprocess and postprocess skills into project-local .transpec paths', async () => {
    const projectPath = await createTempProject();

    const result = await materializeProjectSkills(projectPath, 'openspec', 'trellis');

    expect(result.preprocessSkillPath).not.toBeNull();
    expect(result.postprocessSkillPath).not.toBeNull();
    if (!result.preprocessSkillPath || !result.postprocessSkillPath) {
      throw new Error('Expected project skill paths to be materialized');
    }

    const preprocessContent = await fs.readFile(result.preprocessSkillPath, 'utf-8');
    const postprocessContent = await fs.readFile(result.postprocessSkillPath, 'utf-8');

    expect(preprocessContent).toContain('OpenSpec Framework Analysis');
    expect(postprocessContent).toContain('Trellis Postprocess');
  });

  it('should write preprocess/postprocess context files and merge enhanced analysis results', async () => {
    const projectPath = await createTempProject();
    await materializeProjectSkills(projectPath, 'openspec', 'trellis');

    await writePreprocessContext(projectPath, 'openspec', 'trellis', sampleEntities, sampleRelations);
    await writePostprocessContext(projectPath, 'openspec', 'trellis', sampleEntities.length);

    const preprocessContext = JSON.parse(await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8'));
    const postprocessContext = JSON.parse(await fs.readFile(getProjectPostprocessContextPath(projectPath), 'utf-8'));

    expect(preprocessContext.preprocessSkill).toBe('.transpec/skills/preprocess/openspec/SKILL.md');
    expect(postprocessContext.postprocessSkill).toBe('.transpec/skills/postprocess/trellis/SKILL.md');

    await fs.writeFile(getProjectEnhancedAnalysisPath(projectPath), JSON.stringify({
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      sourceFramework: 'openspec',
      targetFramework: 'trellis',
      entities: {
        'entity-1': {
          intent: 'Example intent',
          keyPoints: ['k1'],
          dependencies: ['dep'],
          constraints: ['constraint'],
          requirement: ['req'],
          design: ['design'],
          implementNote: ['note'],
        },
      },
    }));

    const analysisFile = await loadEnhancedAnalysisFile(projectPath);
    expect(analysisFile).not.toBeNull();
    if (!analysisFile) {
      throw new Error('Expected enhanced analysis file to load');
    }

    const merged = mergeEnhancedAnalysis(sampleEntities, analysisFile);
    expect(merged.updatedCount).toBe(1);
    expect(merged.entities[0].metadata.enhancedAnalysis).toMatchObject({
      intent: 'Example intent',
    });

    await writePreprocessContext(projectPath, 'openspec', 'trellis', merged.entities, sampleRelations);
    const refreshedPreprocess = JSON.parse(
      await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8'),
    );
    expect(refreshedPreprocess.entities[0].hasEnhancedAnalysis).toBe(true);
  });

  it('should mark hasEnhancedAnalysis true when matching enhanced-analysis.json already exists on disk', async () => {
    const projectPath = await createTempProject();
    await materializeProjectSkills(projectPath, 'openspec', 'trellis');
    await fs.mkdir(path.dirname(getProjectEnhancedAnalysisPath(projectPath)), { recursive: true });

    await fs.writeFile(getProjectEnhancedAnalysisPath(projectPath), JSON.stringify({
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      sourceFramework: 'openspec',
      targetFramework: 'trellis',
      entities: {
        'entity-1': {
          intent: 'Example intent',
          keyPoints: ['k1'],
          dependencies: [],
          constraints: [],
          requirement: [],
          design: [],
          implementNote: [],
        },
      },
    }));

    await writePreprocessContext(projectPath, 'openspec', 'trellis', sampleEntities, sampleRelations);

    const preprocessContext = JSON.parse(
      await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8'),
    );
    expect(preprocessContext.entities[0].hasEnhancedAnalysis).toBe(true);
  });
});
