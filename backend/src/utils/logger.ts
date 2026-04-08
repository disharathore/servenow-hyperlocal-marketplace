import winston from 'winston';

const level = process.env.LOG_LEVEL || 'info';

const format = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level,
  format,
  defaultMeta: { service: 'servenow-backend' },
  transports: [new winston.transports.Console()],
});

export type LogMeta = Record<string, unknown>;
