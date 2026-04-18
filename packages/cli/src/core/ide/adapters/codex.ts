/**
 * Codex IDE Adapter
 *
 * Configures VS Code Agent (Codex) for use with transpec by generating:
 * - .codex/skills/transpec-apply/SKILL.md - transpec apply skill
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { IdeAdapter, IdeSetupOptions, isDirectory } from '../index.js';
import { getLogger, LogModules } from '../../logging/index.js';
import { buildApplyWorkflowBody, buildPreprocessWorkflowBody } from '../../skill/index.js';

const logger = getLogger(LogModules.CLI);

/**
 * Codex IDE Adapter
 */
export class CodexAdapter implements IdeAdapter {
  readonly ide = 'codex';
  readonly displayName = 'Codex';
  readonly skillsDir = '.codex';
  readonly cliFlag = '--codex';

  /**
   * Detect if Codex is configured in the project
   * Checks for .codex/skills/ directory or .codex/config.toml
   */
  async detect(projectPath: string): Promise<boolean> {
    const codexPath = path.join(projectPath, this.skillsDir);
    const skillsPath = path.join(codexPath, 'skills');
    const configPath = path.join(codexPath, 'config.toml');

    try {
      if (await isDirectory(skillsPath)) {
        logger.debug('Codex detected via skills directory', { path: skillsPath });
        return true;
      }
      // Also check for config.toml
      try {
        await fs.access(configPath);
        logger.debug('Codex detected via config.toml', { path: configPath });
        return true;
      } catch {
        // config.toml doesn't exist
      }
    } catch {
      // Directory doesn't exist
    }

    return false;
  }

  /**
   * Configure Codex for transpec
   * Creates .codex/skills/transpec-apply/SKILL.md
   */
  async configure(projectPath: string, options: IdeSetupOptions): Promise<void> {
    const codexDir = path.join(projectPath, this.skillsDir);
    const preprocessDir = path.join(codexDir, 'skills', 'transpec-preprocess');
    const applyDir = path.join(codexDir, 'skills', 'transpec-apply');

    logger.info('Configuring Codex', { path: codexDir });

    // Create directory structure
    await fs.mkdir(preprocessDir, { recursive: true });
    await fs.mkdir(applyDir, { recursive: true });

    await this.generatePreprocessSkill(preprocessDir, options);
    await this.generateApplySkill(applyDir, options);

    logger.info('Codex configuration complete', { path: codexDir });
  }

  /**
   * Generate .codex/skills/transpec-apply/SKILL.md
   */
  private async generatePreprocessSkill(skillsDir: string, options: IdeSetupOptions): Promise<void> {
    const skillPath = path.join(skillsDir, 'SKILL.md');
    const body = buildPreprocessWorkflowBody({
      preprocessSkillPath: options.preprocessSkillPath,
      postprocessSkillPath: options.postprocessSkillPath,
      preprocessContextPath: options.preprocessContextPath,
      enhancedAnalysisPath: options.enhancedAnalysisPath,
      postprocessContextPath: options.postprocessContextPath,
    });

    const content = `---
name: transpec-preprocess
description: Prepare RAW IR and execute source-specific preprocess workflow.
license: Apache-2.0
compatibility: Requires transpec CLI.
metadata:
  author: transpec
  version: "1.0"
---

# transpec-preprocess Skill

${body}
`;

    await fs.writeFile(skillPath, content);
    logger.debug('Generated preprocess SKILL.md', { path: skillPath });
  }

  private async generateApplySkill(skillsDir: string, options: IdeSetupOptions): Promise<void> {
    const skillPath = path.join(skillsDir, 'SKILL.md');
    const body = buildApplyWorkflowBody({
      preprocessSkillPath: options.preprocessSkillPath,
      postprocessSkillPath: options.postprocessSkillPath,
      preprocessContextPath: options.preprocessContextPath,
      enhancedAnalysisPath: options.enhancedAnalysisPath,
      postprocessContextPath: options.postprocessContextPath,
    });

    const content = `---
name: transpec-apply
description: Apply deterministic transform/emit and execute target-specific postprocess workflow.
license: Apache-2.0
compatibility: Requires transpec CLI.
metadata:
  author: transpec
  version: "1.0"
---

# transpec-apply Skill

${body}
`;

    await fs.writeFile(skillPath, content);
    logger.debug('Generated SKILL.md', { path: skillPath });
  }
}
