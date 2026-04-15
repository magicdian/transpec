import * as fs from 'fs/promises';
import * as path from 'path';
import {
  getProjectEnhancedAnalysisPath,
  getProjectPostprocessContextPath,
  getProjectPreprocessContextPath,
  toProjectRelativePath,
} from '../skill/paths.js';
import type {
  EnhancedAnalysisFile,
  PostprocessContextFile,
  PreprocessContextFile,
} from '../skill/project-runtime.js';

const SKIPPED_SCAN_DIRECTORIES = new Set([
  '.git',
  '.trellis',
  '.transpec',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
  'tmp',
]);
const UI_SIGNAL_PATTERN = /\b(ui|ux|view|screen|page|component|layout|menu|panel|dialog|form|terminal|tui|setup|i18n|locale|interactive)\b/i;
const CLI_SIGNAL_PATTERN = /\b(cli|command|terminal|shell|push|setup)\b/i;

export interface GeneratedSpecArtifact {
  layer: 'backend' | 'frontend' | 'guides';
  path: string;
}

export interface PostprocessRunResult {
  generatedFiles: GeneratedSpecArtifact[];
  warnings: string[];
}

interface AnalysisEntity {
  id: string;
  name: string;
  type: string;
  sourcePath: string;
  analysis: EnhancedAnalysisFile['entities'][string] | null;
}

interface RepositoryScanResult {
  extensionCounts: Map<string, number>;
  filesByExtension: Map<string, string[]>;
  topLevelDirectoryCounts: Map<string, number>;
  notableFiles: string[];
}

interface LanguageProfile {
  key: string;
  label: string;
}

export async function runTargetPostprocess(
  projectPath: string,
  targetFramework: string,
): Promise<PostprocessRunResult> {
  if (targetFramework === 'trellis') {
    return runTrellisPostprocess(projectPath);
  }

  return {
    generatedFiles: [],
    warnings: [`No deterministic postprocess implementation for target framework "${targetFramework}" yet.`],
  };
}

export async function runTrellisPostprocess(projectPath: string): Promise<PostprocessRunResult> {
  const preprocessContext = await readJsonFile<PreprocessContextFile>(getProjectPreprocessContextPath(projectPath));
  const enhancedAnalysis = await readJsonFile<EnhancedAnalysisFile>(getProjectEnhancedAnalysisPath(projectPath));
  const postprocessContext = await readJsonFile<PostprocessContextFile>(getProjectPostprocessContextPath(projectPath));
  const scan = await scanRepository(projectPath);

  const entities = preprocessContext.entities.map(entity => ({
    ...entity,
    analysis: enhancedAnalysis.entities[entity.id] ?? null,
  }));
  const generatedFiles: GeneratedSpecArtifact[] = [];
  const warnings: string[] = [];

  const guidesDir = path.join(projectPath, '.trellis', 'spec', 'guides');
  const backendDir = path.join(projectPath, '.trellis', 'spec', 'backend');
  const frontendDir = path.join(projectPath, '.trellis', 'spec', 'frontend');
  await fs.mkdir(guidesDir, { recursive: true });
  await fs.mkdir(backendDir, { recursive: true });
  await fs.mkdir(frontendDir, { recursive: true });

  const backendArtifact = await writeBackendSpec(projectPath, backendDir, entities, scan);
  generatedFiles.push(backendArtifact);

  const frontendArtifact = await writeFrontendSpec(projectPath, frontendDir, entities, scan);
  if (frontendArtifact) {
    generatedFiles.push(frontendArtifact);
  }

  const guidesArtifact = await writeGuideSpec(projectPath, guidesDir, preprocessContext, postprocessContext, entities, generatedFiles);
  generatedFiles.push(guidesArtifact);

  await updateIndex(
    path.join(backendDir, 'index.md'),
    generatedFiles.filter(file => file.layer === 'backend').map(file => ({
      label: toIndexLabel(file.path),
      relativePath: `./${path.basename(file.path)}`,
      description: 'Generated runtime/capability guide from conversion output',
    })),
  );
  await updateIndex(
    path.join(frontendDir, 'index.md'),
    generatedFiles.filter(file => file.layer === 'frontend').map(file => ({
      label: toIndexLabel(file.path),
      relativePath: `./${path.basename(file.path)}`,
      description: 'Generated interaction surface guide from conversion output',
    })),
  );
  await updateIndex(
    path.join(guidesDir, 'index.md'),
    generatedFiles.filter(file => file.layer === 'guides').map(file => ({
      label: toIndexLabel(file.path),
      relativePath: `./${path.basename(file.path)}`,
      description: 'Generated repository state and conversion contract guide',
    })),
  );

  if (entities.every(entity => !entity.analysis)) {
    warnings.push('Enhanced analysis file did not contain any matching entity IDs; grounded docs were generated from repository scan only.');
  }

  return { generatedFiles, warnings };
}

