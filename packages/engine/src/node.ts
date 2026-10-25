import { createRequire } from 'node:module';
import { UciEngine, type UciEngineOptions } from './UciEngine';

/** `@chess/engine/node`: Stockfish 19 (npm `stockfish`, GPL-3.0) inside the Node process. */

type StockfishFlavor = 'lite-single' | 'lite' | 'single' | 'full' | 'asm';

interface StockfishInstance {
  processCommand(cmd: string): void;
  terminate(): void;
}

type InitEngine = (flavor: string, onMessage: (line: string) => void) => StockfishInstance;

const require = createRequire(import.meta.url);

export function createNodeStockfish(
  flavor: StockfishFlavor = 'lite-single',
  opts?: UciEngineOptions,
): UciEngine {
  const initEngine = require('stockfish') as InitEngine;
  let deliver: (line: string) => void = () => {};
  const instance = initEngine(flavor, (line) => deliver(String(line)));
  return new UciEngine(
    {
      send: (cmd) => instance.processCommand(cmd),
      onLine: (cb) => {
        deliver = cb;
      },
      terminate: () => instance.terminate(),
    },
    opts,
  );
}

export { createProcessTransport } from './transports/process';

/**
 * The command that runs the bundled WASM Stockfish as its own process (UCI on stdin/stdout),
 * e.g. for a server worker that should be able to kill a stuck engine. The engine file is
 * started directly: the package's cli.js would add a second wrapper process.
 */
export function stockfishProcessCommand(flavor: StockfishFlavor = 'lite-single'): {
  command: string;
  args: string[];
} {
  const findEngine = (require('stockfish') as { findEngine: (flavor: string) => string })
    .findEngine;
  return { command: process.execPath, args: [findEngine(flavor)] };
}
