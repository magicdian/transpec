import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { Logger, LogLevel } from '../../core/logging/index.js';
import { getProjectLogFilePath } from '../../core/skill/index.js';
import { configureProjectLogger } from './logging.js';

const tempDirs: string[] = [];

async function createTempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'transpec-project-logger-'));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, '.transpec'), { recursive: true });
  return dir;
}

afterEach(async () => {
  Logger.reset();
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe('configureProjectLogger', () => {
  it('should enable file logging for legacy init configs without an explicit file path', async () => {
    const projectPath = await createTempProject();

    await fs.writeFile(
      path.join(projectPath, '.transpec', 'config.yaml'),
      `logging:
  level: info
  console: true
  file:
    enabled: false
`,
      'utf-8',
    );

    await configureProjectLogger({ projectPath });

    expect(Logger.getConfig()).toMatchObject({
      level: LogLevel.INFO,
      console: true,
      file: {
        enabled: true,
        path: getProjectLogFilePath(projectPath),
      },
    });
  });

  it('should respect explicit file logging disablement when a path is configured', async () => {
    const projectPath = await createTempProject();

    await fs.writeFile(
      path.join(projectPath, '.transpec', 'config.yaml'),
      `logging:
  level: tracing
  console: false
  file:
    enabled: false
    path: .transpec/logs/custom.log
`,
      'utf-8',
    );

    await configureProjectLogger({ projectPath, verbose: true });

    expect(Logger.getConfig()).toMatchObject({
      level: LogLevel.TRACE,
      console: false,
      file: {
        enabled: false,
        path: undefined,
      },
    });
  });
});
