import chalk from 'chalk';
import { getVersionString, bumpVersion } from '../../core/version.js';

/**
 * Display current version or bump to next version
 */
export async function versionCommand(options: { bump?: boolean }): Promise<void> {
  if (options.bump) {
    const { full } = bumpVersion();
    console.log(chalk.green(`Version bumped to: ${full}`));
  } else {
    const current = getVersionString();
    if (current) {
      console.log(current);
    } else {
      console.log(chalk.yellow('No version found in package.json'));
    }
  }
}