async function writeBackendSpec(
  projectPath: string,
  backendDir: string,
  entities: AnalysisEntity[],
  scan: RepositoryScanResult,
): Promise<GeneratedSpecArtifact> {
  const specs = entities.filter(entity => entity.type === 'spec');
  const language = detectPrimaryLanguage(scan);
  const repoLooksCli = specs.some(entity => matchesAny(entity, CLI_SIGNAL_PATTERN))
    || scan.notableFiles.some(file => /cargo\.toml$|package\.json$|main\.(rs|ts|js|py)$/i.test(file));
  const fileName = determineBackendFileName(language, repoLooksCli);
  const filePath = path.join(backendDir, fileName);

  const modulePaths = collectRankedPaths(
    specs.flatMap(entity => entity.analysis?.dependencies ?? []),
    projectPath,
  );
  const aggregatedConstraints = uniqueLimit(
    specs.flatMap(entity => entity.analysis?.constraints ?? []),
    8,
  );

  const content = `# ${determineBackendTitle(language, repoLooksCli)}

> Generated by Transpec deterministic postprocess from repository scan and enhanced analysis.

## Snapshot

- Primary language: ${language.label}
- Runtime shape: ${repoLooksCli ? 'CLI / terminal workflow' : 'repository runtime'}
- Source roots: ${formatInlineList(collectTopRoots(scan))}
- Legacy source specs: \`.trellis/legacy/specs/\`
- Imported historical work: \`.trellis/tasks/archive/\`

## Primary Source Paths

${renderBulletList(modulePaths.length > 0 ? modulePaths.map(file => `\`${file}\``) : ['No code dependency paths were extracted from enhanced analysis.'])}

## Capability Inventory

${renderCapabilitySections(specs, language.label)}

## Cross-Cutting Constraints

${renderBulletList(aggregatedConstraints.length > 0 ? aggregatedConstraints : ['No shared constraints were extracted yet.'])}

## Refresh Triggers

- Re-run \`transpec apply\` after RAW IR or target emission rules change.
- Re-run \`transpec postprocess\` after enhanced analysis or repository structure changes.
- Update this guide when runtime entrypoints or capability ownership move.
`;

  await fs.writeFile(filePath, `${content.trim()}\n`);
  return { layer: 'backend', path: toProjectRelativePath(projectPath, filePath) };
}

async function writeFrontendSpec(
  projectPath: string,
  frontendDir: string,
  entities: AnalysisEntity[],
  scan: RepositoryScanResult,
): Promise<GeneratedSpecArtifact | null> {
  const uiEntities = entities.filter(entity => matchesAny(entity, UI_SIGNAL_PATTERN));
  const uiPaths = collectRankedPaths(
    uiEntities.flatMap(entity => entity.analysis?.dependencies ?? []),
    projectPath,
  );

  const hasUiSignals = uiEntities.length > 0 || scan.notableFiles.some(file => UI_SIGNAL_PATTERN.test(file));
  if (!hasUiSignals) {
    return null;
  }

  const fileName = determineFrontendFileName(uiEntities, scan);
  const filePath = path.join(frontendDir, fileName);
  const localizationPaths = uiPaths.filter(file => /\bi18n\b|locale|\.toml$/i.test(file));
  const constraints = uniqueLimit(
    uiEntities.flatMap(entity => entity.analysis?.constraints ?? []),
    8,
  );

  const content = `# ${determineFrontendTitle(fileName)}

> Generated by Transpec deterministic postprocess from repository scan and enhanced analysis.

## Interaction Surfaces

${renderCapabilitySections(uiEntities, 'UI surface')}

## Key UI / TUI Paths

${renderBulletList(uiPaths.length > 0 ? uiPaths.map(file => `\`${file}\``) : ['No UI-specific paths were extracted from enhanced analysis.'])}

## Localization and Help Content

${renderBulletList(localizationPaths.length > 0 ? localizationPaths.map(file => `\`${file}\``) : ['No dedicated localization assets were detected.'])}

## Constraints

${renderBulletList(constraints.length > 0 ? constraints : ['No UI-specific constraints were extracted yet.'])}

## Validation Focus

