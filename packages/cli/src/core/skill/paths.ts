import * as path from 'path';
import { fileURLToPath } from 'url';

export type SkillAssetKind = 'preprocess' | 'postprocess';

function normalizeProjectRelative(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

function getSkillModuleDir(moduleUrl: string = import.meta.url): string {
  return path.dirname(fileURLToPath(moduleUrl));
}

export function getBuiltInSkillRoot(moduleUrl: string = import.meta.url): string {
  return getSkillModuleDir(moduleUrl);
}

export function getBuiltInSkillCategoryDir(kind: SkillAssetKind, moduleUrl: string = import.meta.url): string {
  return path.join(getBuiltInSkillRoot(moduleUrl), `${kind}-skills`);
}

export function getBuiltInSkillPath(
  kind: SkillAssetKind,
  framework: string,
  moduleUrl: string = import.meta.url,
): string {
  return path.join(getBuiltInSkillCategoryDir(kind, moduleUrl), framework, 'SKILL.md');
}

export function getProjectTranspecDir(projectPath: string): string {
  return path.join(projectPath, '.transpec');
}

export function getProjectSkillRoot(projectPath: string): string {
  return path.join(getProjectTranspecDir(projectPath), 'skills');
}

export function getProjectFrameworkSkillDir(projectPath: string, kind: SkillAssetKind, framework: string): string {
  return path.join(getProjectSkillRoot(projectPath), kind, framework);
}

export function getProjectFrameworkSkillPath(projectPath: string, kind: SkillAssetKind, framework: string): string {
  return path.join(getProjectFrameworkSkillDir(projectPath, kind, framework), 'SKILL.md');
}

export function getProjectWorkspaceDir(projectPath: string): string {
  return path.join(getProjectTranspecDir(projectPath), 'workspace');
}

export function getProjectPreprocessContextPath(projectPath: string): string {
  return path.join(getProjectWorkspaceDir(projectPath), 'preprocess-context.json');
}

export function getProjectEnhancedAnalysisPath(projectPath: string): string {
  return path.join(getProjectWorkspaceDir(projectPath), 'enhanced-analysis.json');
}

export function getProjectPostprocessContextPath(projectPath: string): string {
  return path.join(getProjectWorkspaceDir(projectPath), 'postprocess-context.json');
}

export function getProjectIrDir(projectPath: string): string {
  return path.join(getProjectTranspecDir(projectPath), 'ir');
}

export function getProjectIrDbPath(projectPath: string): string {
  return path.join(getProjectIrDir(projectPath), 'conversion.db');
}

export function getProjectLogsDir(projectPath: string): string {
  return path.join(getProjectTranspecDir(projectPath), 'logs');
}

export function getProjectLogFilePath(projectPath: string): string {
  return path.join(getProjectLogsDir(projectPath), 'transpec.log');
}

export function toProjectRelativePath(projectPath: string, targetPath: string): string {
  return normalizeProjectRelative(path.relative(projectPath, targetPath));
}
