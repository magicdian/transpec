/**
 * init command - Initialize transpec in project
 *
 * Interactive menuconfig-style flow:
 * 1. Show welcome banner
 * 2. Open a single-column configuration menu
 * 3. Allow users to edit/revisit settings in any order
 * 4. Confirm and create configuration
 */

import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import ora from 'ora';
import { frameworkRegistry } from '../../core/framework/index.js';
import { IdeRegistry, isInteractive } from '../../core/ide/index.js';
import { ClaudeCodeAdapter, CursorAdapter, CodexAdapter, OpenCodeAdapter } from '../../core/ide/adapters/index.js';
import { LogModules, getLogger } from '../../core/logging/index.js';
import { FrameworkType } from '../../core/ir/types.js';
import {
  getProjectEnhancedAnalysisPath,
  getProjectFrameworkSkillPath,
  getProjectLogFilePath,
  getProjectPostprocessContextPath,
  getProjectPreprocessContextPath,
  materializeProjectSkills,
  toProjectRelativePath,
} from '../../core/skill/index.js';
import { configureProjectLogger } from '../utils/logging.js';

const logger = getLogger(LogModules.CLI);

const KNOWN_IDES = ['claude-code', 'cursor', 'codex', 'opencode'] as const;
const KNOWN_MODES = ['on-demand', 'full', 'sampling'] as const;
const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const;
const ESCAPE_KEY_TIMEOUT_MS = 35;

type KnownIde = typeof KNOWN_IDES[number];
type AnalysisMode = typeof KNOWN_MODES[number];
type LogLevelValue = typeof LOG_LEVELS[number];

interface DetectedFramework {
  framework: string;
  entityCount: number;
}

interface InitDraftConfig {
  sourceFramework: string;
  targetFramework: string;
  ides: KnownIde[];
  mode: AnalysisMode;
  codeSpec: CodeSpecOption | null;
  fileLoggingEnabled: boolean;
  logLevel: LogLevelValue;
}

interface BuildConfigYamlInput {
  sourceFramework: string;
  targetFramework: string;
  ide: string;
  ides: string[];
  mode: AnalysisMode;
  codeSpec: CodeSpecOption | null;
  preprocessSkillPath: string;
  postprocessSkillPath: string;
  preprocessContextPath: string;
  enhancedAnalysisPath: string;
  postprocessContextPath: string;
  logFilePath: string;
  logLevel: LogLevelValue;
  fileLoggingEnabled: boolean;
  createdAt: string;
}

export interface InitOptions {
  source?: string;
  target?: string;
  ide?: string;
  mode?: string;
  yes?: boolean;
  verbose?: boolean;
}

type MenuRow =
  | { kind: 'section'; label: string }
  | { kind: 'info'; label: string; value?: string }
  | { kind: 'action'; id: string; label: string; value?: string }
  | { kind: 'single'; id: string; label: string; selected: boolean }
  | { kind: 'multi'; id: string; label: string; selected: boolean }
  | { kind: 'toggle'; id: string; label: string; enabled: boolean }
  | { kind: 'toggle-entry'; id: string; label: string; enabled: boolean; value?: string };

type FocusableMenuRow = Extract<MenuRow, { id: string }>;

interface MenuFrame {
  title: string;
  subtitle?: string;
  rows: MenuRow[];
  footer?: string;
}

type MenuKey = 'up' | 'down' | 'enter' | 'space' | 'escape' | 'ctrl-c' | 'other';

interface MenuEvent {
  type: 'enter' | 'space' | 'escape' | 'ctrl-c';
  focusedRowId: string | null;
  row: FocusableMenuRow | null;
}

/**
 * ASCII art banner for transpec
 */
function showBanner(): void {
  console.log(chalk.cyan(`
   ██████╗ ███████╗██╗   ██╗    ███████╗███████╗ ██████╗████████╗ ██████╗ ███████╗
   ██╔══██╗██╔════╝██║   ██║    ██╔════╝██╔════╝██╔════╝╚══██╔══╝██╔═══██╗██╔════╝
   ██║  ██║█████╗  ██║   ██║    █████╗  █████╗  ██║        ██║   ██║   ██║█████╗
   ██║  ██║██╔══╝  ╚██╗ ██╔╝    ██╔══╝  ██╔══╝  ██║        ██║   ██║   ██║██╔══╝
   ██████╔╝███████╗ ╚████╔╝     ███████╗██║     ╚██████╗   ██║   ╚██████╔╝██║
   ╚═════╝ ╚══════╝  ╚═══╝      ╚══════╝╚═╝      ╚═════╝   ╚═╝    ╚═════╝ ╚═╝
  `));
  console.log(chalk.gray('  Universal spec conversion tool\n'));
}

