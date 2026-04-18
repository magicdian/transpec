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
  const existingAnalysis = await reconcileEnhancedAnalysisIds(projectPath, entities);
  const existingAnalysisIds = new Set(Object.keys(existingAnalysis?.entities ?? {}));

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
      hasEnhancedAnalysis: Boolean(entity.metadata?.enhancedAnalysis) || existingAnalysisIds.has(entity.id),
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

async function reconcileEnhancedAnalysisIds(
  projectPath: string,
  entities: CoreEntity[],
): Promise<EnhancedAnalysisFile | null> {
  const analysisFile = await loadEnhancedAnalysisFile(projectPath);
  if (!analysisFile) {
    return null;
  }

  const currentIds = new Set(entities.map(entity => entity.id));
  const analysisIds = Object.keys(analysisFile.entities);
  if (analysisIds.length === 0 || analysisIds.every(id => currentIds.has(id))) {
    return analysisFile;
  }

  const previousPreprocessContext = await loadPreprocessContextFile(projectPath);
  const previousEntityIds = new Map(
    (previousPreprocessContext?.entities ?? []).map(entity => [buildEntityReference(entity), entity.id]),
  );
  const loggedEntityIds = await loadLoggedEntityIds(projectPath, analysisFile);

  let migrated = false;
  const migratedEntities: Record<string, EnhancedAnalysis> = {};

  for (const entity of entities) {
    if (analysisFile.entities[entity.id]) {
      migratedEntities[entity.id] = analysisFile.entities[entity.id];
      continue;
    }

    const previousId = previousEntityIds.get(buildEntityReference(entity));
    const loggedId = loggedEntityIds.get(buildEntityNameReference(entity));
    const previousAnalysis = analysisFile.entities[previousId ?? ''] ?? analysisFile.entities[loggedId ?? ''];
    if (!previousAnalysis) {
      continue;
    }

    migratedEntities[entity.id] = previousAnalysis;
    migrated = true;
  }

  if (!migrated) {
    return analysisFile;
  }

  const reconciled: EnhancedAnalysisFile = {
    ...analysisFile,
    entities: migratedEntities,
  };

  await fs.writeFile(
    getProjectEnhancedAnalysisPath(projectPath),
    JSON.stringify(reconciled, null, 2),
  );

  return reconciled;
}

async function loadPreprocessContextFile(projectPath: string): Promise<PreprocessContextFile | null> {
  try {
    const content = await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8');
    return JSON.parse(content) as PreprocessContextFile;
  } catch {
    return null;
  }
}

function buildEntityReference(entity: {
  type?: string;
  extendedType?: string;
  sourcePath: string;
  name: string;
}): string {
  const entityType = entity.type ?? entity.extendedType ?? '';
  return [
    entityType.trim().toLowerCase(),
    entity.sourcePath.trim().toLowerCase(),
    entity.name.trim().toLowerCase(),
  ].join('|');
}

function buildEntityNameReference(entity: {
  type?: string;
  extendedType?: string;
  name: string;
}): string {
  const entityType = entity.type ?? entity.extendedType ?? '';
  return [
    entityType.trim().toLowerCase(),
    entity.name.trim().toLowerCase(),
  ].join('|');
}

async function loadLoggedEntityIds(
  projectPath: string,
  analysisFile: EnhancedAnalysisFile,
): Promise<Map<string, string>> {
  const analysisIds = new Set(Object.keys(analysisFile.entities));
  if (analysisIds.size === 0) {
    return new Map();
  }

  try {
    const logPath = path.join(projectPath, '.transpec', 'logs', 'transpec.log');
    const content = await fs.readFile(logPath, 'utf-8');
    const mapping = new Map<string, string>();

    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      let parsed: {
        module?: string;
        message?: string;
        data?: { id?: string; name?: string };
      };
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (parsed.module !== 'adapter' || !parsed.message || !parsed.data?.id || !parsed.data?.name) {
        continue;
      }
      if (!analysisIds.has(parsed.data.id)) {
        continue;
      }

      const type = resolveLoggedEntityType(parsed.message);
      if (!type) {
        continue;
      }

      mapping.set(
        buildEntityNameReference({
          type,
          name: parsed.data.name,
        }),
        parsed.data.id,
      );
    }

    return mapping;
  } catch {
    return new Map();
  }
}

function resolveLoggedEntityType(message: string): string | null {
  const normalized = message.trim().toLowerCase();
  if (normalized === 'parsed spec') {
    return 'spec';
  }
  if (normalized === 'parsed change' || normalized === 'parsed archived change') {
    return 'change';
  }
  if (normalized === 'parsed task') {
    return 'task';
  }
  return null;
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
