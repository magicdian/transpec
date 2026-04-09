/**
 * Cursor IDE Adapter
 *
 * Configures Cursor for use with transpec by generating:
 * - .cursor/commands/transpec-apply.md - /transpec-apply command
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { IdeAdapter, isDirectory } from '../index.js';
import { getLogger, LogModules } from '../../logging/index.js';

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
  async configure(projectPath: string): Promise<void> {
    const cursorDir = path.join(projectPath, this.skillsDir);
    const commandsDir = path.join(cursorDir, 'commands');

    logger.info('Configuring Cursor', { path: cursorDir });

    // Create directory structure
    await fs.mkdir(commandsDir, { recursive: true });

    // Generate transpec-apply command
    await this.generateApplyCommand(commandsDir);

    logger.info('Cursor configuration complete', { path: cursorDir });
  }

  /**
   * Generate .cursor/commands/transpec-apply.md
   */
  private async generateApplyCommand(commandsDir: string): Promise<void> {
    const applyPath = path.join(commandsDir, 'transpec-apply.md');

    const content = `---
name: /transpec-apply
id: transpec-apply
category: transpec
description: "Apply transpec transformations to convert specs from source to target framework."
---

# /transpec-apply

Apply transpec transformations to convert specs from source framework to target framework.

## Prerequisites

1. Run \`transpec convert\` first to generate the Intermediate Representation (IR)
2. Review the IR in \`.transpec/ir/\`

## Usage

Execute this command to apply the transformations:

\`\`\`bash
transpec apply
\`\`\`

## What Happens

1. Reads the IR from \`.transpec/ir/\`
2. Loads the target framework adapter (e.g., Trellis)
3. Emits the transformed specs to the target framework directory
4. Copies framework-specific post-processing skills if needed

## Options

- \`--dry-run\` - Preview changes without applying
- \`--force\` - Overwrite existing files

## Examples

\`\`\`
/transpec-apply
/transpec-apply --dry-run
\`\`\`

## Notes

- Use \`transpec detect --ide\` to check IDE configuration
- Use \`transpec init --ide cursor\` to initialize Cursor configuration
`;

    await fs.writeFile(applyPath, content);
    logger.debug('Generated transpec-apply.md', { path: applyPath });
  }
}