function getDefaultTargetFramework(sourceFramework: string): string {
  const supportedFrameworks = frameworkRegistry.getSupportedFrameworks();
  const preferred = sourceFramework === 'openspec' ? 'trellis' : 'openspec';

  if (preferred !== sourceFramework && supportedFrameworks.includes(preferred)) {
    return preferred;
  }

  return supportedFrameworks.find((fw) => fw !== sourceFramework) ?? sourceFramework;
}

function normalizeMode(mode: string | undefined): AnalysisMode {
  if (!mode) {
    return 'on-demand';
  }

  if ((KNOWN_MODES as readonly string[]).includes(mode)) {
    return mode as AnalysisMode;
  }

  return 'on-demand';
}

function mapIdeDisplayName(ideId: string): string {
  switch (ideId) {
    case 'claude-code':
      return 'Claude Code';
    case 'cursor':
      return 'Cursor';
    case 'codex':
      return 'Codex';
    case 'opencode':
      return 'OpenCode';
    default:
      return ideId;
  }
}

function isKnownIde(value: string): value is KnownIde {
  return (KNOWN_IDES as readonly string[]).includes(value);
}

export function parseIdeOption(ideOption: string | undefined): KnownIde[] {
  if (!ideOption) {
    return [];
  }

  const raw = ideOption
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);

  if (raw.length === 0 || raw.includes('none')) {
    return [];
  }

  const deduped = Array.from(new Set(raw));
  return deduped.filter(isKnownIde);
}

function formatIdeSummary(ides: string[]): string {
  if (ides.length === 0) {
    return 'None (CLI only)';
  }

  return ides.map(mapIdeDisplayName).join(', ');
}

function formatCodeSpecLabel(codeSpec: CodeSpecOption | null): string {
  if (!codeSpec) {
    return 'N/A';
  }

  const codeSpecLabels: Record<CodeSpecOption, string> = {
    merged: 'Merged',
    'by-language': 'By Language',
    'main-only': 'Primary Language Only',
  };

  return codeSpecLabels[codeSpec];
}

function cloneDraft(draft: InitDraftConfig): InitDraftConfig {
  return {
    ...draft,
    ides: [...draft.ides],
  };
}

function isDraftDirty(current: InitDraftConfig, baseline: InitDraftConfig): boolean {
  return current.sourceFramework !== baseline.sourceFramework
    || current.targetFramework !== baseline.targetFramework
    || current.mode !== baseline.mode
    || current.codeSpec !== baseline.codeSpec
    || current.fileLoggingEnabled !== baseline.fileLoggingEnabled
    || current.logLevel !== baseline.logLevel
    || current.ides.join(',') !== baseline.ides.join(',');
}

function supportsCodeSpecs(targetFramework: string): boolean {
  return targetFramework === 'trellis';
}

function ensureTargetFrameworkValid(draft: InitDraftConfig): void {
  const targetChoices = frameworkRegistry
    .getSupportedFrameworks()
    .filter((framework) => framework !== draft.sourceFramework)
    .map((framework) => framework as string);

  if (targetChoices.length === 0) {
    return;
  }

  if (!targetChoices.includes(draft.targetFramework)) {
    draft.targetFramework = targetChoices[0];
  }

  if (!supportsCodeSpecs(draft.targetFramework)) {
    draft.codeSpec = null;
  } else if (!draft.codeSpec) {
    draft.codeSpec = 'merged';
  }
}

export function createInitialDraftConfig(
  options: InitOptions,
  detectedFrameworks: DetectedFramework[],
): InitDraftConfig {
  const sourceFramework = options.source ?? detectedFrameworks[0].framework;
  const optionTarget = options.target;
  const mode = normalizeMode(options.mode);

  const targetFramework = optionTarget ?? getDefaultTargetFramework(sourceFramework);
  const ides = parseIdeOption(options.ide);
  const codeSpec = supportsCodeSpecs(targetFramework) ? 'merged' : null;

  return {
    sourceFramework,
    targetFramework,
    ides,
    mode,
    codeSpec,
    fileLoggingEnabled: true,
    logLevel: options.verbose ? 'debug' : 'info',
  };
}

function clearScreen(): void {
  process.stdout.write('\u001b[2J\u001b[H');
}

function isFocusableRow(row: MenuRow): row is FocusableMenuRow {
  return row.kind === 'action'
    || row.kind === 'single'
    || row.kind === 'multi'
    || row.kind === 'toggle'
    || row.kind === 'toggle-entry';
}

function renderRow(row: MenuRow, focused: boolean): string {
  const marker = focused && isFocusableRow(row) ? '>' : ' ';

  if (row.kind === 'section') {
    return `${marker} --- ${row.label}`;
  }

  if (row.kind === 'info') {
    return `${marker} --- ${row.label}${row.value ? ` = ${row.value}` : ''}`;
  }

  if (row.kind === 'action') {
    return `${marker} ${row.label}${row.value ? ` (${row.value})` : ''} --->`;
  }

  if (row.kind === 'single') {
    return `${marker} ${row.selected ? '<*>' : '< >'} ${row.label}`;
  }

  if (row.kind === 'toggle') {
    return `${marker} ${row.enabled ? '<*>' : '< >'} ${row.label}`;
  }

  if (row.kind === 'toggle-entry') {
    const valuePart = row.value ? ` (${row.value})` : '';
    return `${marker} ${row.enabled ? '<*>' : '< >'} ${row.label}${valuePart}${row.enabled ? ' --->' : ''}`;
  }

  return `${marker} ${row.selected ? '[*]' : '[ ]'} ${row.label}`;
}

