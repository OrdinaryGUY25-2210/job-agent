import { pino } from 'pino';

const IS_PROD = process.env['NODE_ENV'] === 'production';

export function createLogger(name: string) {
  return pino({
    name,
    level: process.env['LOG_LEVEL'] ?? (IS_PROD ? 'info' : 'debug'),
    ...(IS_PROD
      ? {}
      : {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
          },
        }),
  });
}

export type Logger = ReturnType<typeof createLogger>;