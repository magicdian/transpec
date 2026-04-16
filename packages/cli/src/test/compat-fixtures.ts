import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  getProjectEnhancedAnalysisPath,
  getProjectPreprocessContextPath,
  materializeProjectSkills,
} from '../core/skill/index.js';
import { buildInitConfigYaml } from '../cli/commands/init.js';

export type FrameworkVariant = 'legacy' | 'current';
export type OpenSpecProfile = 'default' | 'terminal-ui' | 'interactive-cli';

export async function createTempDir(prefix: string, tempDirs: string[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

export async function cleanupTempDirs(tempDirs: string[]): Promise<void> {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
}

export async function writeFixtureFile(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

export async function setupTranspecConfig(
  projectPath: string,
  sourceFramework: 'openspec' | 'trellis',
  targetFramework: 'openspec' | 'trellis',
): Promise<void> {
  await fs.mkdir(path.join(projectPath, '.transpec'), { recursive: true });
  await fs.mkdir(path.join(projectPath, '.transpec', 'ir'), { recursive: true });
  await fs.mkdir(path.join(projectPath, '.transpec', 'logs'), { recursive: true });
  await fs.mkdir(path.join(projectPath, '.transpec', 'workspace'), { recursive: true });
  await materializeProjectSkills(projectPath, sourceFramework, targetFramework);

  const config = buildInitConfigYaml({
    sourceFramework,
    targetFramework,
    ide: 'codex',
    ides: ['codex'],
    mode: 'on-demand',
    codeSpec: targetFramework === 'trellis' ? 'merged' : null,
    preprocessSkillPath: `.transpec/skills/preprocess/${sourceFramework}/SKILL.md`,
    postprocessSkillPath: `.transpec/skills/postprocess/${targetFramework}/SKILL.md`,
    preprocessContextPath: '.transpec/workspace/preprocess-context.json',
    enhancedAnalysisPath: '.transpec/workspace/enhanced-analysis.json',
    postprocessContextPath: '.transpec/workspace/postprocess-context.json',
    logFilePath: '.transpec/logs/transpec.log',
    logLevel: 'info',
    fileLoggingEnabled: false,
    createdAt: '2026-04-15T00:00:00.000Z',
  });

  await writeFixtureFile(projectPath, '.transpec/config.yaml', config);
}

export async function seedEnhancedAnalysis(projectPath: string): Promise<void> {
  const preprocessContext = JSON.parse(
    await fs.readFile(getProjectPreprocessContextPath(projectPath), 'utf-8'),
  ) as {
    sourceFramework: string;
    targetFramework: string;
    entities: Array<{ id: string; name: string }>;
  };

  const entities = Object.fromEntries(
    preprocessContext.entities.map(entity => [
      entity.id,
      {
        intent: `Intent for ${entity.name}`,
        keyPoints: [`Key point for ${entity.name}`],
        dependencies: [],
        constraints: [],
        requirement: [],
        design: [],
        implementNote: [],
      },
    ]),
  );

  await fs.writeFile(
    getProjectEnhancedAnalysisPath(projectPath),
    JSON.stringify(
      {
        version: '1.0.0',
        generatedAt: '2026-04-15T00:00:00.000Z',
        sourceFramework: preprocessContext.sourceFramework,
        targetFramework: preprocessContext.targetFramework,
        entities,
      },
      null,
      2,
    ),
  );
}

export async function createOpenSpecProject(
  projectPath: string,
  variant: FrameworkVariant,
  location: 'active' | 'archive' = 'active',
  profile: OpenSpecProfile = 'default',
): Promise<void> {
  await writeFixtureFile(projectPath, 'openspec/config.yaml', 'name: sample\n');
  const isTerminalUiProfile = profile === 'terminal-ui';
  const isInteractiveCliProfile = profile === 'interactive-cli';
  const specSlug = isTerminalUiProfile
    ? 'interactive-setup'
    : isInteractiveCliProfile
      ? 'guided-cli-install'
      : 'compatibility-flow';
  const specTitle = isTerminalUiProfile
    ? 'Interactive Setup'
    : isInteractiveCliProfile
      ? 'Guided CLI Install'
      : 'Compatibility Flow';
  await writeFixtureFile(
    projectPath,
    `openspec/specs/${specSlug}/spec.md`,
    variant === 'legacy'
      ? `# ${specTitle}\n\n### Requirement: Stable Output\nThe system SHALL stay stable.\n`
      : `# ${specTitle}\n\n### Stable Output\nThe system SHALL stay stable.\n`,
  );

  const changeBody = isTerminalUiProfile
    ? `# Interaction Setup Navigation

## ADDED Requirements
### Terminal Setup UI
The system SHALL support menuconfig-style terminal setup navigation.

## MODIFIED Requirements
### Interactive Help Panel
The system SHALL show contextual help inside setup menus.
`
    : isInteractiveCliProfile
      ? `# Guided CLI Install

## ADDED Requirements
### Interactive Install Prompt
The system SHALL show an interactive terminal confirmation prompt before installing shell completion.

## MODIFIED Requirements
### Help Output
The system SHALL print follow-up help text after the guided install completes.
`
    : variant === 'legacy'
      ? `# Legacy Style Change

## ADDED Requirements
### Requirement: Legacy Header
The system SHALL preserve legacy requirement headings within the compatibility flow.

## MODIFIED Requirements
### Requirement: Existing Behavior
The system SHALL preserve modified requirement headings within the compatibility flow.
`
    : `# Compact Style Change

## ADDED Requirements
### Compact Header
The system SHALL accept compact requirement headings within the compatibility flow.

## MODIFIED Requirements
### Existing Behavior
The system SHALL keep compact modified headings compatible within the compatibility flow.
`;

  const changeSlug = isTerminalUiProfile
    ? '2026-04-15-interaction-setup-navigation'
    : isInteractiveCliProfile
      ? '2026-04-15-guided-cli-install'
    : variant === 'legacy'
      ? '2026-04-15-legacy-style'
      : '2026-04-15-compact-style';
  const changeBaseDir = location === 'archive'
    ? `openspec/changes/archive/${changeSlug}`
    : `openspec/changes/${changeSlug}`;

  await writeFixtureFile(
    projectPath,
    `${changeBaseDir}/proposal.md`,
    variant === 'current'
      ? `${changeBody}
\n\`\`\`md
### Requirement: Example In Code Fence
This should stay invisible to the parser.
\`\`\`
`
      : changeBody,
  );
  await writeFixtureFile(
    projectPath,
    `${changeBaseDir}/tasks.md`,
    isTerminalUiProfile
      ? `# tasks for ${changeSlug}

## 概览
重构交互式 setup 为单栏、逐级进入的 terminal UI，并补充 contextual help。

## 任务清单
1. Setup navigation
   - [x] 1.1 Convert setup to hierarchical terminal UI
   - 估时：0.5 天
2. Help panel
   - [ ] 2.1 Add contextual help panel

## 验收准则
- setup 菜单支持进入、返回与快捷键提示

## 后续可选任务
- add locale-specific help copy
`
      : isInteractiveCliProfile
        ? `# tasks for ${changeSlug}

## 概览
为 CLI 增加 interactive install prompt 与 help output，保持命令式确认流转。

## 任务清单
1. Install prompt
   - [x] 1.1 Add interactive confirmation prompt for shell completion installation
2. Follow-up help
   - [ ] 2.1 Print guided help after installation completes
`
      : `# tasks for ${changeSlug}

1. Runtime flow
   - [x] 1.1 Prepare runtime flow
2. Compatibility validation
   - [ ] 2.1 Verify compatibility
3. Documentation follow-up
   - Capture migration notes for future maintainers
`,
  );
  await writeFixtureFile(
    projectPath,
    `${changeBaseDir}/.openspec.yaml`,
    `name: ${isTerminalUiProfile ? 'interaction-setup-navigation' : isInteractiveCliProfile ? 'guided-cli-install' : variant === 'legacy' ? 'legacy-style' : 'compact-style'}
title: ${isTerminalUiProfile ? 'Interaction Setup Navigation' : isInteractiveCliProfile ? 'Guided CLI Install' : variant === 'legacy' ? 'Legacy Style Change' : 'Compact Style Change'}
owner: TBD
description: ${isTerminalUiProfile ? 'Refine setup terminal UI navigation and contextual help.' : isInteractiveCliProfile ? 'Add guided CLI installation prompts and follow-up help output.' : 'Preserve OpenSpec compatibility through Trellis conversion.'}
status: draft
`,
  );
}

export async function createTrellisProject(projectPath: string, variant: FrameworkVariant): Promise<void> {
  await writeFixtureFile(
    projectPath,
    '.trellis/config.yaml',
    variant === 'legacy'
      ? 'version: 0.3.0\n'
      : `version: 0.4.0
default_package: cli
packages:
  cli:
    path: packages/cli
    type: backend
`,
  );

  if (variant === 'legacy') {
    await writeFixtureFile(projectPath, '.trellis/spec/backend/index.md', '# Backend\n');
    await writeFixtureFile(projectPath, '.trellis/spec/backend/error-handling.md', '# Errors\n');
  } else {
    await writeFixtureFile(projectPath, '.trellis/spec/cli/backend/index.md', '# Backend\n');
    await writeFixtureFile(projectPath, '.trellis/spec/cli/backend/error-handling.md', '# Errors\n');
  }

  if (variant === 'current') {
    await writeFixtureFile(projectPath, '.trellis/.version', '0.4.0\n');
    await writeFixtureFile(projectPath, '.trellis/.current-task', '.trellis/tasks/04-15-current-task\n');
    await writeFixtureFile(projectPath, '.trellis/workflow.md', '# Workflow\n');
    await writeFixtureFile(projectPath, '.agents/skills/start/SKILL.md', '# Start\n');
    await writeFixtureFile(projectPath, '.trellis/spec/guides/index.md', '# Guides\n');
  }

  const taskDir = variant === 'legacy' ? '04-10-legacy-task' : '04-15-current-task';
  const taskTitle = variant === 'legacy' ? 'Legacy Task' : 'Current Task';

  await writeFixtureFile(
    projectPath,
    `.trellis/tasks/${taskDir}/prd.md`,
    variant === 'legacy'
      ? `# ${taskTitle}

## Goal
Keep legacy Trellis projects parseable.

Status: active
Priority: P1
`
      : `---
createdAt: "2026-04-15T00:00:00.000Z"
---
# ${taskTitle}

## Goal
Parse Trellis projects with shared skills and current-task markers.
`,
  );
  await writeFixtureFile(
    projectPath,
    `.trellis/tasks/${taskDir}/task.json`,
    JSON.stringify(
      variant === 'legacy'
        ? { id: 'legacy-task', status: 'active', title: taskTitle }
        : {
            id: 'current-task',
            status: 'pending',
            title: taskTitle,
            current_phase: 2,
            next_action: [
              { phase: 3, action: 'implement' },
              { phase: 4, action: 'check' },
            ],
            children: ['04-15-current-task-subtask'],
            parent: null,
          },
      null,
      2,
    ),
  );
}
