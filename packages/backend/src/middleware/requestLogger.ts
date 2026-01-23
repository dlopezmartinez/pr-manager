import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import logger from '../lib/logger.js';

/**
 * =============================================================================
 * REQUEST LOGGING MIDDLEWARE
 * =============================================================================
 *
 * Loguea todas las requests HTTP con:
 * - Método y path
 * - Status code
 * - Duración en ms
 * - IP del cliente
 * - User ID (si está autenticado)
 * - Request ID único para tracing
 *
 * El request ID se añade al header de respuesta para debugging:
 * X-Request-ID: abc123-def456-...
 *
 * =============================================================================
 */

// Extender Request para incluir requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

/**
 * Middleware que loguea requests HTTP
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generar ID único para esta request
  const requestId = randomUUID();
  req.requestId = requestId;
  req.startTime = Date.now();

  // Añadir request ID al header de respuesta
  res.setHeader('X-Request-ID', requestId);

  // Capturar cuando la respuesta termina
  res.on('finish', () => {
    const duration = Date.now() - (req.startTime || Date.now());
    const statusCode = res.statusCode;

    // Determinar nivel de log basado en status code
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'http';

    // Extraer user ID si está autenticado
    const userId = req.user?.userId;

    // Obtener IP real (considerando proxies)
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const clientIp = Array.isArray(ip) ? ip[0] : ip.split(',')[0].trim();

    // Datos a loguear
    const logData = {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode,
      duration,
      ip: clientIp,
      userAgent: req.headers['user-agent']?.substring(0, 100), // Truncar user agent
      ...(userId && { userId }),
      ...(statusCode >= 400 && { query: req.query }),
    };

    // No loguear health checks para reducir ruido
    if (req.path === '/health' || req.path === '/health/scheduler') {
      return;
    }

    // Loguear con el nivel apropiado
    const message = `${req.method} ${req.path} ${statusCode} ${duration}ms`;

    if (level === 'error') {
      logger.error(message, logData);
    } else if (level === 'warn') {
      logger.warn(message, logData);
    } else {
      logger.http(message, logData);
    }
  });

  next();
}

/**
 * Middleware para loguear errores con contexto de request
 */
export function errorLogger(err: Error, req: Request, res: Response, next: NextFunction): void {
  const duration = Date.now() - (req.startTime || Date.now());

  logger.error('Request failed with error', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    duration,
    error: err.message,
    stack: err.stack,
    userId: req.user?.userId,
  });

  next(err);
}
