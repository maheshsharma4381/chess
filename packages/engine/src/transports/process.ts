import { spawn } from 'node:child_process';
import type { UciTransport } from '../UciEngine';

/**
 * UCI over a child process's stdin/stdout: a native Stockfish binary on the server (plan
 * ruling R4). Output is re-split on newlines, since a pipe chunk can end mid-line. An exit
 * we did not ask for, or a failed spawn, is reported as an engine error.
 */
export function createProcessTransport(command: string, args: string[] = []): UciTransport {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  let onLine: (line: string) => void = () => {};
  let onError: (err: Error) => void = () => {};
  let pending: Error | null = null;
  let stopped = false;
  let buffer = '';

  const fail = (err: Error) => {
    if (stopped) return;
    stopped = true;
    pending = err;
    onError(err);
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    const end = buffer.lastIndexOf('\n');
    if (end < 0) return;
    const complete = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    onLine(complete);
  });
  child.once('error', (err) => fail(new Error(`Engine process failed to start: ${err.message}`)));
  child.once('exit', (code, signal) =>
    fail(new Error(`Engine process exited with code ${code ?? signal ?? 'unknown'}`)),
  );
  // Writing to a process that just died raises EPIPE on stdin; the exit handler reports it.
  child.stdin.on('error', () => {});

  return {
    send: (cmd) => {
      if (!stopped) child.stdin.write(`${cmd}\n`);
    },
    onLine: (cb) => {
      onLine = cb;
    },
    onError: (cb) => {
      onError = cb;
      // A spawn failure can land before UciEngine subscribes.
      if (pending) queueMicrotask(() => cb(pending!));
    },
    terminate: () => {
      if (stopped) return;
      stopped = true;
      child.kill();
    },
  };
}
