/**
 * Claude Code IDE Adapter
 *
 * Configures Claude Code for use with transpec by generating:
 * - .claude/settings.json - Hooks configuration
 * - .claude/commands/transpec/preprocess.md - /transpec:preprocess command
 * - .claude/commands/transpec/apply.md - /transpec:apply command
 * - .claude/hooks/transpec-context.py - Context injection hook
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { IdeAdapter, IdeSetupOptions, isDirectory } from '../index.js';
import { getLogger, LogModules } from '../../logging/index.js';
import { buildApplyWorkflowBody, buildPreprocessWorkflowBody } from '../../skill/index.js';

const logger = getLogger(LogModules.CLI);

/**
 * Claude Code IDE Adapter
 */
export class ClaudeCodeAdapter implements IdeAdapter {
  readonly ide = 'claude-code';
  readonly displayName = 'Claude Code';
  readonly skillsDir = '.claude';
  readonly cliFlag = '--claude-code';

  /**
   * Detect if Claude Code is configured in the project
   * Checks for .claude/settings.json or .claude/ directory
   */
  async detect(projectPath: string): Promise<boolean> {
    const claudePath = path.join(projectPath, this.skillsDir);
    const settingsPath = path.join(claudePath, 'settings.json');

    try {
      // Check if .claude directory exists with settings.json
      if (await isDirectory(claudePath)) {
        try {
          await fs.access(settingsPath);
          logger.debug('Claude Code detected via settings.json', { path: settingsPath });
          return true;
        } catch {
          // Directory exists but no settings.json - still considered configured
          logger.debug('Claude Code directory exists', { path: claudePath });
          return true;
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return false;
  }

  /**
   * Configure Claude Code for transpec
   * Creates .claude directory with settings, commands, and hooks
   */
  async configure(projectPath: string, options: IdeSetupOptions): Promise<void> {
    const claudeDir = path.join(projectPath, this.skillsDir);
    const commandsDir = path.join(claudeDir, 'commands', 'transpec');
    const hooksDir = path.join(claudeDir, 'hooks');

    logger.info('Configuring Claude Code', { path: claudeDir });

    // Create directory structure
    await fs.mkdir(commandsDir, { recursive: true });
    await fs.mkdir(hooksDir, { recursive: true });

    // Generate settings.json
    await this.generateSettings(claudeDir);

    // Generate /transpec:preprocess command
    await this.generatePreprocessCommand(commandsDir, options);

    // Generate /transpec:apply command
    await this.generateApplyCommand(commandsDir, options);

    // Generate context injection hook
    await this.generateContextHook(hooksDir);

    logger.info('Claude Code configuration complete', { path: claudeDir });
  }

  /**
   * Generate .claude/settings.json
   */
  private async generateSettings(claudeDir: string): Promise<void> {
    const settingsPath = path.join(claudeDir, 'settings.json');
    const pythonCmd = getPythonCommand();

    const settings = {
      hooks: {
        SessionStart: [
          {
            matcher: 'startup',
            hooks: [
              {
                type: 'command',
                command: `${pythonCmd} ${this.skillsDir}/hooks/transpec-context.py`,
                timeout: 10
              }
            ]
          }
        ],
        PreToolUse: [
          {
            matcher: 'Task',
            hooks: [
              {
                type: 'command',
                command: `${pythonCmd} ${this.skillsDir}/hooks/transpec-context.py`,
                timeout: 30
              }
            ]
          },
          {
            matcher: 'Agent',
            hooks: [
              {
                type: 'command',
                command: `${pythonCmd} ${this.skillsDir}/hooks/transpec-context.py`,
                timeout: 30
              }
            ]
          }
        ]
      },
      enabledPlugins: {}
    };

    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    logger.debug('Generated settings.json', { path: settingsPath });
  }

  /**
   * Generate /transpec:preprocess command
   */
  private async generatePreprocessCommand(commandsDir: string, options: IdeSetupOptions): Promise<void> {
    const preprocessPath = path.join(commandsDir, 'preprocess.md');
    const body = buildPreprocessWorkflowBody({
      preprocessSkillPath: options.preprocessSkillPath,
      postprocessSkillPath: options.postprocessSkillPath,
      preprocessContextPath: options.preprocessContextPath,
      enhancedAnalysisPath: options.enhancedAnalysisPath,
      postprocessContextPath: options.postprocessContextPath,
    });

    const content = `---
name: preprocess
description: Prepare RAW IR and execute source-specific preprocess workflow
---

# /transpec:preprocess

${body}
`;

    await fs.writeFile(preprocessPath, content);
    logger.debug('Generated preprocess.md', { path: preprocessPath });
  }

  /**
   * Generate /transpec:apply command
   */
  private async generateApplyCommand(commandsDir: string, options: IdeSetupOptions): Promise<void> {
    const applyPath = path.join(commandsDir, 'apply.md');
    const body = buildApplyWorkflowBody({
      preprocessSkillPath: options.preprocessSkillPath,
      postprocessSkillPath: options.postprocessSkillPath,
      preprocessContextPath: options.preprocessContextPath,
      enhancedAnalysisPath: options.enhancedAnalysisPath,
      postprocessContextPath: options.postprocessContextPath,
    });

    const content = `---
name: apply
description: Apply deterministic transform/emit and run target-specific postprocess workflow
---

# /transpec:apply

${body}
`;

    await fs.writeFile(applyPath, content);
    logger.debug('Generated apply.md', { path: applyPath });
  }

  /**
   * Generate context injection hook
   */
  private async generateContextHook(hooksDir: string): Promise<void> {
    const hookPath = path.join(hooksDir, 'transpec-context.py');
    const pythonCmd = getPythonCommand();

    const hookContent = `#!/usr/bin/env ${pythonCmd}
"""
Transpec Context Injection Hook

Injects transpec context into Claude Code sessions:
- Reads .transpec/config.yaml for conversion settings
- Reads .transpec/ir/ for Intermediate Representation data
- Provides context to help Claude understand the conversion task
"""

import json
import sys
from pathlib import Path


def get_transpec_context():
    """Read transpec configuration and IR data."""
    context = {
        'transpec': {
            'configured': False,
            'config': None,
            'ir_files': []
        }
    }

    # Check if transpec is initialized
    transpec_dir = Path('.transpec')
    if not transpec_dir.exists():
        return context

    context['transpec']['configured'] = True

    # Read config.yaml
    config_path = transpec_dir / 'config.yaml'
    if config_path.exists():
        try:
            with open(config_path, 'r') as f:
                content = f.read()
                # Simple parsing for key values
                config = {}
                for line in content.split('\\n'):
                    if ':' in line and not line.strip().startswith('#'):
                        key, value = line.split(':', 1)
                        config[key.strip()] = value.strip().strip('"').strip("'")
                context['transpec']['config'] = config
        except Exception:
            pass

    # Read IR files
    ir_dir = transpec_dir / 'ir'
    if ir_dir.exists():
        try:
            ir_files = list(ir_dir.glob('*.json'))
            context['transpec']['ir_files'] = [
                {
                    'name': f.stem,
                    'size': f.stat().st_size
                }
                for f in ir_files[:10]  # Limit to first 10
            ]
        except Exception:
            pass

    return context


def main():
    """Main entry point for the hook."""
    try:
        context = get_transpec_context()

        # Output as hook-specific additional context
        output = {
            'hookSpecificOutput': {
                'additionalContext': format_context(context)
            }
        }

        print(json.dumps(output))
    except Exception as e:
        # Don't fail the hook, just output empty context
        print(json.dumps({'hookSpecificOutput': {'additionalContext': ''}}))
        sys.exit(0)


def format_context(context):
    """Format context for display."""
    if not context['transpec']['configured']:
        return ''

    lines = ['\\n[Transpec Context]']

    config = context['transpec'].get('config')
    if config:
        lines.append(f"Source: {config.get('sourceFramework', 'unknown')}")
        lines.append(f"Target: {config.get('targetFramework', 'unknown')}")
        lines.append(f"Mode: {config.get('mode', 'unknown')}")

    ir_count = len(context['transpec'].get('ir_files', []))
    if ir_count > 0:
        lines.append(f"IR files: {ir_count} file(s)")

    return '\\n'.join(lines)


if __name__ == '__main__':
    main()
`;

    await fs.writeFile(hookPath, hookContent, { mode: 0o755 });
    logger.debug('Generated transpec-context.py', { path: hookPath });
  }
}


/**
 * Detect available Python command
 */
function getPythonCommand(): string {
  // Try python3 first
  try {
    execSync('python3 --version', { stdio: 'pipe' });
    return 'python3';
  } catch {
    return 'python';
  }
}
