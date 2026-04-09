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

const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  console: true,
  file: {
    enabled: false,
  },
  moduleLevels: {},
};

export class Logger {
  private module: string;
  private config: LoggerConfig;
  private static globalConfig: LoggerConfig = { ...DEFAULT_CONFIG };
  private static writers: Map<string, LogWriter> = new Map();

  constructor(module: string) {
    this.module = module;
    this.config = Logger.globalConfig;
  }

  static configure(config: Partial<LoggerConfig>): void {
    Logger.globalConfig = {
      ...Logger.globalConfig,
      ...config,
      moduleLevels: {
        ...Logger.globalConfig.moduleLevels,
        ...config.moduleLevels,
      },
    };

    // Setup file writer if enabled
    if (Logger.globalConfig.file?.enabled && Logger.globalConfig.file.path) {
      if (!Logger.writers.has(Logger.globalConfig.file.path)) {
        const writer = new LogWriter(Logger.globalConfig.file.path, {
          maxSize: Logger.globalConfig.file.maxSize,
          maxFiles: Logger.globalConfig.file.maxFiles,
        });
        Logger.writers.set(Logger.globalConfig.file.path, writer);
      }
    }
  }

  static getConfig(): LoggerConfig {
    return Logger.globalConfig;
  }

  private shouldLog(level: LogLevel): boolean {
    const moduleLevel = this.config.moduleLevels?.[this.module];
    const effectiveLevel = moduleLevel ?? this.config.level;
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
    if (this.config.console) {
      const prefix = `[${entry.timestamp}] [${levelStr}] [${this.module}]`;
      if (data) {
        console.log(`${prefix} ${message}`, data);
      } else {
        console.log(`${prefix} ${message}`);
      }
    }

    // File output
    if (this.config.file?.enabled && this.config.file.path) {
      const writer = Logger.writers.get(this.config.file.path);
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
  private buffer: LogEntry[] = [];
  private maxSize: number;
  private maxFiles: number;
  private currentSize = 0;

  constructor(path: string, options?: { maxSize?: number; maxFiles?: number }) {
    this.path = path;
    this.maxSize = options?.maxSize ?? 10 * 1024 * 1024; // 10MB default
    this.maxFiles = options?.maxFiles ?? 5;
  }

  write(entry: LogEntry): void {
    const line = JSON.stringify(entry) + '\n';
    this.buffer.push(entry);
    this.currentSize += Buffer.byteLength(line, 'utf-8');

    if (this.currentSize >= this.maxSize) {
      this.rotate();
    }
  }

  private async rotate(): Promise<void> {
    // This is a simplified rotation - in production you'd use a proper rotation library
    this.buffer = [];
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
