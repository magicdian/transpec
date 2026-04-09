/**
 * Codex IDE Adapter
 *
 * Configures VS Code Agent (Codex) for use with transpec by generating:
 * - .codex/skills/transpec-apply/SKILL.md - transpec apply skill
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { IdeAdapter, isDirectory } from '../index.js';
import { getLogger, LogModules } from '../../logging/index.js';

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
  async configure(projectPath: string): Promise<void> {
    const codexDir = path.join(projectPath, this.skillsDir);
    const skillsDir = path.join(codexDir, 'skills', 'transpec-apply');

    logger.info('Configuring Codex', { path: codexDir });

    // Create directory structure
    await fs.mkdir(skillsDir, { recursive: true });

    // Generate transpec-apply skill
    await this.generateApplySkill(skillsDir);

    logger.info('Codex configuration complete', { path: codexDir });
  }

  /**
   * Generate .codex/skills/transpec-apply/SKILL.md
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
- Use \`transpec init --ide codex\` to initialize Codex configuration
`;

    await fs.writeFile(skillPath, content);
    logger.debug('Generated SKILL.md', { path: skillPath });
  }
}
