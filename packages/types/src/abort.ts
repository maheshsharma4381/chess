/**
 * The slice of AbortSignal shared code relies on. Structural, so packages compiled without
 * DOM or Node types can accept browser, React Native and Node signals alike.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}
