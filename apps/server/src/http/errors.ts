import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { z } from 'zod';
import type { Logger } from '../logger';

/** An error whose message is safe to show the client. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Parses `value` with `schema`, or throws a 400 listing each bad field. */
export function parseBody<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const details: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || 'body';
    details[key] ??= issue.message;
  }
  throw new HttpError(400, 'Invalid request', details);
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof HttpError) {
      res
        .status(err.status)
        .json(err.details ? { error: err.message, details: err.details } : { error: err.message });
      return;
    }
    // express.json() reports bad JSON as a SyntaxError with status 400.
    if (err instanceof SyntaxError && (err as { status?: number }).status === 400) {
      res.status(400).json({ error: 'Malformed JSON body' });
      return;
    }
    if ((err as { type?: string }).type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body too large' });
      return;
    }
    logger.error({ err, method: req.method, url: req.originalUrl }, 'unhandled error');
    res.status(500).json({ error: 'Internal error' });
  };
}
