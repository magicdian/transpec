import * as fs from 'fs/promises';
import * as path from 'path';
import { loadProjectConfig } from '../../cli/utils/project-config.js';
import { getProjectEnhancedAnalysisPath, getProjectPostprocessContextPath, getProjectPreprocessContextPath } from '../skill/index.js';
import type { EnhancedAnalysisFile, PostprocessContextFile, PreprocessContextFile } from '../skill/project-runtime.js';

type Severity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: Severity;
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  success: boolean;
  issues: ValidationIssue[];
  summary: {
    sourceFramework?: string;
    targetFramework?: string;
    checkedTasks: number;
    checkedRelations: number;
  };
}

interface TrellisTaskDirectory {
  dirPath: string;
  archived: boolean;
}

const REQUIRED_TASK_FIELDS = [
  'id',
  'name',
  'title',
  'description',
  'status',
  'creator',
  'assignee',
  'createdAt',
  'base_branch',
  'current_phase',
  'next_action',
  'dev_type',
  'meta',
] as const;
const REQUIRED_TASK_META_FIELDS = [
  'originalExtendedType',
  'sourceFramework',
  'sourcePath',
  'sourceCreatedAt',
  'sourceStatus',
  'importedAt',
  'isArchived',
] as const;

export async function validateConvertedProject(projectPath: string): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  let config;

  try {
    config = await loadProjectConfig(projectPath);
  } catch (error) {
    issues.push({
      severity: 'error',
      code: 'missing_config',
      message: `Failed to load .transpec/config.yaml: ${(error as Error).message}`,
      path: path.join(projectPath, '.transpec', 'config.yaml'),
    });
    return {
      success: false,
      issues,
      summary: { checkedTasks: 0, checkedRelations: 0 },
    };
  }

  const sourceFramework = config.project?.sourceFramework;
  const targetFramework = config.project?.targetFramework;

  if (!sourceFramework || !targetFramework) {
    issues.push({
      severity: 'error',
      code: 'missing_framework_config',
      message: 'Source and target frameworks must be configured in .transpec/config.yaml.',
      path: path.join(projectPath, '.transpec', 'config.yaml'),
    });
    return {
      success: false,
      issues,
      summary: { sourceFramework, targetFramework, checkedTasks: 0, checkedRelations: 0 },
    };
  }

  if (sourceFramework === 'openspec' && targetFramework === 'trellis') {
    const details = await validateOpenSpecToTrellis(projectPath, issues);
    return {
      success: !issues.some(issue => issue.severity === 'error'),
      issues,
      summary: {
        sourceFramework,
        targetFramework,
        checkedTasks: details.checkedTasks,
        checkedRelations: details.checkedRelations,
      },
    };
  }

  issues.push({
    severity: 'warning',
    code: 'unsupported_validation_target',
    message: `No framework-specific validation checks are implemented for ${sourceFramework} -> ${targetFramework} yet.`,
  });
  return {
    success: !issues.some(issue => issue.severity === 'error'),
    issues,
    summary: { sourceFramework, targetFramework, checkedTasks: 0, checkedRelations: 0 },
  };
}

