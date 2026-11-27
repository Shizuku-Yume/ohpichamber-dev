export interface SseWritableStream {
  readonly writableEnded?: boolean;
  readonly destroyed?: boolean;
  write(chunk: string | Uint8Array): boolean;
  once?(event: 'drain' | 'close' | 'error', listener: () => void): void;
  off?(event: 'drain' | 'close' | 'error', listener: () => void): void;
}

const waitForSseDrain = (res: SseWritableStream, signal?: AbortSignal | null): Promise<void> => new Promise((resolve) => {
  if (signal?.aborted || res.writableEnded || res.destroyed) {
    resolve();
    return;
  }
  const cleanup = () => {
    res.off?.('drain', onDone);
    res.off?.('close', onDone);
    res.off?.('error', onDone);
    signal?.removeEventListener?.('abort', onDone);
  };
  const onDone = () => {
    cleanup();
    resolve();
  };

  res.once?.('drain', onDone);
  res.once?.('close', onDone);
  res.once?.('error', onDone);
  signal?.addEventListener?.('abort', onDone, { once: true });
});

export const writeSseChunkWithBackpressure = async (
  res: SseWritableStream,
  value: string | Uint8Array | null | undefined,
  signal?: AbortSignal | null,
): Promise<boolean> => {
  if (!value || value.length === 0 || signal?.aborted || res.writableEnded || res.destroyed) {
    return false;
  }

  const flushed = res.write(value);
  if (flushed !== false) {
    return true;
  }

  await waitForSseDrain(res, signal);
  return !signal?.aborted && !res.writableEnded && !res.destroyed;
};
