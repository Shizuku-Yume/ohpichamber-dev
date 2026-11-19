import { create } from 'zustand';
import type { PullRequestSource } from '@/lib/diff/pullRequestDiff';
import type { SourceControlReadContext } from '@/lib/source-control/types';

interface PullRequestDiffRequest {
  source: PullRequestSource;
  context: SourceControlReadContext;
}

interface PullRequestSelection {
  source: PullRequestSource;
  handoff: PullRequestSource | null;
}

interface PullRequestSelectionState {
  selections: Map<string, PullRequestSelection>;
<<<<<<< HEAD
  /** A pull request another surface asked Changes to show, per directory. */
  diffRequests: Map<string, PullRequestDiffRequest>;
  /** Authority selected by the board, retained after the request is consumed. */
  diffContexts: Map<string, SourceControlReadContext>;
  /**
   * The repository the phone's Changes shows, per folder that is not one
   * itself, in place of the Git selection: the one a requested PR belongs to,
   * until the next request for that folder or a repository picked there.
   */
||||||| bc50ba56aa
  /** A pull request another surface asked Changes to show, per directory. */
  diffRequests: Map<string, PullRequestSource>;
  /**
   * The repository the phone's Changes shows, per folder that is not one
   * itself, in place of the Git selection: the one a requested PR belongs to,
   * until the next request for that folder or a repository picked there.
   */
=======
  diffRequests: Map<string, PullRequestSource>;
>>>>>>> upstream/main
  changesRepositories: Map<string, string>;
  select: (key: string, source: PullRequestSource) => void;
  acceptHandoff: (key: string, source: PullRequestSource) => void;
<<<<<<< HEAD
  /** Each call is a new request, so asking for the same PR again shows it again. */
  requestDiff: (directory: string, source: PullRequestSource, context: SourceControlReadContext, repository?: string | null) => void;
||||||| bc50ba56aa
  /** Each call is a new request, so asking for the same PR again shows it again. */
  requestDiff: (directory: string, source: PullRequestSource, repository?: string | null) => void;
=======
  requestDiff: (directory: string, source: PullRequestSource, repository?: string | null) => void;
>>>>>>> upstream/main
  clearChangesRepository: (directory: string) => void;
<<<<<<< HEAD
  /** Drops `source` once Changes has taken it, so it never comes back on another branch. */
  settleDiffRequest: (directory: string, request: PullRequestDiffRequest) => void;
  clearDiffContext: (directory: string, context: SourceControlReadContext) => void;
||||||| bc50ba56aa
  /** Drops `source` once Changes has taken it, so it never comes back on another branch. */
  settleDiffRequest: (directory: string, source: PullRequestSource) => void;
=======
  settleDiffRequest: (directory: string, source: PullRequestSource) => void;
>>>>>>> upstream/main
}

const remember = (state: PullRequestSelectionState, key: string, selection: PullRequestSelection) => {
  const selections = new Map(state.selections);
  selections.delete(key);
  selections.set(key, selection);
  if (selections.size > 100) {
    const oldest = selections.keys().next().value;
    if (oldest !== undefined) selections.delete(oldest);
  }
  return { selections };
};

export const usePullRequestSelectionStore = create<PullRequestSelectionState>((set) => ({
  selections: new Map(),
  diffRequests: new Map(),
  diffContexts: new Map(),
  changesRepositories: new Map(),
  select: (key, source) => set((state) => remember(state, key, { source, handoff: state.selections.get(key)?.handoff ?? null })),
  acceptHandoff: (key, source) => set((state) => state.selections.get(key)?.handoff === source
    ? state : remember(state, key, { source, handoff: source })),
  requestDiff: (directory, source, context, repository = null) => set((state) => {
    const diffRequests = new Map(state.diffRequests);
    diffRequests.set(directory, { source: { ...source }, context });
    const diffContexts = new Map(state.diffContexts);
    diffContexts.set(directory, context);
    if (!repository && !state.changesRepositories.has(directory)) return { diffRequests, diffContexts };
    const changesRepositories = new Map(state.changesRepositories);
    if (repository) changesRepositories.set(directory, repository);
    else changesRepositories.delete(directory);
    return { diffRequests, diffContexts, changesRepositories };
  }),
  clearChangesRepository: (directory) => set((state) => {
    const changesRepositories = new Map(state.changesRepositories);
    const diffContexts = new Map(state.diffContexts);
    changesRepositories.delete(directory);
    diffContexts.delete(directory);
    return { changesRepositories, diffContexts };
  }),
  settleDiffRequest: (directory, request) => set((state) => {
    if (state.diffRequests.get(directory) !== request) return state;
    const diffRequests = new Map(state.diffRequests);
    diffRequests.delete(directory);
    return { diffRequests };
  }),
  clearDiffContext: (directory, context) => set((state) => {
    if (state.diffContexts.get(directory) !== context) return state;
    const diffContexts = new Map(state.diffContexts);
    diffContexts.delete(directory);
    const diffRequests = new Map(state.diffRequests);
    if (diffRequests.get(directory)?.context === context) diffRequests.delete(directory);
    return { diffContexts, diffRequests };
  }),
}));
