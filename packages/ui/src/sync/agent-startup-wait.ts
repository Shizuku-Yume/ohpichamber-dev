import { create } from 'zustand';

export const useAgentStartupStore = create<{ pending: ReadonlyMap<symbol, number> }>(() => ({ pending: new Map() }));

export function beginAgentStartupWait(runtimeRevision: number): () => void {
  const token = Symbol('agent-startup-wait');
  useAgentStartupStore.setState((state) => ({ pending: new Map(state.pending).set(token, runtimeRevision) }));
  return () => {
    useAgentStartupStore.setState((state) => {
      const pending = new Map(state.pending);
      pending.delete(token);
      return { pending };
    });
  };
}