async function validateOpenSpecToTrellis(
  projectPath: string,
  issues: ValidationIssue[],
): Promise<{ checkedTasks: number; checkedRelations: number }> {
  const preprocessContextPath = getProjectPreprocessContextPath(projectPath);
  const enhancedAnalysisPath = getProjectEnhancedAnalysisPath(projectPath);
  const postprocessContextPath = getProjectPostprocessContextPath(projectPath);

  const preprocessContext = await readOptionalJson<PreprocessContextFile>(preprocessContextPath, issues, 'missing_preprocess_context');
  const enhancedAnalysis = await readOptionalJson<EnhancedAnalysisFile>(enhancedAnalysisPath, issues, 'missing_enhanced_analysis');
  await readOptionalJson<PostprocessContextFile>(postprocessContextPath, issues, 'missing_postprocess_context');

  if (preprocessContext) {
    if (preprocessContext.relationCount <= 0 || preprocessContext.relations.length <= 0) {
      issues.push({
        severity: 'error',
        code: 'missing_relations',
        message: 'preprocess-context.json does not contain any exported relations.',
        path: preprocessContextPath,
      });
    }

    if (enhancedAnalysis) {
      const enhancedIds = new Set(Object.keys(enhancedAnalysis.entities));
      const matchedEnhancedIds = preprocessContext.entities.filter(entity => enhancedIds.has(entity.id));

      if (enhancedIds.size > 0 && matchedEnhancedIds.length === 0) {
        issues.push({
          severity: 'error',
          code: 'enhanced_analysis_id_mismatch',
          message: 'enhanced-analysis.json exists but none of its entity IDs match the current preprocess output. Re-run enhanced analysis after preprocess.',
          path: enhancedAnalysisPath,
        });
      }

      for (const entity of preprocessContext.entities) {
        if (enhancedIds.has(entity.id) && !entity.hasEnhancedAnalysis) {
          issues.push({
            severity: 'error',
            code: 'enhanced_analysis_unsynced',
            message: `Entity "${entity.name}" has enhanced analysis on disk but preprocess-context.json still marks it false.`,
            path: preprocessContextPath,
          });
        }
      }
    }
  }

  await ensureFileExists(path.join(projectPath, '.trellis', 'workflow.md'), issues, 'missing_workflow');
  await ensureFileExists(path.join(projectPath, '.trellis', 'spec', 'backend', 'index.md'), issues, 'missing_backend_index');
  await ensureFileExists(path.join(projectPath, '.trellis', 'spec', 'frontend', 'index.md'), issues, 'missing_frontend_index');
  await ensureFileExists(path.join(projectPath, '.trellis', 'spec', 'guides', 'index.md'), issues, 'missing_guides_index');
  await ensureFileExists(
    path.join(projectPath, '.trellis', 'spec', 'guides', 'repository-and-conversion-state.md'),
    issues,
    'missing_repository_state_guide',
  );

  const groundedSpecCount = await countGroundedSpecs(path.join(projectPath, '.trellis', 'spec'));
  if (groundedSpecCount <= 0) {
    issues.push({
      severity: 'error',
      code: 'missing_grounded_specs',
      message: 'No grounded Trellis spec documents were generated under .trellis/spec/.',
      path: path.join(projectPath, '.trellis', 'spec'),
    });
  }

  const openspecCounts = await countOpenSpecSource(projectPath);
  const trellisCounts = await countTrellisOutputs(projectPath);
  if (openspecCounts.specCount !== trellisCounts.legacySpecCount) {
    issues.push({
      severity: 'error',
      code: 'legacy_spec_count_mismatch',
      message: `Expected ${openspecCounts.specCount} legacy specs but found ${trellisCounts.legacySpecCount}.`,
      path: path.join(projectPath, '.trellis', 'legacy', 'specs'),
    });
  }
  if (openspecCounts.archivedChangeCount !== trellisCounts.archivedTaskCount) {
    issues.push({
      severity: 'error',
      code: 'archived_task_count_mismatch',
      message: `Expected ${openspecCounts.archivedChangeCount} archived Trellis tasks but found ${trellisCounts.archivedTaskCount}.`,
      path: path.join(projectPath, '.trellis', 'tasks', 'archive'),
    });
  }

  const taskDirectories = await collectTaskDirectories(path.join(projectPath, '.trellis', 'tasks'));
  for (const task of taskDirectories) {
    await validateTaskDirectory(task, issues);
  }

  return {
    checkedTasks: taskDirectories.length,
    checkedRelations: preprocessContext?.relationCount ?? 0,
  };
}

async function validateTaskDirectory(task: TrellisTaskDirectory, issues: ValidationIssue[]): Promise<void> {
  const taskJsonPath = path.join(task.dirPath, 'task.json');
  const taskJson = await readOptionalJson<Record<string, unknown>>(taskJsonPath, issues, 'missing_task_json');

  await ensureFileExists(path.join(task.dirPath, 'prd.md'), issues, 'missing_prd');
  await ensureFileExists(path.join(task.dirPath, 'implement.jsonl'), issues, 'missing_implement_context');
  await ensureFileExists(path.join(task.dirPath, 'check.jsonl'), issues, 'missing_check_context');
  await ensureFileExists(path.join(task.dirPath, 'debug.jsonl'), issues, 'missing_debug_context');

  if (!taskJson) {
    return;
  }

  for (const field of REQUIRED_TASK_FIELDS) {
    if (!(field in taskJson)) {
      issues.push({
        severity: 'error',
        code: 'missing_task_field',
        message: `Task ${task.dirPath} is missing required field "${field}".`,
        path: taskJsonPath,
      });
    }
  }

  const meta = typeof taskJson.meta === 'object' && taskJson.meta !== null
    ? taskJson.meta as Record<string, unknown>
    : null;
  if (!meta) {
    issues.push({
      severity: 'error',
      code: 'missing_task_meta',
      message: `Task ${task.dirPath} is missing task.json.meta.`,
      path: taskJsonPath,
    });
    return;
  }

  for (const field of REQUIRED_TASK_META_FIELDS) {
    if (!(field in meta)) {
      issues.push({
        severity: 'error',
        code: 'missing_task_meta_field',
        message: `Task ${task.dirPath} is missing meta.${field}.`,
        path: taskJsonPath,
      });
    }
  }

  if (typeof taskJson.description === 'string' && taskJson.description.trim().endsWith('...')) {
    issues.push({
      severity: 'warning',
      code: 'truncated_description',
      message: `Task ${task.dirPath} still has an ellipsis-truncated description.`,
      path: taskJsonPath,
    });
  }

  const metaSourcePath = typeof meta.sourcePath === 'string' ? meta.sourcePath : '';
  const metaArchived = Boolean(meta.isArchived);
  if (task.archived !== metaArchived) {
    issues.push({
      severity: 'error',
      code: 'archive_location_mismatch',
      message: `Task ${task.dirPath} archive placement does not match meta.isArchived=${metaArchived}.`,
      path: taskJsonPath,
    });
  }
  if (!task.archived && metaSourcePath.includes('/changes/archive/')) {
    issues.push({
      severity: 'error',
      code: 'archived_source_in_active_pool',
      message: `Archived OpenSpec source was emitted into the active Trellis task pool: ${task.dirPath}.`,
      path: taskJsonPath,
    });
  }
  if (typeof meta.originalExtendedType === 'string' && metaSourcePath.includes('/changes/') && meta.originalExtendedType !== 'change') {
    issues.push({
      severity: 'error',
      code: 'wrong_original_extended_type',
      message: `Task ${task.dirPath} should preserve originalExtendedType="change".`,
      path: taskJsonPath,
    });
  }
  if (typeof taskJson.createdAt === 'string' && typeof meta.sourceCreatedAt === 'string' && taskJson.createdAt !== meta.sourceCreatedAt) {
    issues.push({
      severity: 'warning',
      code: 'created_at_mismatch',
      message: `Task ${task.dirPath} createdAt does not match meta.sourceCreatedAt.`,
      path: taskJsonPath,
    });
  }
}

