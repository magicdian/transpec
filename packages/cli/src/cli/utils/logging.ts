import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger, type LoggerConfig, LogLevel } from '../../core/logging/index.js';
import { getProjectLogFilePath, getProjectTranspecDir } from '../../core/skill/index.js';
import { type LoggingConfigSection, loadProjectConfig } from './project-config.js';

interface ConfigureProjectLoggerOptions {
  projectPath: string;
  verbose?: boolean;
  logFile?: string;
  enableFileLoggingByDefault?: boolean;
}

const LEVEL_ALIASES: Record<string, LogLevel> = {
  trace: LogLevel.TRACE,
  tracing: LogLevel.TRACE,
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  warning: LogLevel.WARN,
  error: LogLevel.ERROR,
};

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function parseConfiguredLevel(level: string | undefined): LogLevel {
  if (!level) {
    return LogLevel.INFO;
  }

  return LEVEL_ALIASES[level.trim().toLowerCase()] ?? LogLevel.INFO;
}

function resolveLogLevel(level: string | undefined, verbose: boolean | undefined): LogLevel {
  const configuredLevel = parseConfiguredLevel(level);
  if (!verbose) {
    return configuredLevel;
  }

  return Math.min(configuredLevel, LogLevel.DEBUG) as LogLevel;
}

function resolveLogPath(projectPath: string, configuredPath: string | undefined): string {
  if (!configuredPath) {
    return getProjectLogFilePath(projectPath);
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(projectPath, configuredPath);
}

function resolveFileConfig(
  projectPath: string,
  logging: LoggingConfigSection | undefined,
  enableFileLoggingByDefault: boolean,
  logFileOverride: string | undefined,
): LoggerConfig['file'] {
  if (logFileOverride) {
    return {
      enabled: true,
      path: resolveLogPath(projectPath, logFileOverride),
    };
  }

  const configuredFile = logging?.file;
  const hasExplicitPath = typeof configuredFile?.path === 'string' && configuredFile.path.length > 0;
  const usesLegacyDisabledDefault = configuredFile?.enabled === false && !hasExplicitPath;
  const enabled = hasExplicitPath
    ? configuredFile?.enabled !== false
    : configuredFile?.enabled === true || usesLegacyDisabledDefault || enableFileLoggingByDefault;

  return {
    enabled,
    path: enabled ? resolveLogPath(projectPath, configuredFile?.path) : undefined,
    maxSize: configuredFile?.maxSize,
    maxFiles: configuredFile?.maxFiles,
  };
}

async function hasTranspecDirectory(projectPath: string): Promise<boolean> {
  try {
    await fs.access(getProjectTranspecDir(projectPath));
    return true;
  } catch {
    return false;
  }
}

export async function configureProjectLogger(options: ConfigureProjectLoggerOptions): Promise<void> {
  const { projectPath, verbose, logFile, enableFileLoggingByDefault = false } = options;

  let loggingConfig: LoggingConfigSection | undefined;
  try {
    const config = await loadProjectConfig(projectPath);
    loggingConfig = config.logging;
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const shouldEnableProjectFileLogging = enableFileLoggingByDefault || await hasTranspecDirectory(projectPath);

  Logger.configure({
    level: resolveLogLevel(loggingConfig?.level, verbose),
    console: loggingConfig?.console ?? true,
    file: resolveFileConfig(projectPath, loggingConfig, shouldEnableProjectFileLogging, logFile),
  });
}
