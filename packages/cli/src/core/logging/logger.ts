/**
 * Unified Logging Module
 *
 * Features:
 * - Multiple log levels: TRACE, DEBUG, INFO, WARN, ERROR
 * - Per-module log level configuration
 * - Configurable output (console + file)
 * - File rotation support
 * - Structured JSON logging for machine parsing
 */

import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
}

export interface LoggerConfig {
  level: LogLevel;
  console?: boolean;
  file?: {
    enabled: boolean;
    path?: string;
    maxSize?: number;  // bytes
    maxFiles?: number;
  };
  moduleLevels?: Record<string, LogLevel>;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  module: string;
  message: string;
  data?: Record<string, unknown>;
}

function createDefaultConfig(): LoggerConfig {
  return {
    level: LogLevel.INFO,
    console: true,
    file: {
      enabled: false,
    },
    moduleLevels: {},
  };
}

export class Logger {
  private module: string;
  private static globalConfig: LoggerConfig = createDefaultConfig();
  private static writers: Map<string, LogWriter> = new Map();

  constructor(module: string) {
    this.module = module;
  }

  static configure(config: Partial<LoggerConfig>): void {
    const mergedFile = config.file
      ? {
          ...Logger.globalConfig.file,
          ...config.file,
          enabled: config.file.enabled ?? Logger.globalConfig.file?.enabled ?? false,
        }
      : Logger.globalConfig.file;

    Logger.globalConfig = {
      ...Logger.globalConfig,
      ...config,
      file: mergedFile,
      moduleLevels: {
        ...Logger.globalConfig.moduleLevels,
        ...config.moduleLevels,
      },
    };

    // Setup file writer if enabled
    if (Logger.globalConfig.file?.enabled && Logger.globalConfig.file.path) {
      const existingWriter = Logger.writers.get(Logger.globalConfig.file.path);
      if (existingWriter) {
        existingWriter.updateOptions({
          maxSize: Logger.globalConfig.file.maxSize,
          maxFiles: Logger.globalConfig.file.maxFiles,
        });
      } else {
        const writer = new LogWriter(Logger.globalConfig.file.path, {
          maxSize: Logger.globalConfig.file.maxSize,
          maxFiles: Logger.globalConfig.file.maxFiles,
        });
        Logger.writers.set(Logger.globalConfig.file.path, writer);
      }
    }
  }

  static reset(): void {
    Logger.globalConfig = createDefaultConfig();
    Logger.writers.clear();
  }

  static getConfig(): LoggerConfig {
    return Logger.globalConfig;
  }

  private shouldLog(level: LogLevel): boolean {
    const config = Logger.globalConfig;
    const moduleLevel = config.moduleLevels?.[this.module];
    const effectiveLevel = moduleLevel ?? config.level;
    return level >= effectiveLevel;
  }

  private log(level: LogLevel, levelStr: string, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: levelStr,
      module: this.module,
      message,
      data,
    };

    // Console output
    const config = Logger.globalConfig;

    if (config.console) {
      const prefix = `[${entry.timestamp}] [${levelStr}] [${this.module}]`;
      if (data) {
        console.log(`${prefix} ${message}`, data);
      } else {
        console.log(`${prefix} ${message}`);
      }
    }

    // File output
    if (config.file?.enabled && config.file.path) {
      const writer = Logger.writers.get(config.file.path);
      if (writer) {
        writer.write(entry);
      }
    }
  }

  trace(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, 'TRACE', message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, 'INFO', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, 'WARN', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, 'ERROR', message, data);
  }
}

class LogWriter {
  private path: string;
  private maxSize: number;
  private maxFiles: number;
  private currentSize: number;
  private fileErrorReported = false;

  constructor(path: string, options?: { maxSize?: number; maxFiles?: number }) {
    this.path = path;
    this.maxSize = options?.maxSize ?? 10 * 1024 * 1024; // 10MB default
    this.maxFiles = options?.maxFiles ?? 5;
    this.currentSize = this.readCurrentSize();
  }

  updateOptions(options?: { maxSize?: number; maxFiles?: number }): void {
    this.maxSize = options?.maxSize ?? this.maxSize;
    this.maxFiles = options?.maxFiles ?? this.maxFiles;
  }

  write(entry: LogEntry): void {
    try {
      const line = JSON.stringify(entry) + '\n';
      const lineSize = Buffer.byteLength(line, 'utf-8');

      fs.mkdirSync(path.dirname(this.path), { recursive: true });

      if (this.currentSize + lineSize > this.maxSize) {
        this.rotate();
      }

      fs.appendFileSync(this.path, line, 'utf-8');
      this.currentSize += lineSize;
      this.fileErrorReported = false;
    } catch (error) {
      if (!this.fileErrorReported) {
        process.stderr.write(
          `[transpec] Failed to write log file ${this.path}: ${(error as Error).message}\n`,
        );
        this.fileErrorReported = true;
      }
    }
  }

  private readCurrentSize(): number {
    try {
      return fs.statSync(this.path).size;
    } catch {
      return 0;
    }
  }

  private rotate(): void {
    if (this.maxFiles > 1) {
      const oldestFile = `${this.path}.${this.maxFiles - 1}`;
      if (fs.existsSync(oldestFile)) {
        fs.rmSync(oldestFile, { force: true });
      }

      for (let index = this.maxFiles - 2; index >= 1; index -= 1) {
        const source = `${this.path}.${index}`;
        const target = `${this.path}.${index + 1}`;
        if (fs.existsSync(source)) {
          fs.renameSync(source, target);
        }
      }

      if (fs.existsSync(this.path)) {
        fs.renameSync(this.path, `${this.path}.1`);
      }
    } else if (fs.existsSync(this.path)) {
      fs.rmSync(this.path, { force: true });
    }

    this.currentSize = 0;
  }
}

// Convenience factory function
export function getLogger(module: string): Logger {
  return new Logger(module);
}

// Module names for consistent logging
export const LogModules = {
  CLI: 'cli',
  FRAMEWORK: 'framework',
  ADAPTER: 'adapter',
  STORAGE: 'storage',
  ENGINE: 'engine',
  PARSER: 'parser',
  EMITTER: 'emitter',
  AI: 'ai',
} as const;
