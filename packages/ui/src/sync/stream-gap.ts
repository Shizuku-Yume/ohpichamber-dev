
type StreamGapListener = (runtimeKey: string) => void

const listeners = new Set<StreamGapListener>()

export function subscribeStreamGap(listener: StreamGapListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
