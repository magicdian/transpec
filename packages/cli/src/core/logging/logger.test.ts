import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { Logger, LogLevel, getLogger } from './index.js';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'transpec-logger-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  Logger.reset();
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe('Logger', () => {
  it('should apply updated configuration to loggers created before Logger.configure', async () => {
    const logger = getLogger('test-module');
    const tempDir = await createTempDir();
    const logPath = path.join(tempDir, 'logs', 'transpec.log');

    Logger.configure({
      level: LogLevel.INFO,
      console: false,
      file: {
        enabled: true,
        path: logPath,
      },
    });

    logger.info('hello world', { phase: 'init' });

    const content = await fs.readFile(logPath, 'utf-8');
    const [firstLine] = content.trim().split('\n');
    const entry = JSON.parse(firstLine) as {
      level: string;
      module: string;
      message: string;
      data?: Record<string, unknown>;
    };

    expect(entry).toMatchObject({
      level: 'INFO',
      module: 'test-module',
      message: 'hello world',
      data: {
        phase: 'init',
      },
    });
  });

  it('should respect TRACE level when configured', async () => {
    const logger = getLogger('trace-module');
    const tempDir = await createTempDir();
    const logPath = path.join(tempDir, 'trace.log');

    Logger.configure({
      level: LogLevel.TRACE,
      console: false,
      file: {
        enabled: true,
        path: logPath,
      },
    });

    logger.trace('trace event');

    const content = await fs.readFile(logPath, 'utf-8');
    expect(content).toContain('"level":"TRACE"');
    expect(content).toContain('"message":"trace event"');
  });
});
