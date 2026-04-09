/**
 * OpenCode IDE Adapter
 *
 * Configures OpenCode AI for use with transpec by generating:
 * - .opencode/command/transpec-apply.md - transpec apply command
 * - .opencode/skills/transpec-apply/SKILL.md - transpec apply skill
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { IdeAdapter, isDirectory } from '../index.js';
import { getLogger, LogModules } from '../../logging/index.js';

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
  async configure(projectPath: string): Promise<void> {
    const opencodeDir = path.join(projectPath, this.skillsDir);
    const commandDir = path.join(opencodeDir, 'command');
    const skillsDir = path.join(opencodeDir, 'skills', 'transpec-apply');

    logger.info('Configuring OpenCode', { path: opencodeDir });

    // Create directory structure
    await fs.mkdir(commandDir, { recursive: true });
    await fs.mkdir(skillsDir, { recursive: true });

    // Generate command and skill files
    await this.generateApplyCommand(commandDir);
    await this.generateApplySkill(skillsDir);

    logger.info('OpenCode configuration complete', { path: opencodeDir });
  }

  /**
   * Generate .opencode/command/transpec-apply.md
   */
  private async generateApplyCommand(commandDir: string): Promise<void> {
    const applyPath = path.join(commandDir, 'transpec-apply.md');

    const content = `---
name: transpec:apply
description: Apply transpec transformations to convert specs from source to target framework
---

# transpec:apply

Apply transpec transformations to convert specs from source framework to target framework.

Run \`transpec apply\` after \`transpec convert\`.
`;

    await fs.writeFile(applyPath, content);
    logger.debug('Generated command/transpec-apply.md', { path: applyPath });
  }

  /**
   * Generate .opencode/skills/transpec-apply/SKILL.md
   */
  private async generateApplySkill(skillsDir: string): Promise<void> {
    const skillPath = path.join(skillsDir, 'SKILL.md');

    const content = `---
name: transpec-apply
description: Apply transpec transformations to convert specs from source to target framework.
license: MIT
compatibility: Requires transpec CLI.
metadata:
  author: transpec
  version: "1.0"
---

# transpec-apply Skill

Apply transpec transformations to convert specs from source framework to target framework.

## Prerequisites

1. Run \`transpec convert\` first to generate the Intermediate Representation (IR)
2. Review the IR in \`.transpec/ir/\`

## Usage

Execute the apply command:

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
transpec apply
transpec apply --dry-run
\`\`\`

## Notes

- Use \`transpec detect --ide\` to check IDE configuration
- Use \`transpec init --ide opencode\` to initialize OpenCode configuration
`;

    await fs.writeFile(skillPath, content);
    logger.debug('Generated skills/transpec-apply/SKILL.md', { path: skillPath });
  }
}
