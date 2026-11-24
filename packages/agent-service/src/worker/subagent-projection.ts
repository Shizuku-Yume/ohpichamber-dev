import { z } from 'zod';
import type { Subagent } from '@openchamber/agent-contract';
import type { SubagentLifecyclePayload } from '@oh-my-pi/pi-coding-agent/task';
import { ProjectionError } from '../projection/journal.ts';
import type { ProjectionInput } from '../projection/protocol.ts';

export const SubagentLifecyclePayloadSchema = z.object({
  id: z.string(),
  agent: z.string(),
  agentSource: z.enum(['bundled', 'user', 'project']),
  description: z.string().optional(),
  status: z.enum(['started', 'completed', 'failed', 'aborted']),
  sessionFile: z.string().optional(),
  parentToolCallId: z.string().optional(),
  index: z.number(),
  detached: z.boolean().optional(),
}) satisfies z.ZodType<SubagentLifecyclePayload>;

const SubagentProgressObservationSchema = z.object({
  agent: z.string(),
  task: z.string(),
  parentToolCallId: z.string().optional(),
  /** The caller's verbatim brief; a spawn's own words on how open-ended its work is. */
  assignment: z.string().optional(),
  progress: z.object({
    id: z.string(),
    agent: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'failed', 'aborted']),
    currentTool: z.string().optional(),
    currentToolArgs: z.string().optional(),
    currentToolIntent: z.string().optional(),
    tokens: z.number().optional(),
    cost: z.number().optional(),
    toolCount: z.number().optional(),
    requests: z.number().optional(),
    description: z.string().optional(),
    task: z.string().optional(),
    lastIntent: z.string().optional(),
    stage: z.string().optional(),
    completionPercent: z.number().min(0).max(100).optional(),
    recentOutput: z.array(z.string()).optional(),
    durationMs: z.number().optional(),
    contextTokens: z.number().optional(),
    contextWindow: z.number().optional(),
    resolvedModel: z.string().optional(),
    retryState: z.object({ delayMs: z.number(), startedAtMs: z.number() }).optional(),
  }),
});
export type SubagentProgressObservation = z.infer<typeof SubagentProgressObservationSchema>;
export const SubagentProgressSchema = SubagentProgressObservationSchema;

const SubagentEventObservationSchema = z.object({
  id: z.string(),
  event: z.object({
    type: z.string(),
    toolName: z.string().optional(),
    toolCallId: z.string().optional(),
  }),
});
export type SubagentEventObservation = z.infer<typeof SubagentEventObservationSchema>;
export const SubagentEventSchema = SubagentEventObservationSchema;

/**
 * Live `subagent.updated` projection for `task` `tasks[]` children observed on
 * the subagent event bus. Owns the running/terminal map transitions and the
 * pending-event queue; the maps are shared with `WorkerSession`, which still
 * serves listSubagents, permission flows and `subagent.updated` consumers.
 * `emit` is the session's gate (closed sessions drop frames); `publish` is the
 * raw bus write used at teardown so the terminal record reaches subscribers
 * after the emit gate has shut.
 */
export class SubagentProjector {
  constructor(
    private readonly sessionId: string,
    private readonly liveSubagents: Map<string, Subagent>,
    private readonly pendingSubagentEvents: Map<string, SubagentEventObservation[]>,
    private readonly toolCallToSubagentId: Map<string, string>,
    private readonly emit: (inputs: ProjectionInput[]) => void,
    private readonly publish: (inputs: ProjectionInput[]) => void,
  ) { }