- Verify menu / prompt navigation after structural changes.
- Verify locale resources and help text stay aligned with runtime behavior.
- Refresh this guide when terminal UI state or surface ownership changes.
`;

  await fs.writeFile(filePath, `${content.trim()}\n`);
  return { layer: 'frontend', path: toProjectRelativePath(projectPath, filePath) };
}

async function writeGuideSpec(
  projectPath: string,
  guidesDir: string,
  preprocessContext: PreprocessContextFile,
  postprocessContext: PostprocessContextFile,
  entities: AnalysisEntity[],
  generatedFiles: GeneratedSpecArtifact[],
): Promise<GeneratedSpecArtifact> {
  const filePath = path.join(guidesDir, 'repository-and-conversion-state.md');
  const legacySpecCount = await countMarkdownFiles(path.join(projectPath, '.trellis', 'legacy', 'specs'));
  const { activeTaskCount, archivedTaskCount } = await countTaskDirectories(path.join(projectPath, '.trellis', 'tasks'));
  const taskContextCoverage = await countTaskContextCoverage(path.join(projectPath, '.trellis', 'tasks'));
  const analyzedCount = entities.filter(entity => entity.analysis).length;
  const groundedArtifacts = generatedFiles
    .filter(file => file.layer !== 'guides')
    .map(file => `\`${file.path}\``);

  const content = `# Repository and Conversion State

> Generated by Transpec deterministic postprocess from runtime workspace artifacts.

## Snapshot

- Source framework: ${preprocessContext.sourceFramework}
- Target framework: ${preprocessContext.targetFramework}
- Preprocess entities: ${preprocessContext.entityCount}
- Exported relations: ${preprocessContext.relationCount}
- Enhanced analysis coverage: ${analyzedCount}/${preprocessContext.entityCount}
- Deterministic apply output count: ${postprocessContext.entitiesTransformed}

## Trellis Layout State

- Legacy specs copied to \`.trellis/legacy/specs/\`: ${legacySpecCount}
- Active task directories under \`.trellis/tasks/\`: ${activeTaskCount}
- Archived task directories under \`.trellis/tasks/archive/\`: ${archivedTaskCount}
- Task context files present: ${taskContextCoverage.withAllContextFiles}/${taskContextCoverage.totalTasks}

## Grounded Spec Outputs

${renderBulletList(groundedArtifacts.length > 0 ? groundedArtifacts : ['No grounded spec artifacts were generated.'])}

## Runtime Contract Notes

- Workflow bootstrap file should live at \`.trellis/workflow.md\`.
- Backend / frontend / guide indexes should exist before Trellis skills run.
- Historical OpenSpec archive imports should remain in \`.trellis/tasks/archive/\`, not the active task pool.
- \`.transpec/workspace/preprocess-context.json\` should be refreshed after enhanced analysis changes.

## Recommended Refresh Sequence

1. Run \`transpec preprocess\` to refresh RAW IR and preprocess context.
2. Regenerate \`.transpec/workspace/enhanced-analysis.json\`.
3. Run \`transpec preprocess --skip-convert\` to sync \`hasEnhancedAnalysis\`.
4. Run \`transpec apply\` to emit deterministic target artifacts.
5. Run \`transpec validate\` to confirm the converted project still satisfies Trellis runtime contracts.
`;

  await fs.writeFile(filePath, `${content.trim()}\n`);
  return { layer: 'guides', path: toProjectRelativePath(projectPath, filePath) };
}

async function updateIndex(
  indexPath: string,
  entries: Array<{ label: string; relativePath: string; description: string }>,
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  let content = await fs.readFile(indexPath, 'utf-8');
  let nextContent = content.trimEnd();

  for (const entry of entries) {
    if (content.includes(entry.relativePath)) {
      continue;
    }
    nextContent += `\n- [${entry.label}](${entry.relativePath}) - ${entry.description}`;
  }

  if (nextContent !== content.trimEnd()) {
    await fs.writeFile(indexPath, `${nextContent}\n`);
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

async function scanRepository(projectPath: string): Promise<RepositoryScanResult> {
  const extensionCounts = new Map<string, number>();
  const filesByExtension = new Map<string, string[]>();
  const topLevelDirectoryCounts = new Map<string, number>();
  const notableFiles: string[] = [];

  async function walk(currentPath: string, depth: number): Promise<void> {
    if (depth > 5) {
      return;
    }

    let entries: string[];
    try {
      entries = await fs.readdir(currentPath);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (SKIPPED_SCAN_DIRECTORIES.has(entry)) {
        continue;
      }

      const fullPath = path.join(currentPath, entry);
      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        await walk(fullPath, depth + 1);
        continue;
      }

      const relativePath = toProjectRelativePath(projectPath, fullPath);
      const extension = path.extname(entry).toLowerCase() || '[no-extension]';
      extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);

      const existing = filesByExtension.get(extension) ?? [];
      if (existing.length < 25) {
        existing.push(relativePath);
        filesByExtension.set(extension, existing);
      }

      const root = relativePath.split('/')[0] ?? '.';
      topLevelDirectoryCounts.set(root, (topLevelDirectoryCounts.get(root) ?? 0) + 1);

      if (
        /cargo\.toml$|package\.json$|main\.(rs|ts|js|py)$|setup_ui\.(rs|ts|js|tsx)$|i18n|locale/i.test(relativePath)
      ) {
        notableFiles.push(relativePath);
      }
    }
  }

  await walk(projectPath, 0);
  return { extensionCounts, filesByExtension, topLevelDirectoryCounts, notableFiles };
}