function renderFrame(frame: MenuFrame, focusedRowId: string | null): void {
  clearScreen();

  const title = chalk.bold(frame.title);
  console.log(title);

  if (frame.subtitle) {
    console.log(chalk.gray(frame.subtitle));
  }

  console.log();

  for (const row of frame.rows) {
    const isFocused = isFocusableRow(row) && row.id === focusedRowId;
    const rendered = renderRow(row, isFocused);
    console.log(isFocused ? chalk.cyan(rendered) : rendered);
  }

  if (frame.footer) {
    console.log();
    console.log(chalk.gray(frame.footer));
  }
}

function normalizeKeyInput(key: readline.Key): MenuKey {
  if (key.ctrl && key.name === 'c') {
    return 'ctrl-c';
  }

  if (key.name === 'up') {
    return 'up';
  }

  if (key.name === 'down') {
    return 'down';
  }

  if (key.name === 'return' || key.name === 'enter') {
    return 'enter';
  }

  if (key.name === 'space') {
    return 'space';
  }

  if (key.name === 'escape') {
    return 'escape';
  }

  return 'other';
}

async function waitForKeypress(): Promise<MenuKey> {
  return new Promise((resolve) => {
    const onKeypress = (_input: string, key: readline.Key) => {
      process.stdin.off('keypress', onKeypress);
      resolve(normalizeKeyInput(key));
    };

    process.stdin.on('keypress', onKeypress);
  });
}

function pickInitialFocusRowId(rows: MenuRow[], preferred: string | null): string | null {
  const focusableRows = rows.filter(isFocusableRow);

  if (focusableRows.length === 0) {
    return null;
  }

  if (preferred && focusableRows.some((row) => row.id === preferred)) {
    return preferred;
  }

  return focusableRows[0].id;
}

function nextFocusRowId(rows: MenuRow[], current: string | null, direction: 'up' | 'down'): string | null {
  const focusableRows = rows.filter(isFocusableRow);

  if (focusableRows.length === 0) {
    return null;
  }

  const currentIndex = current
    ? focusableRows.findIndex((row) => row.id === current)
    : -1;

  if (currentIndex === -1) {
    return focusableRows[0].id;
  }

  if (direction === 'up') {
    const nextIndex = currentIndex === 0 ? focusableRows.length - 1 : currentIndex - 1;
    return focusableRows[nextIndex].id;
  }

  const nextIndex = currentIndex === focusableRows.length - 1 ? 0 : currentIndex + 1;
  return focusableRows[nextIndex].id;
}

async function waitForMenuEvent(
  frameBuilder: () => MenuFrame,
  focusRowId: string | null,
): Promise<MenuEvent> {
  let currentFocus = focusRowId;

  while (true) {
    const frame = frameBuilder();
    currentFocus = pickInitialFocusRowId(frame.rows, currentFocus);

    renderFrame(frame, currentFocus);

    const key = await waitForKeypress();

    if (key === 'up' || key === 'down') {
      currentFocus = nextFocusRowId(frame.rows, currentFocus, key);
      continue;
    }

    if (key === 'escape') {
      const focusedRow = currentFocus
        ? frame.rows.filter(isFocusableRow).find((row) => row.id === currentFocus) ?? null
        : null;

      return {
        type: 'escape',
        focusedRowId: currentFocus,
        row: focusedRow,
      };
    }

    if (key === 'ctrl-c') {
      const focusedRow = currentFocus
        ? frame.rows.filter(isFocusableRow).find((row) => row.id === currentFocus) ?? null
        : null;

      return {
        type: 'ctrl-c',
        focusedRowId: currentFocus,
        row: focusedRow,
      };
    }

    if (key === 'enter' || key === 'space') {
      const focusedRow = currentFocus
        ? frame.rows.filter(isFocusableRow).find((row) => row.id === currentFocus) ?? null
        : null;

      return {
        type: key,
        focusedRowId: currentFocus,
        row: focusedRow,
      };
    }
  }
}

