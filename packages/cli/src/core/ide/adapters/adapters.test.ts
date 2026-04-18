import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { IdeSetupOptions } from '../index.js';
import { ClaudeCodeAdapter } from './claude-code.js';
import { CursorAdapter } from './cursor.js';
import { CodexAdapter } from './codex.js';
import { OpenCodeAdapter } from './opencode.js';

const tempDirs: string[] = [];

async function createTempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'transpec-adapter-'));
  tempDirs.push(dir);
  return dir;
}

const options: IdeSetupOptions = {
  sourceFramework: 'openspec',
  targetFramework: 'trellis',
  preprocessSkillPath: '.transpec/skills/preprocess/openspec/SKILL.md',
  postprocessSkillPath: '.transpec/skills/postprocess/trellis/SKILL.md',
  preprocessContextPath: '.transpec/workspace/preprocess-context.json',
  enhancedAnalysisPath: '.transpec/workspace/enhanced-analysis.json',
  postprocessContextPath: '.transpec/workspace/postprocess-context.json',
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe('IDE adapter generation', () => {
  it('should generate Claude Code preprocess/apply commands with project-local skill paths', async () => {
    const projectPath = await createTempProject();
    const adapter = new ClaudeCodeAdapter();

    await adapter.configure(projectPath, options);

    const preprocess = await fs.readFile(path.join(projectPath, '.claude', 'commands', 'transpec', 'preprocess.md'), 'utf-8');
    const apply = await fs.readFile(path.join(projectPath, '.claude', 'commands', 'transpec', 'apply.md'), 'utf-8');

    expect(preprocess).toContain(options.preprocessSkillPath);
    expect(preprocess).toContain(options.enhancedAnalysisPath);
    expect(apply).toContain(options.postprocessSkillPath);
    expect(apply).not.toContain('dist/.transpec');
    expect(apply).not.toContain('packages/cli/.transpec');
  });

  it('should generate Cursor, Codex, and OpenCode assets for both preprocess and apply', async () => {
    const projectPath = await createTempProject();

    await new CursorAdapter().configure(projectPath, options);
    await new CodexAdapter().configure(projectPath, options);
    await new OpenCodeAdapter().configure(projectPath, options);

    const cursorPreprocess = await fs.readFile(path.join(projectPath, '.cursor', 'commands', 'transpec-preprocess.md'), 'utf-8');
    const codexPreprocess = await fs.readFile(path.join(projectPath, '.codex', 'skills', 'transpec-preprocess', 'SKILL.md'), 'utf-8');
    const codexApply = await fs.readFile(path.join(projectPath, '.codex', 'skills', 'transpec-apply', 'SKILL.md'), 'utf-8');
    const opencodePreprocess = await fs.readFile(path.join(projectPath, '.opencode', 'command', 'transpec-preprocess.md'), 'utf-8');
    const opencodeApply = await fs.readFile(path.join(projectPath, '.opencode', 'skills', 'transpec-apply', 'SKILL.md'), 'utf-8');

    expect(cursorPreprocess).toContain(options.preprocessSkillPath);
    expect(codexPreprocess).toContain(options.preprocessContextPath);
    expect(codexPreprocess).toContain('transpec preprocess --skip-convert');
    expect(codexApply).toContain(options.postprocessSkillPath);
    expect(opencodePreprocess).toContain(options.enhancedAnalysisPath);
    expect(opencodeApply).toContain(options.postprocessContextPath);
  });
});