function detectPrimaryLanguage(scan: RepositoryScanResult): LanguageProfile {
  const candidates: Array<{ extension: string; label: string; key: string }> = [
    { extension: '.rs', label: 'Rust', key: 'rust' },
    { extension: '.ts', label: 'TypeScript', key: 'typescript' },
    { extension: '.tsx', label: 'TypeScript', key: 'typescript' },
    { extension: '.js', label: 'JavaScript', key: 'javascript' },
    { extension: '.jsx', label: 'JavaScript', key: 'javascript' },
    { extension: '.py', label: 'Python', key: 'python' },
    { extension: '.go', label: 'Go', key: 'go' },
  ];

  let best: LanguageProfile = { key: 'generic', label: 'Repository' };
  let bestCount = 0;

  for (const candidate of candidates) {
    const count = scan.extensionCounts.get(candidate.extension) ?? 0;
    if (count > bestCount) {
      best = { key: candidate.key, label: candidate.label };
      bestCount = count;
    }
  }

  return best;
}

function determineBackendFileName(language: LanguageProfile, repoLooksCli: boolean): string {
  if (language.key === 'rust' && repoLooksCli) {
    return 'rust-cli-runtime.md';
  }
  if (language.key === 'typescript' && repoLooksCli) {
    return 'typescript-cli-runtime.md';
  }
  if (language.key === 'python' && repoLooksCli) {
    return 'python-cli-runtime.md';
  }
  if (language.key === 'rust') {
    return 'rust-runtime.md';
  }
  return 'repository-runtime.md';
}

function determineBackendTitle(language: LanguageProfile, repoLooksCli: boolean): string {
  if (language.key === 'generic') {
    return 'Repository Runtime';
  }
  return repoLooksCli ? `${language.label} CLI Runtime` : `${language.label} Runtime`;
}

function determineFrontendFileName(entities: AnalysisEntity[], scan: RepositoryScanResult): string {
  const hasTerminalSignal = entities.some(entity => /\bterminal|menu|setup|interactive|tui\b/i.test(entity.name))
    || scan.notableFiles.some(file => /setup_ui|terminal|menu/i.test(file));
  return hasTerminalSignal ? 'terminal-setup-ui.md' : 'interaction-surfaces.md';
}

function determineFrontendTitle(fileName: string): string {
  return fileName === 'terminal-setup-ui.md' ? 'Terminal Setup UI' : 'Interaction Surfaces';
}

function renderCapabilitySections(entities: AnalysisEntity[], fallbackLabel: string): string {
  if (entities.length === 0) {
    return '- No grounded entities were available for this layer.';
  }

  return entities
    .map(entity => {
      const intent = entity.analysis?.intent ?? `No ${fallbackLabel.toLowerCase()} intent extracted yet.`;
      const dependencies = uniqueLimit(entity.analysis?.dependencies ?? [], 4);
      const constraints = uniqueLimit(entity.analysis?.constraints ?? [], 3);
      return `### ${entity.name}

- Intent: ${intent}
- Source: \`${entity.sourcePath}\`
- Dependencies: ${dependencies.length > 0 ? dependencies.map(dep => `\`${dep}\``).join(', ') : 'None extracted'}
- Constraints: ${constraints.length > 0 ? constraints.join('; ') : 'None extracted'}`;
    })
    .join('\n\n');
}

function renderBulletList(items: string[]): string {
  return items.map(item => `- ${item}`).join('\n');
}

function formatInlineList(items: string[]): string {
  return items.length > 0 ? items.join(', ') : 'None detected';
}

function collectRankedPaths(paths: string[], projectPath: string): string[] {
  const counts = new Map<string, number>();

  for (const rawPath of paths) {
    if (!rawPath || rawPath.startsWith('openspec/') || rawPath.startsWith('.trellis/') || rawPath.startsWith('.transpec/')) {
      continue;
    }

    const normalized = normalizeDependencyPath(rawPath, projectPath);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([file]) => file);
}

function normalizeDependencyPath(rawPath: string, projectPath: string): string {
  if (path.isAbsolute(rawPath)) {
    return toProjectRelativePath(projectPath, rawPath);
  }
  return rawPath.replace(/\\/g, '/');
}

function collectTopRoots(scan: RepositoryScanResult): string[] {
  return [...scan.topLevelDirectoryCounts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([root]) => `\`${root}/\``);
}