async function readOptionalJson<T>(
  filePath: string,
  issues: ValidationIssue[],
  code: string,
): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    issues.push({
      severity: 'error',
      code,
      message: `Failed to read ${filePath}: ${(error as Error).message}`,
      path: filePath,
    });
    return null;
  }
}

async function ensureFileExists(filePath: string, issues: ValidationIssue[], code: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    issues.push({
      severity: 'error',
      code,
      message: `Missing required file: ${filePath}`,
      path: filePath,
    });
  }
}

async function countGroundedSpecs(specRoot: string): Promise<number> {
  let count = 0;

  async function walk(currentPath: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(currentPath);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.endsWith('.md') && entry !== 'index.md') {
        count += 1;
      }
    }
  }

  await walk(specRoot);
  return count;
}

async function countOpenSpecSource(projectPath: string): Promise<{ specCount: number; archivedChangeCount: number }> {
  const specsRoot = path.join(projectPath, 'openspec', 'specs');
  const archiveRoot = path.join(projectPath, 'openspec', 'changes', 'archive');
  return {
    specCount: await countImmediateVisibleDirectories(specsRoot),
    archivedChangeCount: await countImmediateVisibleDirectories(archiveRoot),
  };
}

async function countTrellisOutputs(projectPath: string): Promise<{ legacySpecCount: number; archivedTaskCount: number }> {
  const legacySpecRoot = path.join(projectPath, '.trellis', 'legacy', 'specs');
  const archiveTaskRoot = path.join(projectPath, '.trellis', 'tasks', 'archive');
  return {
    legacySpecCount: await countSpecDirectories(legacySpecRoot),
    archivedTaskCount: await countArchivedTaskDirectories(archiveTaskRoot),
  };
}

async function countImmediateVisibleDirectories(root: string): Promise<number> {
  try {
    const entries = await fs.readdir(root);
    let count = 0;
    for (const entry of entries) {
      if (entry.startsWith('.')) {
        continue;
      }
      const fullPath = path.join(root, entry);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function countSpecDirectories(root: string): Promise<number> {
  try {
    const entries = await fs.readdir(root);
    let count = 0;
    for (const entry of entries) {
      const fullPath = path.join(root, entry);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function countArchivedTaskDirectories(root: string): Promise<number> {
  try {
    const months = await fs.readdir(root);
    let count = 0;
    for (const month of months) {
      const monthPath = path.join(root, month);
      const stat = await fs.stat(monthPath);
      if (!stat.isDirectory()) {
        continue;
      }
      count += await countImmediateVisibleDirectories(monthPath);
    }
    return count;
  } catch {
    return 0;
  }
}

async function collectTaskDirectories(tasksRoot: string): Promise<TrellisTaskDirectory[]> {
  const taskDirectories: TrellisTaskDirectory[] = [];

  try {
    const entries = await fs.readdir(tasksRoot);
    for (const entry of entries) {
      if (entry === 'archive') {
        continue;
      }
      const fullPath = path.join(tasksRoot, entry);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        taskDirectories.push({ dirPath: fullPath, archived: false });
      }
    }
  } catch {
    // Ignore missing tasks root.
  }

  const archiveRoot = path.join(tasksRoot, 'archive');
  try {
    const months = await fs.readdir(archiveRoot);
    for (const month of months) {
      const monthPath = path.join(archiveRoot, month);
      const stat = await fs.stat(monthPath);
      if (!stat.isDirectory()) {
        continue;
      }
      const entries = await fs.readdir(monthPath);
      for (const entry of entries) {
        const fullPath = path.join(monthPath, entry);
        const entryStat = await fs.stat(fullPath);
        if (entryStat.isDirectory()) {
          taskDirectories.push({ dirPath: fullPath, archived: true });
        }
      }
    }
  } catch {
    // Ignore missing archive root.
  }

  return taskDirectories;
}
