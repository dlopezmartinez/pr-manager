/**
 * Logging Service
 * Provides structured logging with levels and environment awareness
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

interface LoggerConfig {
  level: LogLevel;
  prefix: string;
  enableTimestamp: boolean;
}

const defaultConfig: LoggerConfig = {
  level: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.WARN,
  prefix: '[PR-Viewer]',
  enableTimestamp: true,
};

class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  private formatMessage(level: string, message: string): string {
    const parts: string[] = [];
    
    if (this.config.enableTimestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }
    
    parts.push(this.config.prefix);
    parts.push(`[${level}]`);
    parts.push(message);
    
    return parts.join(' ');
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  /**
   * Log debug message (development only by default)
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message), ...args);
    }
  }

  /**
   * Log informational message
   */
  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage('INFO', message), ...args);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message), ...args);
    }
  }

  /**
   * Log error message
   */
  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message), ...args);
    }
  }

  /**
   * Create a child logger with a specific prefix
   */
  child(prefix: string): Logger {
    return new Logger({
      ...this.config,
      prefix: `${this.config.prefix}[${prefix}]`,
    });
  }

  /**
   * Set log level at runtime
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }
}

// Default logger instance
export const logger = new Logger();

// Pre-configured child loggers for different modules
export const mainLogger = logger.child('Main');
export const githubLogger = logger.child('GitHub');
export const notificationLogger = logger.child('Notification');
export const pollingLogger = logger.child('Polling');
export const uiLogger = logger.child('UI');

export default logger;
