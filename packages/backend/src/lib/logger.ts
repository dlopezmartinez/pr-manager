import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

/**
 * =============================================================================
 * PR MANAGER - LOGGING SYSTEM
 * =============================================================================
 *
 * Sistema de logging estructurado con:
 * - Rotación automática de logs (diaria)
 * - Compresión de logs antiguos
 * - Retención configurable (14 días por defecto)
 * - Separación por nivel (error, combined, http)
 * - Formato JSON para análisis automatizado
 *
 * UBICACIÓN DE LOGS (producción):
 * - logs/error-YYYY-MM-DD.log    → Solo errores
 * - logs/combined-YYYY-MM-DD.log → Todos los logs
 * - logs/http-YYYY-MM-DD.log     → Requests HTTP
 *
 * CONSULTAR LOGS:
 * - Ver últimos errores:    tail -f logs/error-$(date +%Y-%m-%d).log
 * - Ver todos los logs:     tail -f logs/combined-$(date +%Y-%m-%d).log
 * - Ver requests HTTP:      tail -f logs/http-$(date +%Y-%m-%d).log
 * - Buscar errores:         grep "error" logs/combined-*.log
 * - Buscar por usuario:     grep "userId.*abc123" logs/combined-*.log
 * - Analizar con jq:        cat logs/combined-*.log | jq 'select(.level=="error")'
 *
 * =============================================================================
 */

const logLevel = process.env.LOG_LEVEL || 'info';
const logsDir = process.env.LOGS_DIR || 'logs';

// Formato común para todos los logs
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Formato para consola (desarrollo)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    // Extraer campos útiles del meta
    const { service, ...rest } = meta;
    let metaStr = '';

    if (Object.keys(rest).length > 0) {
      // Formatear meta de forma legible
      const formatted = Object.entries(rest)
        .map(([key, value]) => {
          if (typeof value === 'object') {
            return `${key}=${JSON.stringify(value)}`;
          }
          return `${key}=${value}`;
        })
        .join(' ');
      metaStr = ` | ${formatted}`;
    }

    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

// Crear logger base
const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: 'pr-manager-backend' },
  transports: [
    // Consola siempre activa
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});

// En producción, añadir rotación de archivos
if (process.env.NODE_ENV === 'production') {
  // Errores (solo nivel error)
  logger.add(
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',        // Rotar si supera 20MB
      maxFiles: '14d',       // Mantener 14 días
      zippedArchive: true,   // Comprimir logs antiguos (.gz)
      format: logFormat,
    })
  );

  // Todos los logs (combined)
  logger.add(
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',        // Rotar si supera 50MB
      maxFiles: '14d',       // Mantener 14 días
      zippedArchive: true,
      format: logFormat,
    })
  );

  // HTTP requests (nivel http)
  logger.add(
    new DailyRotateFile({
      filename: path.join(logsDir, 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'http',
      maxSize: '50m',
      maxFiles: '7d',        // HTTP logs solo 7 días (son muchos)
      zippedArchive: true,
      format: logFormat,
    })
  );

  logger.info('Logger initialized with file rotation', {
    logsDir,
    retention: '14 days',
    zippedArchive: true,
  });
}

/**
 * =============================================================================
 * LOG LEVELS (de menos a más severo):
 * =============================================================================
 *
 * debug  → Información detallada para debugging
 * http   → Requests/responses HTTP
 * info   → Eventos informativos (startup, operaciones normales)
 * warn   → Advertencias (algo falló pero se recuperó)
 * error  → Errores que requieren atención
 *
 * =============================================================================
 * EJEMPLOS DE USO:
 * =============================================================================
 *
 * // Error con contexto
 * logger.error('Failed to process payment', {
 *   userId: '123',
 *   error: err.message,
 *   stack: err.stack,
 * });
 *
 * // Warning
 * logger.warn('Rate limit approaching', {
 *   userId: '123',
 *   currentRate: 95,
 *   limit: 100,
 * });
 *
 * // Info
 * logger.info('User signed up', {
 *   userId: '123',
 *   email: 'user@example.com',
 * });
 *
 * // HTTP request (usado por middleware)
 * logger.http('Request completed', {
 *   method: 'POST',
 *   path: '/auth/login',
 *   statusCode: 200,
 *   duration: 145,
 * });
 *
 * // Debug
 * logger.debug('Cache hit', { key: 'user:123' });
 *
 * =============================================================================
 */

export default logger;

/**
 * Helper para crear child logger con contexto
 * Útil para añadir requestId u otro contexto a todos los logs
 */
export function createChildLogger(meta: Record<string, unknown>) {
  return logger.child(meta);
}

/**
 * Helper para loguear errores con stack trace completo
 */
export function logError(message: string, error: Error, meta?: Record<string, unknown>) {
  logger.error(message, {
    error: error.message,
    stack: error.stack,
    name: error.name,
    ...meta,
  });
}
