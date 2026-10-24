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
