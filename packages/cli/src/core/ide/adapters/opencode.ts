/**
 * OpenCode IDE Adapter
 *
 * Configures OpenCode AI for use with transpec by generating:
 * - .opencode/command/transpec-apply.md - transpec apply command
 * - .opencode/skills/transpec-apply/SKILL.md - transpec apply skill
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { IdeAdapter, IdeSetupOptions, isDirectory } from '../index.js';
import { getLogger, LogModules } from '../../logging/index.js';
import { buildApplyWorkflowBody, buildPreprocessWorkflowBody } from '../../skill/index.js';

const logger = getLogger(LogModules.CLI);

/**
 * OpenCode IDE Adapter
 */
export class OpenCodeAdapter implements IdeAdapter {
  readonly ide = 'opencode';
  readonly displayName = 'OpenCode';
  readonly skillsDir = '.opencode';
  readonly cliFlag = '--opencode';

  /**
   * Detect if OpenCode is configured in the project
   * Checks for .opencode/command/ directory or .opencode/skills/ directory
   */
  async detect(projectPath: string): Promise<boolean> {
    const opencodePath = path.join(projectPath, this.skillsDir);
    const commandPath = path.join(opencodePath, 'command');
    const skillsPath = path.join(opencodePath, 'skills');

    try {
      if (await isDirectory(commandPath) || await isDirectory(skillsPath)) {
        logger.debug('OpenCode detected', { path: opencodePath });
        return true;
      }
    } catch {
      // Directory doesn't exist
    }

    return false;
  }

  /**
   * Configure OpenCode for transpec
   * Creates:
   * - .opencode/command/transpec-apply.md
   * - .opencode/skills/transpec-apply/SKILL.md
   */
  async configure(projectPath: string, options: IdeSetupOptions): Promise<void> {
    const opencodeDir = path.join(projectPath, this.skillsDir);
    const commandDir = path.join(opencodeDir, 'command');
    const preprocessSkillsDir = path.join(opencodeDir, 'skills', 'transpec-preprocess');
    const applySkillsDir = path.join(opencodeDir, 'skills', 'transpec-apply');

    logger.info('Configuring OpenCode', { path: opencodeDir });

    // Create directory structure
    await fs.mkdir(commandDir, { recursive: true });
    await fs.mkdir(preprocessSkillsDir, { recursive: true });
    await fs.mkdir(applySkillsDir, { recursive: true });

    // Generate command and skill files
    await this.generatePreprocessCommand(commandDir, options);
    await this.generateApplyCommand(commandDir, options);
    await this.generatePreprocessSkill(preprocessSkillsDir, options);
    await this.generateApplySkill(applySkillsDir, options);

    logger.info('OpenCode configuration complete', { path: opencodeDir });
  }

  /**
   * Generate .opencode/command/transpec-apply.md
   */
  private async generatePreprocessCommand(commandDir: string, options: IdeSetupOptions): Promise<void> {
    const preprocessPath = path.join(commandDir, 'transpec-preprocess.md');
    const body = buildPreprocessWorkflowBody({
      preprocessSkillPath: options.preprocessSkillPath,
      postprocessSkillPath: options.postprocessSkillPath,
      preprocessContextPath: options.preprocessContextPath,
      enhancedAnalysisPath: options.enhancedAnalysisPath,
      postprocessContextPath: options.postprocessContextPath,
    });

    const content = `---
name: transpec:preprocess
description: Prepare RAW IR and execute source-specific preprocess workflow
---

# transpec:preprocess

${body}
`;

    await fs.writeFile(preprocessPath, content);
    logger.debug('Generated command/transpec-preprocess.md', { path: preprocessPath });
  }

  private async generateApplyCommand(commandDir: string, options: IdeSetupOptions): Promise<void> {
    const applyPath = path.join(commandDir, 'transpec-apply.md');
    const body = buildApplyWorkflowBody({
      preprocessSkillPath: options.preprocessSkillPath,
      postprocessSkillPath: options.postprocessSkillPath,
      preprocessContextPath: options.preprocessContextPath,
      enhancedAnalysisPath: options.enhancedAnalysisPath,
      postprocessContextPath: options.postprocessContextPath,
    });

    const content = `---
name: transpec:apply
description: Apply deterministic transform/emit and execute target-specific postprocess workflow
---

# transpec:apply

${body}
`;

    await fs.writeFile(applyPath, content);
    logger.debug('Generated command/transpec-apply.md', { path: applyPath });
  }

  /**
   * Generate .opencode/skills/transpec-apply/SKILL.md
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
license: MIT
compatibility: Requires transpec CLI.
metadata:
  author: transpec
  version: "1.0"
---

# transpec-preprocess Skill

${body}
`;

    await fs.writeFile(skillPath, content);
    logger.debug('Generated skills/transpec-preprocess/SKILL.md', { path: skillPath });
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
license: MIT
compatibility: Requires transpec CLI.
metadata:
  author: transpec
  version: "1.0"
---

# transpec-apply Skill

${body}
`;

    await fs.writeFile(skillPath, content);
    logger.debug('Generated skills/transpec-apply/SKILL.md', { path: skillPath });
  }
}
