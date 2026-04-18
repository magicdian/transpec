/**
 * Cursor IDE Adapter
 *
 * Configures Cursor for use with transpec by generating:
 * - .cursor/commands/transpec-apply.md - /transpec-apply command
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { IdeAdapter, IdeSetupOptions, isDirectory } from '../index.js';
import { getLogger, LogModules } from '../../logging/index.js';
import { buildApplyWorkflowBody, buildPreprocessWorkflowBody } from '../../skill/index.js';

const logger = getLogger(LogModules.CLI);

/**
 * Cursor IDE Adapter
 */
export class CursorAdapter implements IdeAdapter {
  readonly ide = 'cursor';
  readonly displayName = 'Cursor';
  readonly skillsDir = '.cursor';
  readonly cliFlag = '--cursor';

  /**
   * Detect if Cursor is configured in the project
   * Checks for .cursor/commands/ directory
   */
  async detect(projectPath: string): Promise<boolean> {
    const cursorPath = path.join(projectPath, this.skillsDir);
    const commandsPath = path.join(cursorPath, 'commands');

    try {
      if (await isDirectory(commandsPath)) {
        logger.debug('Cursor detected via commands directory', { path: commandsPath });
        return true;
      }
    } catch {
      // Directory doesn't exist
    }

    return false;
  }

  /**
   * Configure Cursor for transpec
   * Creates .cursor/commands/transpec-apply.md
   */
  async configure(projectPath: string, options: IdeSetupOptions): Promise<void> {
    const cursorDir = path.join(projectPath, this.skillsDir);
    const commandsDir = path.join(cursorDir, 'commands');

    logger.info('Configuring Cursor', { path: cursorDir });

    // Create directory structure
    await fs.mkdir(commandsDir, { recursive: true });

    await this.generatePreprocessCommand(commandsDir, options);
    await this.generateApplyCommand(commandsDir, options);

    logger.info('Cursor configuration complete', { path: cursorDir });
  }

  /**
   * Generate .cursor/commands/transpec-apply.md
   */
  private async generatePreprocessCommand(commandsDir: string, options: IdeSetupOptions): Promise<void> {
    const preprocessPath = path.join(commandsDir, 'transpec-preprocess.md');
    const body = buildPreprocessWorkflowBody({
      preprocessSkillPath: options.preprocessSkillPath,
      postprocessSkillPath: options.postprocessSkillPath,
      preprocessContextPath: options.preprocessContextPath,
      enhancedAnalysisPath: options.enhancedAnalysisPath,
      postprocessContextPath: options.postprocessContextPath,
    });

    const content = `---
name: /transpec-preprocess
id: transpec-preprocess
category: transpec
description: "Prepare RAW IR and execute source-specific preprocess workflow."
---

# /transpec-preprocess

${body}
`;

    await fs.writeFile(preprocessPath, content);
    logger.debug('Generated transpec-preprocess.md', { path: preprocessPath });
  }

  private async generateApplyCommand(commandsDir: string, options: IdeSetupOptions): Promise<void> {
    const applyPath = path.join(commandsDir, 'transpec-apply.md');
    const body = buildApplyWorkflowBody({
      preprocessSkillPath: options.preprocessSkillPath,
      postprocessSkillPath: options.postprocessSkillPath,
      preprocessContextPath: options.preprocessContextPath,
      enhancedAnalysisPath: options.enhancedAnalysisPath,
      postprocessContextPath: options.postprocessContextPath,
    });

    const content = `---
name: /transpec-apply
id: transpec-apply
category: transpec
description: "Apply deterministic transform/emit and execute target-specific postprocess workflow."
---

# /transpec-apply

${body}
`;

    await fs.writeFile(applyPath, content);
    logger.debug('Generated transpec-apply.md', { path: applyPath });
  }
}