async function runIdeMenu(draft: InitDraftConfig): Promise<'back' | 'exit'> {
  let focusRowId: string | null = draft.ides[0] ?? KNOWN_IDES[0];

  while (true) {
    const event = await waitForMenuEvent(
      () => ({
        title: 'IDE / Agent Setup',
        subtitle: 'Space toggles options. Esc returns to previous menu.',
        rows: [
          { kind: 'section', label: 'IDE Selection' },
          ...KNOWN_IDES.map<MenuRow>((ide) => ({
            kind: 'multi',
            id: ide,
            label: mapIdeDisplayName(ide),
            selected: draft.ides.includes(ide),
          })),
        ],
        footer: 'Enter does not toggle multi-select rows.',
      }),
      focusRowId,
    );

    focusRowId = event.focusedRowId;

    if (event.type === 'ctrl-c') {
      return 'exit';
    }

    if (event.type === 'escape') {
      return 'back';
    }

    if (event.type === 'space' && event.row && event.row.kind === 'multi') {
      const ide = event.row.id as KnownIde;
      if (draft.ides.includes(ide)) {
        draft.ides = draft.ides.filter((item) => item !== ide);
      } else {
        draft.ides = [...draft.ides, ide];
      }
    }
  }
}

async function runExclusiveChoiceMenu<T extends string>(
  title: string,
  subtitle: string,
  options: Array<{ value: T; label: string }>,
  getValue: () => T,
  setValue: (value: T) => void,
): Promise<'back' | 'exit'> {
  let focusRowId: string | null = getValue();

  while (true) {
    const event = await waitForMenuEvent(
      () => ({
        title,
        subtitle,
        rows: [
          { kind: 'section', label: 'Single Choice' },
          ...options.map<MenuRow>((option) => ({
            kind: 'single',
            id: option.value,
            label: option.label,
            selected: getValue() === option.value,
          })),
        ],
        footer: 'Space selects. Enter does not change selection. Esc returns.',
      }),
      focusRowId,
    );

    focusRowId = event.focusedRowId;

    if (event.type === 'ctrl-c') {
      return 'exit';
    }

    if (event.type === 'escape') {
      return 'back';
    }

    if (event.type === 'space' && event.row && event.row.kind === 'single') {
      setValue(event.row.id as T);
    }
  }
}

async function runSourceMenu(
  draft: InitDraftConfig,
  detectedFrameworks: DetectedFramework[],
): Promise<'back' | 'exit'> {
  return runExclusiveChoiceMenu(
    'Source Framework',
    'Space selects source framework. Esc returns.',
    detectedFrameworks.map((framework) => ({
      value: framework.framework,
      label: `${framework.framework} (${framework.entityCount} entities)`,
    })),
    () => draft.sourceFramework,
    (value) => {
      draft.sourceFramework = value;
      ensureTargetFrameworkValid(draft);
    },
  );
}

async function runTargetMenu(draft: InitDraftConfig): Promise<'back' | 'exit'> {
  const options = frameworkRegistry
    .getSupportedFrameworks()
    .filter((framework) => framework !== draft.sourceFramework)
    .map((framework) => ({
      value: framework,
      label: framework,
    }));

  if (options.length === 0) {
    let focusRowId: string | null = null;
    while (true) {
      const event = await waitForMenuEvent(
        () => ({
          title: 'Target Framework',
          subtitle: 'No target options available for current source framework.',
          rows: [
            { kind: 'info', label: 'No valid target framework found' },
          ],
          footer: 'Esc returns to previous menu.',
        }),
        focusRowId,
      );

      focusRowId = event.focusedRowId;

      if (event.type === 'ctrl-c') {
        return 'exit';
      }

      if (event.type === 'escape') {
        return 'back';
      }
    }
  }

  return runExclusiveChoiceMenu(
    'Target Framework',
    'Space selects target framework. Esc returns.',
    options,
    () => draft.targetFramework,
    (value) => {
      draft.targetFramework = value;
      if (!supportsCodeSpecs(value)) {
        draft.codeSpec = null;
      } else if (!draft.codeSpec) {
        draft.codeSpec = 'merged';
      }
    },
  );
}

async function runModeMenu(draft: InitDraftConfig): Promise<'back' | 'exit'> {
  return runExclusiveChoiceMenu(
    'Analysis Mode',
    'Space selects analysis mode. Esc returns.',
    [
      { value: 'on-demand', label: 'On-demand (analyze when needed)' },
      { value: 'full', label: 'Full (analyze all entities)' },
      { value: 'sampling', label: 'Sampling (analyze sample entities)' },
    ],
    () => draft.mode,
    (value) => {
      draft.mode = value;
    },
  );
}

