import React from 'react';
import type { Session } from '@openchamber/agent-contract';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { createLaneCache, loadLaneDiffStat, loadLaneLastTurn, type LaneDiffStat, type LaneLastTurn } from './laneData';

export type LaneReplyState = { state: 'loading' } | ({ state: 'ready' } & LaneLastTurn) | { state: 'error' };
export type LaneDiffState = { state: 'none' } | { state: 'loading' } | { state: 'ready'; stat: LaneDiffStat } | { state: 'error' };
export type LaneSummary = { reply: LaneReplyState; diff: LaneDiffState };

export type LaneSummaryInput = {
  sessionId: string;
  session: Session | undefined;
  worktreePath: string | null;
};

const replyCache = createLaneCache<LaneLastTurn>();
const diffCache = createLaneCache<LaneDiffStat>();

const LOADING: LaneSummary = { reply: { state: 'loading' }, diff: { state: 'loading' } };

export function useLaneSummaries(
  members: readonly LaneSummaryInput[],
  activeSessionIds: ReadonlySet<string>,
): ReadonlyMap<string, LaneSummary> {
  const [summaries, setSummaries] = React.useState<ReadonlyMap<string, LaneSummary>>(new Map());
  const requestedRef = React.useRef(new Map<string, string>());
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  React.useEffect(() => {
    const runtimeKey = getRuntimeKey();
    const apply = (sessionId: string, token: string, patch: Partial<LaneSummary>) => {
      if (!mountedRef.current || getRuntimeKey() !== runtimeKey || requestedRef.current.get(sessionId) !== token) return;
      setSummaries((current) => new Map(current).set(sessionId, { ...(current.get(sessionId) ?? LOADING), ...patch }));
    };
    for (const member of members) {
      const session = member.session;
      if (!session || activeSessionIds.has(member.sessionId)) continue;
      const token = replyCache.tokenFor(member.sessionId, `${session.epoch}:${session.headSequence}:${member.worktreePath ?? ''}`);
      if (requestedRef.current.get(member.sessionId) === token) continue;
      requestedRef.current.set(member.sessionId, token);

      const cachedReply = replyCache.get(member.sessionId, token);
      if (cachedReply !== undefined) {
        apply(member.sessionId, token, { reply: { state: 'ready', ...cachedReply } });
      } else {
        loadLaneLastTurn(member.sessionId).then(
          (turn) => {
            if (getRuntimeKey() !== runtimeKey) return;
            replyCache.set(member.sessionId, token, turn);
            apply(member.sessionId, token, { reply: { state: 'ready', ...turn } });
          },
          () => apply(member.sessionId, token, { reply: { state: 'error' } }),
        );
      }

      const worktreePath = member.worktreePath;
      if (!worktreePath) {
        apply(member.sessionId, token, { diff: { state: 'none' } });
        continue;
      }
      const cachedDiff = diffCache.get(member.sessionId, token);
      if (cachedDiff) {
        apply(member.sessionId, token, { diff: { state: 'ready', stat: cachedDiff } });
      } else {
        loadLaneDiffStat(worktreePath).then(
          (stat) => {
            if (getRuntimeKey() !== runtimeKey) return;
            diffCache.set(member.sessionId, token, stat);
            apply(member.sessionId, token, { diff: { state: 'ready', stat } });
          },
          () => apply(member.sessionId, token, { diff: { state: 'error' } }),
        );
      }
    }
  }, [activeSessionIds, members]);

  return summaries;
}
