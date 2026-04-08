import { logger } from '../utils/logger';

export class ServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function asServiceError(err: unknown, context?: Record<string, unknown>): ServiceError {
  if (err instanceof ServiceError) return err;
  logger.error('service_unexpected_error', {
    ...context,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return new ServiceError(500, 'Internal server error');
}
