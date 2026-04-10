import * as fs from 'fs/promises';
import * as path from 'path';
import { CoreEntity, CoreRelation, EnhancedAnalysis } from '../ir/types.js';
import {
  SkillAssetKind,
  getBuiltInSkillPath,
  getProjectEnhancedAnalysisPath,
  getProjectFrameworkSkillPath,
  getProjectPostprocessContextPath,
  getProjectPreprocessContextPath,
  getProjectWorkspaceDir,
  toProjectRelativePath,
} from './paths.js';

export interface PreprocessContextFile {
  version: string;
  generatedAt: string;
  sourceFramework: string;
  targetFramework: string;
  preprocessSkill: string;
  enhancedAnalysisOutput: string;
  entityCount: number;
  relationCount: number;
  entities: Array<{
    id: string;
    name: string;
    type: string;
    sourcePath: string;
    hasEnhancedAnalysis: boolean;
  }>;
  relations: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    type: string;
  }>;
}

export interface EnhancedAnalysisFile {
  version: string;
  generatedAt: string;
  sourceFramework: string;
  targetFramework: string;
  entities: Record<string, EnhancedAnalysis>;
}

export interface PostprocessContextFile {
  version: string;
  generatedAt: string;
  sourceFramework: string;
  targetFramework: string;
  postprocessSkill: string;
  enhancedAnalysisInput: string;
  entitiesTransformed: number;
  outputRoot: string;
}

async function copySkillToProject(
  projectPath: string,
  kind: SkillAssetKind,
  framework: string,
): Promise<string | null> {
  const builtInPath = getBuiltInSkillPath(kind, framework);
  const projectSkillPath = getProjectFrameworkSkillPath(projectPath, kind, framework);

  try {
    const content = await fs.readFile(builtInPath, 'utf-8');
    await fs.mkdir(path.dirname(projectSkillPath), { recursive: true });
    await fs.writeFile(projectSkillPath, content);
    return projectSkillPath;
  } catch {
    return null;
  }
}

export async function materializeProjectSkills(
  projectPath: string,
  sourceFramework: string,
  targetFramework: string,
): Promise<{
  preprocessSkillPath: string | null;
  postprocessSkillPath: string | null;
}> {
  const preprocessSkillPath = await copySkillToProject(projectPath, 'preprocess', sourceFramework);
  const postprocessSkillPath = await copySkillToProject(projectPath, 'postprocess', targetFramework);

  return {
    preprocessSkillPath,
    postprocessSkillPath,
  };
}

export async function writePreprocessContext(
  projectPath: string,
  sourceFramework: string,
  targetFramework: string,
  entities: CoreEntity[],
  relations: CoreRelation[],
): Promise<string> {
  const workspaceDir = getProjectWorkspaceDir(projectPath);
  const preprocessSkillPath = getProjectFrameworkSkillPath(projectPath, 'preprocess', sourceFramework);
  const enhancedAnalysisPath = getProjectEnhancedAnalysisPath(projectPath);
  const outputPath = getProjectPreprocessContextPath(projectPath);

  const context: PreprocessContextFile = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    sourceFramework,
    targetFramework,
    preprocessSkill: toProjectRelativePath(projectPath, preprocessSkillPath),
    enhancedAnalysisOutput: toProjectRelativePath(projectPath, enhancedAnalysisPath),
    entityCount: entities.length,
    relationCount: relations.length,
    entities: entities.map(entity => ({
      id: entity.id,
      name: entity.name,
      type: entity.extendedType,
      sourcePath: entity.sourcePath,
      hasEnhancedAnalysis: Boolean(entity.metadata?.enhancedAnalysis),
    })),
    relations: relations.map(relation => ({
      id: relation.id,
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      type: relation.relationType,
    })),
  };

  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(context, null, 2));

  return outputPath;
}

export async function writePostprocessContext(
  projectPath: string,
  sourceFramework: string,
  targetFramework: string,
  entitiesTransformed: number,
): Promise<string> {
  const workspaceDir = getProjectWorkspaceDir(projectPath);
  const postprocessSkillPath = getProjectFrameworkSkillPath(projectPath, 'postprocess', targetFramework);
  const enhancedAnalysisPath = getProjectEnhancedAnalysisPath(projectPath);
  const outputPath = getProjectPostprocessContextPath(projectPath);

  const context: PostprocessContextFile = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    sourceFramework,
    targetFramework,
    postprocessSkill: toProjectRelativePath(projectPath, postprocessSkillPath),
    enhancedAnalysisInput: toProjectRelativePath(projectPath, enhancedAnalysisPath),
    entitiesTransformed,
    outputRoot: '.',
  };

  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(context, null, 2));

  return outputPath;
}

export async function loadEnhancedAnalysisFile(projectPath: string): Promise<EnhancedAnalysisFile | null> {
  const analysisPath = getProjectEnhancedAnalysisPath(projectPath);

  try {
    const content = await fs.readFile(analysisPath, 'utf-8');
    return JSON.parse(content) as EnhancedAnalysisFile;
  } catch {
    return null;
  }
}

export function mergeEnhancedAnalysis(
  entities: CoreEntity[],
  analysisFile: EnhancedAnalysisFile,
): { entities: CoreEntity[]; updatedCount: number } {
  let updatedCount = 0;

  const updatedEntities = entities.map(entity => {
    const enhancedAnalysis = analysisFile.entities[entity.id];
    if (!enhancedAnalysis) {
      return entity;
    }

    updatedCount += 1;
    return {
      ...entity,
      metadata: {
        ...entity.metadata,
        enhancedAnalysis,
      },
    };
  });

  return {
    entities: updatedEntities,
    updatedCount,
  };
}
