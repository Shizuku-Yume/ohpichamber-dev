import type { TerminalChunk } from '@/stores/useTerminalStore';
import type { TerminalReplaySize } from '@/lib/api/types';

export function composeTerminalReplay(chunks: readonly TerminalChunk[]) {
  const parts: string[] = [];
  const sizes: TerminalReplaySize[] = [];
  let offset = 0;
  const record = (size: TerminalReplaySize) => {
    if (sizes.at(-1)?.offset === size.offset) sizes.pop();
    sizes.push(size);
  };
  for (const chunk of chunks) {
    if (chunk.sizes) {
      for (const size of chunk.sizes) record({ ...size, offset: offset + size.offset });
    } else if (chunk.size) {
      record({ offset, ...chunk.size });
    }
    const data = chunk.replayData ?? chunk.data;
    parts.push(data);
    offset += data.length;
  }
  return { data: parts.join(''), sizes };
}

export interface TerminalChunkReplaySelection {
  reset: boolean;
  replay: boolean;
  pending: TerminalChunk[];
}

export function selectTerminalChunkReplay(
  chunks: TerminalChunk[],
  lastChunkId: number | null,
): TerminalChunkReplaySelection {
  if (chunks.length === 0) {
    return {
      reset: lastChunkId !== null,
      replay: false,
      pending: [],
    };
  }

  if (lastChunkId === null) {
    return {
      reset: false,
      replay: true,
      pending: chunks,
    };
  }

  let previousIndex = -1;
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const id = chunks[index].id;
    if (id === lastChunkId) {
      previousIndex = index;
      break;
    }
    if (id < lastChunkId) break;
  }

  if (previousIndex < 0) {
    return {
      reset: true,
      replay: true,
      pending: chunks,
    };
  }

  return {
    reset: false,
    replay: false,
    pending: chunks.slice(previousIndex + 1),
  };
}
