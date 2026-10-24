import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Logger } from './logger';

/**
 * Socket.io on the HTTP server. Phase 4 only proves the channel (ping/pong); Phase 5 adds the
 * authenticated game rooms on top.
 */
export function attachSocket(httpServer: HttpServer, deps: { logger: Logger }): Server {
  const io = new Server(httpServer, { serveClient: false });
  io.on('connection', (socket) => {
    deps.logger.debug({ id: socket.id }, 'socket connected');
    socket.on('ping', (ack: unknown) => {
      if (typeof ack === 'function') ack('pong');
    });
  });
  return io;
}