async function runCodeSpecMenu(draft: InitDraftConfig): Promise<'back' | 'exit'> {
  if (!supportsCodeSpecs(draft.targetFramework)) {
    let focusRowId: string | null = null;
    while (true) {
      const event = await waitForMenuEvent(
        () => ({
          title: 'Code Spec Organization',
          subtitle: 'Current target does not support code specs.',
          rows: [
            { kind: 'info', label: 'Code spec is unavailable for current target' },
          ],
          footer: 'Esc returns to previous menu.',
        }),
        focusRowId,
      );

      focusRowId = event.focusedRowId;

      if (event.type === 'ctrl-c') {
        return 'exit';
      }

      if (event.type === 'escape') {
        return 'back';
      }
    }
  }

  if (!draft.codeSpec) {
    draft.codeSpec = 'merged';
  }

  return runExclusiveChoiceMenu(
    'Code Spec Organization',
    'Space selects code spec layout. Esc returns.',
    [
      { value: 'merged', label: 'Merged - All language specs in one directory' },
      { value: 'by-language', label: 'By Language - Specs grouped by language' },
      { value: 'main-only', label: 'Primary Language Only - Primary language only' },
    ],
    () => draft.codeSpec ?? 'merged',
    (value) => {
      draft.codeSpec = value;
    },
  );
}

async function runLogLevelMenu(draft: InitDraftConfig): Promise<'back' | 'exit'> {
  return runExclusiveChoiceMenu(
    'Log Level',
    'Space selects log level. Esc returns.',
    LOG_LEVELS.map((level) => ({
      value: level,
      label: level,
    })),
    () => draft.logLevel,
    (value) => {
      draft.logLevel = value;
    },
  );
}

function buildSummaryRows(draft: InitDraftConfig): MenuRow[] {
  return [
    { kind: 'section', label: 'Configuration Summary' },
    { kind: 'info', label: 'Source Framework', value: draft.sourceFramework },
    { kind: 'info', label: 'Target Framework', value: draft.targetFramework },
    { kind: 'info', label: 'IDE(s)', value: formatIdeSummary(draft.ides) },
    { kind: 'info', label: 'Mode', value: draft.mode },
    { kind: 'info', label: 'Code Spec', value: formatCodeSpecLabel(draft.codeSpec) },
    { kind: 'info', label: 'File Logging', value: draft.fileLoggingEnabled ? 'Enabled' : 'Disabled' },
    { kind: 'info', label: 'Log Level', value: draft.logLevel },
    { kind: 'section', label: 'Actions' },
    { kind: 'action', id: 'apply', label: 'Save and Initialize' },
    { kind: 'action', id: 'back', label: 'Back' },
  ];
}

async function runSummaryMenu(draft: InitDraftConfig): Promise<'apply' | 'back' | 'exit'> {
  let focusRowId: string | null = 'apply';

  while (true) {
    const event = await waitForMenuEvent(
      () => ({
        title: 'Summary',
        subtitle: 'Review settings. Enter selects an action. Esc returns.',
        rows: buildSummaryRows(draft),
      }),
      focusRowId,
    );

    focusRowId = event.focusedRowId;

    if (event.type === 'ctrl-c') {
      return 'exit';
    }

    if (event.type === 'escape') {
      return 'back';
    }

    if (event.type === 'enter' && event.row && event.row.kind === 'action') {
      if (event.row.id === 'apply') {
        return 'apply';
      }

      if (event.row.id === 'back') {
        return 'back';
      }
    }
  }
}

async function runExitMenu(hasUnsavedChanges: boolean): Promise<'apply' | 'discard' | 'continue' | 'exit'> {
  if (!hasUnsavedChanges) {
    return 'discard';
  }

  let focusRowId: string | null = 'continue';

  while (true) {
    const event = await waitForMenuEvent(
      () => ({
        title: 'Unsaved Changes',
        subtitle: 'Enter selects an action. Esc continues editing.',
        rows: [
          { kind: 'action', id: 'apply', label: 'Save and Initialize' },
          { kind: 'action', id: 'discard', label: 'Discard and Exit' },
          { kind: 'action', id: 'continue', label: 'Continue Editing' },
        ],
      }),
      focusRowId,
    );

    focusRowId = event.focusedRowId;

    if (event.type === 'ctrl-c') {
      return 'exit';
    }

    if (event.type === 'escape') {
      return 'continue';
    }

    if (event.type === 'enter' && event.row && event.row.kind === 'action') {
      if (event.row.id === 'apply' || event.row.id === 'discard' || event.row.id === 'continue') {
        return event.row.id;
      }
    }
  }
}

