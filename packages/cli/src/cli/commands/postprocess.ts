import chalk from 'chalk';
import { runTargetPostprocess } from '../../core/postprocess/index.js';
import { loadProjectConfig } from '../utils/project-config.js';
import { configureProjectLogger } from '../utils/logging.js';

export interface PostprocessOptions {
  projectPath?: string;
  verbose?: boolean;
}

export async function postprocessCommand(options: PostprocessOptions): Promise<void> {
  const projectPath = options.projectPath || process.cwd();
  await configureProjectLogger({
    projectPath,
    verbose: options.verbose,
  });

  console.log(chalk.blue(`\n=== Transpec Postprocess ===\n`));
  console.log(`Project: ${chalk.cyan(projectPath)}\n`);

  const config = await loadProjectConfig(projectPath);
  const targetFramework = config.project?.targetFramework;

  if (!targetFramework) {
    console.log(chalk.red('✗ Missing target framework configuration. Run "transpec init" first.\n'));
    return;
  }

  console.log(chalk.bold('Step 1: Generating deterministic grounded specs...'));
  const result = await runTargetPostprocess(projectPath, targetFramework);

  if (result.generatedFiles.length > 0) {
    for (const file of result.generatedFiles) {
      console.log(chalk.gray(`  ${file.layer}: ${file.path}`));
    }
  } else {
    console.log(chalk.gray('  No target-specific grounded spec files were generated.'));
  }

  if (result.warnings.length > 0) {
    console.log();
    for (const warning of result.warnings) {
      console.log(chalk.yellow(`  ⚠ ${warning}`));
    }
  }

  console.log(chalk.green.bold('\n✓ Postprocess completed successfully!\n'));
}