  handleSubagentLifecycle(payload: SubagentLifecyclePayload): void {
    const existing = this.liveSubagents.get(payload.id);
    const status: Subagent['status'] = payload.status === 'started' ? 'running'
      : payload.status === 'completed' ? 'completed'
        : payload.status === 'aborted' ? 'cancelled'
          : 'failed';
    let parentSubagentId: string | undefined = existing?.parentSubagentId;
    let depth = existing?.depth ?? 0;
    if (!parentSubagentId && payload.parentToolCallId) {
      const parentId = this.toolCallToSubagentId.get(payload.parentToolCallId);
      if (parentId && parentId !== payload.id) {
        parentSubagentId = parentId;
        const parent = this.liveSubagents.get(parentId);
        depth = Math.min(8, (parent?.depth ?? 0) + 1);
      }
    }
    const subagent: Subagent = {
      subagentId: payload.id,
      parentSessionId: this.sessionId,
      // The canonical child session id only exists once the registry reads the
      // child's JSONL header; payload.id is the allocated subagent name, not a
      // session id, so a live frame must not present it as one.
      childSessionId: existing?.childSessionId,
      toolCallId: payload.parentToolCallId ?? existing?.toolCallId,
      name: payload.id,
      role: payload.agent,
      solutionSpace: existing?.solutionSpace,
      status,
      activeTool: status === 'running' ? existing?.activeTool : undefined,
      activeToolArgs: status === 'running' ? existing?.activeToolArgs : undefined,
      model: existing?.model,
      tokens: existing?.tokens,
      contextTokens: existing?.contextTokens,
      contextWindow: existing?.contextWindow,
      cost: existing?.cost,
      turnCount: existing?.turnCount,
      retryCountdown: status === 'running' ? existing?.retryCountdown : undefined,
      depth,
      parentSubagentId,
      description: payload.description ?? existing?.description,
      task: existing?.task,
      lastIntent: existing?.lastIntent,
      stage: existing?.stage,
      completionPercent: existing?.completionPercent,
      recentOutput: existing?.recentOutput,
      durationMs: existing?.durationMs,
    };
    this.liveSubagents.set(payload.id, subagent);
    this.emit([{ timestamp: Date.now(), transient: true, event: { type: 'subagent.updated', subagent: { ...subagent } } }]);
    this.flushPendingSubagentEvents(payload.id);
  }

  /**
   * Worker teardown aborts every detached `tasks[]` child still running, so
   * each `running` row is settled to `cancelled` before dispose. Parked and
   * idle rows are persisted transcripts, not live work, and keep their status.
   * The frame ships deliberately after `closed` is set: `emit` is the gate that
   * keeps new projections out of teardown, but subscribers must receive the
   * honest terminal record now rather than after the process is gone. A
   * downstream journal that is already closed refuses the frame; the
   * registry's own exit settle still persists the terminal record.
   */
  settleSubagentsForClose(): void {
    for (const existing of this.liveSubagents.values()) {
      if (existing.status !== 'running') continue;
      const subagent: Subagent = { ...existing, status: 'cancelled', activeTool: undefined, activeToolArgs: undefined, retryCountdown: undefined };
      this.liveSubagents.set(subagent.subagentId, subagent);
      try {
        this.publish([{ timestamp: Date.now(), transient: true, event: { type: 'subagent.updated', subagent: { ...subagent } } }]);
      } catch (error) {
        if (!(error instanceof ProjectionError && error.code === 'RESYNC_REQUIRED')) throw error;
      }
    }
  }

