import chalk from 'chalk';
import { validateConvertedProject } from '../../core/validation/conversion.js';
import { configureProjectLogger } from '../utils/logging.js';

export interface ValidateOptions {
  path?: string;
  verbose?: boolean;
}

export async function validateCommand(options: ValidateOptions): Promise<void> {
  const projectPath = options.path || process.cwd();
  await configureProjectLogger({
    projectPath,
    verbose: options.verbose,
  });

  console.log(chalk.blue(`\n=== Transpec Validate ===\n`));
  console.log(`Project: ${chalk.cyan(projectPath)}\n`);

  const result = await validateConvertedProject(projectPath);
  const errors = result.issues.filter(issue => issue.severity === 'error');
  const warnings = result.issues.filter(issue => issue.severity === 'warning');
  const infos = result.issues.filter(issue => issue.severity === 'info');

  for (const issue of result.issues) {
    const prefix = issue.severity === 'error'
      ? chalk.red('error')
      : issue.severity === 'warning'
        ? chalk.yellow('warning')
        : chalk.gray('info');
    const pathSuffix = issue.path ? ` (${issue.path})` : '';
    console.log(`- ${prefix} [${issue.code}] ${issue.message}${pathSuffix}`);
  }

  console.log();
  console.log(chalk.bold('Summary'));
  console.log(`  Frameworks: ${chalk.cyan(result.summary.sourceFramework || 'unknown')} -> ${chalk.cyan(result.summary.targetFramework || 'unknown')}`);
  console.log(`  Tasks checked: ${chalk.cyan(String(result.summary.checkedTasks))}`);
  console.log(`  Relations checked: ${chalk.cyan(String(result.summary.checkedRelations))}`);
  console.log(`  Errors: ${chalk.cyan(String(errors.length))}`);
  console.log(`  Warnings: ${chalk.cyan(String(warnings.length))}`);
  console.log(`  Info: ${chalk.cyan(String(infos.length))}`);
  console.log();

  if (!result.success) {
    console.log(chalk.red.bold('✗ Validation failed\n'));
    process.exitCode = 1;
    return;
  }

  console.log(chalk.green.bold('✓ Validation passed\n'));
}
