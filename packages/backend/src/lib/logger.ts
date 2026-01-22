import winston from 'winston';

/**
 * Structured Logger using Winston
 * Provides consistent logging across the application
 * with proper log levels and JSON formatting for machine parsing
 */

const logLevel = process.env.LOG_LEVEL || 'info';

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    // Add timestamp to every log
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    // Parse error objects to include stack traces
    winston.format.errors({ stack: true }),
    // JSON format for machine readability and structured logging
    winston.format.json()
  ),
  defaultMeta: { service: 'pr-manager-backend' },
  transports: [
    // Console output (always enabled for visibility)
    new winston.transports.Console({
      format: winston.format.combine(
        // Colorize console output for readability
        winston.format.colorize(),
        // Human-readable format for console
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          let metaStr = '';
          if (Object.keys(meta).length > 0 && meta.service !== 'pr-manager-backend') {
            metaStr = JSON.stringify(meta);
          }
          return `${timestamp} [${level}] ${message}${metaStr ? ` ${metaStr}` : ''}`;
        })
      ),
    }),
  ],
});

// In production, also log to files for persistence
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.json(),
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.json(),
    })
  );
}

/**
 * Log levels (from least to most severe):
 * - error: Error conditions
 * - warn: Warning conditions (something went wrong but recovered)
 * - info: Informational (startup, shutdown, normal operations)
 * - http: HTTP request/response
 * - debug: Debug information (verbose)
 *
 * Usage:
 * logger.error('Error message', { userId: '123', reason: 'Invalid password' })
 * logger.warn('Warning message', { metric: 'high_latency' })
 * logger.info('Informational message', { event: 'user_signup' })
 * logger.http('HTTP Request', { method: 'POST', path: '/auth/login' })
 * logger.debug('Debug message', { variable: 'value' })
 */

export default logger;