  handleSubagentProgress(payload: SubagentProgressObservation): void {
    const p = payload.progress;
    if (!p) return;
    const existing = this.liveSubagents.get(p.id);
    let parentSubagentId = existing?.parentSubagentId;
    let depth = existing?.depth ?? 0;
    if (!parentSubagentId && payload.parentToolCallId) {
      const parentId = this.toolCallToSubagentId.get(payload.parentToolCallId);
      if (parentId && parentId !== p.id) {
        parentSubagentId = parentId;
        const parent = this.liveSubagents.get(parentId);
        depth = Math.min(8, (parent?.depth ?? 0) + 1);
      }
    }
    let retryCountdown: number | undefined;
    if (p.retryState) {
      const remainingMs = Math.max(0, p.retryState.delayMs - (Date.now() - p.retryState.startedAtMs));
      retryCountdown = Math.ceil(remainingMs / 1000);
    }
    const status: Subagent['status'] = p.status === 'completed' ? 'completed'
      : p.status === 'aborted' ? 'cancelled'
        : p.status === 'failed' ? 'failed'
          : 'running';
    const subagent: Subagent = {
      subagentId: p.id,
      parentSessionId: this.sessionId,
      childSessionId: existing?.childSessionId,
      toolCallId: payload.parentToolCallId ?? existing?.toolCallId,
      name: p.id,
      role: p.agent || payload.agent,
      solutionSpace: payload.assignment ?? existing?.solutionSpace,
      status,
      activeTool: status === 'running' ? p.currentTool : undefined,
      activeToolArgs: status === 'running' ? p.currentToolArgs : undefined,
      model: p.resolvedModel ?? existing?.model,
      tokens: p.tokens !== undefined && p.tokens >= 0 ? p.tokens : existing?.tokens,
      contextTokens: p.contextTokens !== undefined && p.contextTokens >= 0 ? p.contextTokens : existing?.contextTokens,
      contextWindow: p.contextWindow !== undefined && p.contextWindow > 0 ? p.contextWindow : existing?.contextWindow,
      cost: p.cost !== undefined && p.cost >= 0 ? p.cost : existing?.cost,
      turnCount: p.toolCount ?? p.requests ?? existing?.turnCount,
      retryCountdown: status === 'running' ? retryCountdown : undefined,
      depth,
      parentSubagentId,
      description: p.description ?? existing?.description,
      task: p.task ?? payload.task ?? existing?.task,
      lastIntent: p.currentToolIntent ?? p.lastIntent ?? existing?.lastIntent,
      stage: p.stage ?? existing?.stage,
      completionPercent: p.completionPercent ?? existing?.completionPercent,
      recentOutput: p.recentOutput ?? existing?.recentOutput,
      durationMs: p.durationMs ?? existing?.durationMs,
    };
    this.liveSubagents.set(p.id, subagent);
    this.emit([{ timestamp: Date.now(), transient: true, event: { type: 'subagent.updated', subagent: { ...subagent } } }]);
    this.flushPendingSubagentEvents(p.id);
  }

  handleSubagentEvent(payload: SubagentEventObservation): void {
    const { id, event } = payload;
    const existing = this.liveSubagents.get(id);
    if (!existing) {
      // The first tool_execution_start can arrive before the 'started'
      // lifecycle frame; hold it so the row opens with its initial tool.
      const queue = this.pendingSubagentEvents.get(id) ?? [];
      if (queue.length < 32) queue.push(payload);
      this.pendingSubagentEvents.set(id, queue);
      return;
    }
    let changed = false;
    const updated: Subagent = { ...existing };
    if (event.type === 'tool_execution_start') {
      if (event.toolName) {
        updated.activeTool = event.toolName;
        changed = true;
      }
      if (event.toolCallId) {
        this.toolCallToSubagentId.set(event.toolCallId, id);
      }
    } else if (event.type === 'tool_execution_end') {
      if (updated.activeTool) {
        updated.activeTool = undefined;
        updated.activeToolArgs = undefined;
        changed = true;
      }
    }
    if (changed) {
      this.liveSubagents.set(id, updated);
      this.emit([{ timestamp: Date.now(), transient: true, event: { type: 'subagent.updated', subagent: { ...updated } } }]);
    }
  }

  // A fast subagent's first tool events can race its 'started'/progress frame;
  // replay the buffered ones once a row exists so it keeps its initial tool.
  private flushPendingSubagentEvents(id: string): void {
    const buffered = this.pendingSubagentEvents.get(id);
    if (!buffered) return;
    this.pendingSubagentEvents.delete(id);
    for (const pending of buffered) this.handleSubagentEvent(pending);
  }
}