async function runMenuConfig(
  initialDraft: InitDraftConfig,
  detectedFrameworks: DetectedFramework[],
): Promise<InitDraftConfig | null> {
  const draft = cloneDraft(initialDraft);
  const baseline = cloneDraft(initialDraft);
  let focusRowId: string | null = 'edit-ides';

  while (true) {
    ensureTargetFrameworkValid(draft);

    const dirty = isDraftDirty(draft, baseline);

    const rows: MenuRow[] = [
      { kind: 'section', label: 'Configuration' },
      {
        kind: 'action',
        id: 'edit-ides',
        label: 'IDE / Agent Setup',
        value: formatIdeSummary(draft.ides),
      },
      {
        kind: 'action',
        id: 'edit-source',
        label: 'Source Framework',
        value: draft.sourceFramework,
      },
      {
        kind: 'action',
        id: 'edit-target',
        label: 'Target Framework',
        value: draft.targetFramework,
      },
      {
        kind: 'action',
        id: 'edit-mode',
        label: 'Analysis Mode',
        value: draft.mode,
      },
      {
        kind: 'action',
        id: 'edit-code-spec',
        label: 'Code Spec Organization',
        value: formatCodeSpecLabel(draft.codeSpec),
      },
      {
        kind: 'toggle-entry',
        id: 'edit-logging',
        label: 'Enable File Logging',
        enabled: draft.fileLoggingEnabled,
        value: draft.fileLoggingEnabled ? draft.logLevel : undefined,
      },
      { kind: 'section', label: 'Actions' },
      { kind: 'action', id: 'view-summary', label: 'View Summary' },
      { kind: 'action', id: 'apply', label: 'Save and Initialize' },
      { kind: 'action', id: 'cancel', label: `Exit${dirty ? ' (unsaved changes)' : ''}` },
    ];

    const event = await waitForMenuEvent(
      () => ({
        title: `Menuconfig - transpec init${dirty ? ' *' : ''}`,
        subtitle: 'Enter opens submenu/action. Space toggles inside choice/toggle menus. Esc returns one level.',
        rows,
      }),
      focusRowId,
    );

    focusRowId = event.focusedRowId;

    if (event.type === 'ctrl-c') {
      return null;
    }

    if (event.type === 'escape') {
      // Root menu: Esc does nothing by request.
      continue;
    }

    if (!event.row) {
      continue;
    }

    if (event.type === 'space' && event.row.kind === 'toggle-entry' && event.row.id === 'edit-logging') {
      draft.fileLoggingEnabled = !draft.fileLoggingEnabled;
      focusRowId = 'edit-logging';
      continue;
    }

    if (event.type !== 'enter' || event.row.kind === 'single' || event.row.kind === 'multi' || event.row.kind === 'toggle') {
      continue;
    }

    if (event.row.id === 'edit-ides') {
      const result = await runIdeMenu(draft);
      if (result === 'exit') {
        return null;
      }
      focusRowId = 'edit-ides';
      continue;
    }

    if (event.row.id === 'edit-source') {
      const result = await runSourceMenu(draft, detectedFrameworks);
      if (result === 'exit') {
        return null;
      }
      focusRowId = 'edit-source';
      continue;
    }

    if (event.row.id === 'edit-target') {
      const result = await runTargetMenu(draft);
      if (result === 'exit') {
        return null;
      }
      focusRowId = 'edit-target';
      continue;
    }

    if (event.row.id === 'edit-mode') {
      const result = await runModeMenu(draft);
      if (result === 'exit') {
        return null;
      }
      focusRowId = 'edit-mode';
      continue;
    }

    if (event.row.id === 'edit-code-spec') {
      const result = await runCodeSpecMenu(draft);
      if (result === 'exit') {
        return null;
      }
      focusRowId = 'edit-code-spec';
      continue;
    }

    if (event.row.id === 'edit-logging') {
      if (draft.fileLoggingEnabled) {
        const result = await runLogLevelMenu(draft);
        if (result === 'exit') {
          return null;
        }
      }
      focusRowId = 'edit-logging';
      continue;
    }

    if (event.row.id === 'view-summary') {
      const result = await runSummaryMenu(draft);
      if (result === 'exit') {
        return null;
      }
      if (result === 'apply') {
        return draft;
      }
      continue;
    }

    if (event.row.id === 'apply') {
      return draft;
    }

    if (event.row.id === 'cancel') {
      const exitDecision = await runExitMenu(dirty);
      if (exitDecision === 'exit' || exitDecision === 'discard') {
        return null;
      }
      if (exitDecision === 'apply') {
        return draft;
      }
    }
  }
}

async function runMenuConfigInTerminal(
  initialDraft: InitDraftConfig,
  detectedFrameworks: DetectedFramework[],
): Promise<InitDraftConfig | null> {
  const stdin = process.stdin;

  if (!stdin.isTTY || !stdin.setRawMode) {
    return initialDraft;
  }

  // Reduce Node's default ambiguous escape-sequence timeout (500ms) so Esc feels instant.
  const keypressConfig = { escapeCodeTimeout: ESCAPE_KEY_TIMEOUT_MS };
  readline.emitKeypressEvents(stdin, keypressConfig as unknown as readline.Interface);

  const rawStateAwareStdin = stdin as NodeJS.ReadStream & { isRaw?: boolean };
  const previousRawState = Boolean(rawStateAwareStdin.isRaw);

  stdin.setRawMode(true);
  stdin.resume();
  process.stdout.write('\u001b[?25l');

  try {
    return await runMenuConfig(initialDraft, detectedFrameworks);
  } finally {
    process.stdout.write('\u001b[?25h');
    stdin.setRawMode(previousRawState);
    clearScreen();
  }
}