function uniqueLimit(values: string[], limit: number): string[] {
  return [...new Set(values.filter(Boolean).map(value => value.trim()))].slice(0, limit);
}

function matchesAny(entity: AnalysisEntity, pattern: RegExp): boolean {
  const haystack = [
    entity.name,
    entity.sourcePath,
    entity.analysis?.intent ?? '',
    ...(entity.analysis?.keyPoints ?? []),
    ...(entity.analysis?.dependencies ?? []),
    ...(entity.analysis?.constraints ?? []),
  ].join('\n');
  return pattern.test(haystack);
}

function toIndexLabel(relativePath: string): string {
  const baseName = path.basename(relativePath, '.md');
  return baseName
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function countMarkdownFiles(root: string): Promise<number> {
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
      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (entry.endsWith('.md')) {
        count += 1;
      }
    }
  }

  await walk(root);
  return count;
}

async function countTaskDirectories(tasksRoot: string): Promise<{ activeTaskCount: number; archivedTaskCount: number }> {
  const activeTaskCount = await countImmediateDirectories(tasksRoot, new Set(['archive']));
  const archivedTaskCount = await countArchiveDirectories(path.join(tasksRoot, 'archive'));
  return { activeTaskCount, archivedTaskCount };
}

async function countImmediateDirectories(root: string, ignored: Set<string> = new Set()): Promise<number> {
  try {
    const entries = await fs.readdir(root);
    let count = 0;
    for (const entry of entries) {
      if (ignored.has(entry)) {
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

async function countArchiveDirectories(archiveRoot: string): Promise<number> {
  try {
    const months = await fs.readdir(archiveRoot);
    let count = 0;
    for (const month of months) {
      const monthPath = path.join(archiveRoot, month);
      const stat = await fs.stat(monthPath);
      if (!stat.isDirectory()) {
        continue;
      }
      count += await countImmediateDirectories(monthPath);
    }
    return count;
  } catch {
    return 0;
  }
}

async function countTaskContextCoverage(tasksRoot: string): Promise<{ totalTasks: number; withAllContextFiles: number }> {
  const taskDirs = await collectTaskDirectories(tasksRoot);
  let withAllContextFiles = 0;

  for (const taskDir of taskDirs) {
    const hasAllFiles = await Promise.all([
      fs.access(path.join(taskDir, 'implement.jsonl')).then(() => true).catch(() => false),
      fs.access(path.join(taskDir, 'check.jsonl')).then(() => true).catch(() => false),
      fs.access(path.join(taskDir, 'debug.jsonl')).then(() => true).catch(() => false),
    ]);
    if (hasAllFiles.every(Boolean)) {
      withAllContextFiles += 1;
    }
  }

  return { totalTasks: taskDirs.length, withAllContextFiles };
}

async function collectTaskDirectories(tasksRoot: string): Promise<string[]> {
  const directories: string[] = [];
  const activeRoot = tasksRoot;
  const archiveRoot = path.join(tasksRoot, 'archive');

  try {
    const entries = await fs.readdir(activeRoot);
    for (const entry of entries) {
      if (entry === 'archive') {
        continue;
      }
      const fullPath = path.join(activeRoot, entry);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        directories.push(fullPath);
      }
    }
  } catch {
    // Ignore missing task root.
  }

  try {
    const months = await fs.readdir(archiveRoot);
    for (const month of months) {
      const monthPath = path.join(archiveRoot, month);
      const stat = await fs.stat(monthPath);
      if (!stat.isDirectory()) {
        continue;
      }
      const taskEntries = await fs.readdir(monthPath);
      for (const taskEntry of taskEntries) {
        const taskPath = path.join(monthPath, taskEntry);
        const taskStat = await fs.stat(taskPath);
        if (taskStat.isDirectory()) {
          directories.push(taskPath);
        }
      }
    }
  } catch {
    // Ignore missing archive root.
  }

  return directories;
}
