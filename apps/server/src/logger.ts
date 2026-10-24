import { pino, type DestinationStream, type Logger } from 'pino';

export type { Logger };

/** Anything that could carry a credential is replaced before a line is written. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.id_token',
  '*.code',
];

export function createLogger(opts: { level?: string; stream?: DestinationStream } = {}): Logger {
  return pino(
    { level: opts.level ?? 'info', redact: { paths: REDACT_PATHS, censor: '[redacted]' } },
    opts.stream,
  );
}