export function buildInitConfigYaml(input: BuildConfigYamlInput): string {
  const codeSpecLine = input.codeSpec ? `  codeSpec: ${input.codeSpec}\n` : '';

  return `# Transpec Configuration
# Generated by transpec init

version: "1.0.0"

project:
  sourceFramework: ${input.sourceFramework}
  targetFramework: ${input.targetFramework}
  ide: ${input.ide}
  ides: ${input.ides.join(',')}
  mode: ${input.mode}
${codeSpecLine}
skills:
  preprocess: ${input.preprocessSkillPath}
  postprocess: ${input.postprocessSkillPath}

workspace:
  preprocessContext: ${input.preprocessContextPath}
  enhancedAnalysis: ${input.enhancedAnalysisPath}
  postprocessContext: ${input.postprocessContextPath}

logging:
  level: ${input.logLevel}
  console: true
  file:
    enabled: ${input.fileLoggingEnabled}
    path: ${input.logFilePath}
    maxSize: 10485760
    maxFiles: 5

createdAt: "${input.createdAt}"
`;
}

function isCiMode(): boolean {
  return process.env.CI !== undefined || process.env.TERM === 'dumb';
}

export async function initCommand(options: InitOptions): Promise<void> {
  const projectPath = process.cwd();
  await configureProjectLogger({
    projectPath,
    verbose: options.verbose,
    enableFileLoggingByDefault: true,
  });

  logger.info('Starting transpec initialization');

  const interactive = isInteractive() && !isCiMode() && !options.yes;

  if (interactive) {
    showBanner();
  } else if (options.verbose) {
    console.log(chalk.blue('\nInitializing transpec...\n'));
  }

  try {
    const ideRegistry = IdeRegistry.getInstance();
    ideRegistry.register(new ClaudeCodeAdapter());
    ideRegistry.register(new CursorAdapter());
    ideRegistry.register(new CodexAdapter());
    ideRegistry.register(new OpenCodeAdapter());

    logger.debug('Detecting frameworks in project', { path: projectPath });
    const detected = await frameworkRegistry.detect(projectPath);
    logger.debug('Detection completed', { detected: detected.length });

    if (detected.length === 0) {
      if (interactive) {
        console.log(chalk.yellow('No frameworks detected in current project.'));
        console.log('Please ensure you are in a project with OpenSpec, Trellis, or other supported frameworks.\n');
      } else {
        console.error(chalk.red('No frameworks detected.'));
        console.log('Supported: openspec, trellis\n');
      }
      logger.warn('No frameworks found during detection');
      process.exit(1);
    }

    if (interactive) {
      console.log(chalk.green(`Detected frameworks: ${detected.map(d => d.framework).join(', ')}\n`));
    } else if (options.verbose) {
      console.log(chalk.green(`Detected frameworks: ${detected.map(d => d.framework).join(', ')}`));
    }

    logger.info('Frameworks detected', {
      frameworks: detected.map(d => d.framework),
      entityCounts: detected.map(d => d.entityCount),
    });

    let draft = createInitialDraftConfig(options, detected);
    ensureTargetFrameworkValid(draft);

    if (interactive) {
      const configured = await runMenuConfigInTerminal(draft, detected);
      if (!configured) {
        console.log(chalk.dim('Initialization cancelled.\n'));
        process.exit(0);
      }
      draft = configured;
      ensureTargetFrameworkValid(draft);
    }

    const sourceFramework = draft.sourceFramework;
    const targetFramework = draft.targetFramework;
    const mode = draft.mode;
    const ides = draft.ides;
    const codeSpec = draft.codeSpec;
    const fileLoggingEnabled = draft.fileLoggingEnabled;
    const logLevel = draft.logLevel;

    const sourceAdapter = frameworkRegistry.get(sourceFramework as FrameworkType);
    const targetAdapter = frameworkRegistry.get(targetFramework as FrameworkType);

    if (!sourceAdapter) {
      console.error(chalk.red(`Source framework '${sourceFramework}' not supported.`));
      console.log('Supported:', frameworkRegistry.getSupportedFrameworks().join(', '));
      logger.error('Unsupported source framework', { framework: sourceFramework });
      process.exit(1);
    }

    if (!targetAdapter) {
      console.error(chalk.red(`Target framework '${targetFramework}' not supported.`));
      console.log('Supported:', frameworkRegistry.getSupportedFrameworks().join(', '));
      logger.error('Unsupported target framework', { framework: targetFramework });
      process.exit(1);
    }

    if (sourceFramework === targetFramework) {
      console.error(chalk.red('Source and target frameworks must be different.'));
      logger.error('Source and target are the same', { framework: sourceFramework });
      process.exit(1);
    }

    const transpecDir = path.join(projectPath, '.transpec');
    logger.debug('Creating .transpec directory', { path: transpecDir });

    const spinner = ora('Creating transpec structure...').start();
    await fs.mkdir(transpecDir, { recursive: true });

    const createdAt = new Date().toISOString();
    const ide = ides.length > 0 ? ides[0] : 'none';
    const materializedSkills = await materializeProjectSkills(projectPath, sourceFramework, targetFramework);
    const preprocessSkillPath = materializedSkills.preprocessSkillPath
      ?? getProjectFrameworkSkillPath(projectPath, 'preprocess', sourceFramework);
    const postprocessSkillPath = materializedSkills.postprocessSkillPath
      ?? getProjectFrameworkSkillPath(projectPath, 'postprocess', targetFramework);

    const configYaml = buildInitConfigYaml({
      sourceFramework,
      targetFramework,
      ide,
      ides,
      mode,
      codeSpec,
      preprocessSkillPath: toProjectRelativePath(projectPath, preprocessSkillPath),
      postprocessSkillPath: toProjectRelativePath(projectPath, postprocessSkillPath),
      preprocessContextPath: toProjectRelativePath(projectPath, getProjectPreprocessContextPath(projectPath)),
      enhancedAnalysisPath: toProjectRelativePath(projectPath, getProjectEnhancedAnalysisPath(projectPath)),
      postprocessContextPath: toProjectRelativePath(projectPath, getProjectPostprocessContextPath(projectPath)),
      logFilePath: toProjectRelativePath(projectPath, getProjectLogFilePath(projectPath)),
      logLevel,
      fileLoggingEnabled,
      createdAt,
    });

    await fs.writeFile(path.join(transpecDir, 'config.yaml'), configYaml);
    logger.debug('Config written', { path: path.join(transpecDir, 'config.yaml') });

    await fs.mkdir(path.join(transpecDir, 'workspace'), { recursive: true });
    await fs.mkdir(path.join(transpecDir, 'ir'), { recursive: true });
    await fs.mkdir(path.join(transpecDir, 'logs'), { recursive: true });
    await fs.mkdir(path.join(transpecDir, 'skills', 'preprocess'), { recursive: true });
    await fs.mkdir(path.join(transpecDir, 'skills', 'postprocess'), { recursive: true });
    logger.debug('Directory structure created');

    spinner.succeed('Transpec structure created');

    for (const ideId of ides) {
      const ideAdapter = ideRegistry.get(ideId);
      if (ideAdapter) {
        const ideSpinner = ora(`Configuring ${ideAdapter.displayName}...`).start();
        try {
          await ideAdapter.configure(projectPath, {
            sourceFramework,
            targetFramework,
            preprocessSkillPath: toProjectRelativePath(projectPath, preprocessSkillPath),
            postprocessSkillPath: toProjectRelativePath(projectPath, postprocessSkillPath),
            preprocessContextPath: toProjectRelativePath(projectPath, getProjectPreprocessContextPath(projectPath)),
            enhancedAnalysisPath: toProjectRelativePath(projectPath, getProjectEnhancedAnalysisPath(projectPath)),
            postprocessContextPath: toProjectRelativePath(projectPath, getProjectPostprocessContextPath(projectPath)),
          });
          ideSpinner.succeed(`${ideAdapter.displayName} configured`);
        } catch (error) {
          ideSpinner.fail(`Failed to configure ${ideAdapter.displayName}`);
          logger.error('IDE configuration failed', { ide: ideId, error: (error as Error).message });
        }
      }
    }

    console.log();
    console.log(chalk.green('Transpec initialized successfully!\n'));
    console.log(chalk.bold('Configuration:'));
    console.log(`  Source: ${chalk.cyan(sourceFramework)}`);
    console.log(`  Target: ${chalk.cyan(targetFramework)}`);
    console.log(`  IDE: ${chalk.cyan(formatIdeSummary(ides))}`);
    console.log(`  Mode: ${chalk.cyan(mode)}`);
    console.log(`  Code Spec: ${chalk.cyan(formatCodeSpecLabel(codeSpec))}`);
    console.log(`  File Logging: ${chalk.cyan(fileLoggingEnabled ? 'Enabled' : 'Disabled')}`);
    console.log(`  Log Level: ${chalk.cyan(logLevel)}`);
    console.log();

    console.log(chalk.dim('Normal workflow:'));
    console.log(chalk.dim(`  1. Shell: ${chalk.bold('transpec init')}`));
    console.log(chalk.dim('  2. Agent: run the generated preprocess command/skill for your IDE'));
    console.log(chalk.dim('  3. Agent: run the generated apply command/skill for your IDE\n'));

    logger.info('Initialization complete', {
      sourceFramework,
      targetFramework,
      ide,
      mode,
      codeSpec,
      fileLoggingEnabled,
      logLevel,
    });

  } catch (error) {
    logger.error('Initialization failed', { error: (error as Error).message, stack: (error as Error).stack });
    console.error(chalk.red('Error initializing transpec:'), error);
    process.exit(1);
  }
}

export type CodeSpecOption = 'merged' | 'by-language' | 'main-only';
