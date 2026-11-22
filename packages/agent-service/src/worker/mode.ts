import { VibeSessionRegistry, type VibeOwnerScope, type VibeParentSession } from '@oh-my-pi/pi-coding-agent/vibe/runtime';
import { journalJudgmentUsage, resolveJudge, type JudgeDeps } from '@oh-my-pi/pi-coding-agent/judgment';
import { cfgGoalContinuationModes } from '@oh-my-pi/pi-coding-agent/goals/settings';
import { goalFromModeData } from '@oh-my-pi/pi-coding-agent/goals/state';
import type { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { RpcGoalController, type RpcGoalCommand, type RpcGoalResult, type RpcGoalSession } from '@oh-my-pi/pi-coding-agent/modes/rpc/rpc-goal';
import type { AgentSessionEvent } from '@oh-my-pi/pi-coding-agent/session/agent-session-events';
import { z } from 'zod';
import { SessionModeSchema, type SessionMode } from '@openchamber/agent-contract';
import type { AgentSession } from '@oh-my-pi/pi-coding-agent/session/agent-session';
import { isMCPToolName } from '@oh-my-pi/pi-coding-agent/tools/builtin-names';
import type { PlanProposalHandler } from '@oh-my-pi/pi-coding-agent/tools/resolve';
import { parseConfiguredThinkingLevel } from '@oh-my-pi/pi-tui/thinking';
import { ProjectionError } from '../projection/journal.ts';

const ThinkingLevelSchema = z.string().transform((value, context) => {
  const level = parseConfiguredThinkingLevel(value);
  if (level !== undefined) return level;
  context.addIssue({ code: 'custom', message: 'Invalid native thinking level' });
  return z.NEVER;
});
const PlanModeDataSchema = z.object({
  planFilePath: z.string().optional(),
  previousTools: z.array(z.string()).optional(),
  previousMounted: z.array(z.string()).optional(),
  previousRegistered: z.array(z.string()).optional(),
  previousModel: z.object({ provider: z.string().min(1), id: z.string().min(1), thinkingLevel: ThinkingLevelSchema.optional() }).optional(),
});
type PlanModeData = z.infer<typeof PlanModeDataSchema>;
type VibePrevious = { tools: string[]; ownerScope: VibeOwnerScope };
type Previous = {
  tools: string[];
  mounted: string[];
  registered: string[];
  model?: PlanModeData['previousModel'];
};
function planReference(value: string | undefined): string {
  const parsed = SessionModeSchema.safeParse({ kind: 'plan', status: 'active', planReference: value });
  return parsed.success && parsed.data.kind === 'plan' ? parsed.data.planReference : 'local://PLAN.md';
}

/**
 * Native goal controller whose continuation decision waits for the Host-owned
 * goal check. OMP still owns continuation, tool restoration and the completion
 * journal: the same terminal `agent_end` is handed to `super.observe` only after
 * the verdict has paused or completed the goal, so the native path is not
 * duplicated and no later event is needed to journal the completion.
 */
class GoalVerifyingController extends RpcGoalController {
  private verifiedGoalId: string | null = null;
  private turns = 0;
  private check: Promise<void> | null = null;
  /**
   * The in-flight check has already decided (paused/completed the goal), so the
   * session is not busy any more even though the promise is still unwinding.
   * Publishing `continuationPending` only when it resolves would leave the goal
   * briefly un-resumable right after its own pause.
   */
  private decided = false;

  constructor(
    session: RpcGoalSession,
    onContinuationDropped: (() => void) | undefined,
    private readonly judgeDeps: Pick<JudgeDeps, 'settings' | 'registry' | 'sessionModel' | 'sessionId' | 'costGate' | 'onUsage'>,
    private readonly goalSession: AgentSession,
    private readonly checker: GoalChecker,
    private readonly maxAutoTurns: number,
    private readonly context: (objective: string) => Record<string, string | number> & { objectiveId: string },
  ) {
    super(session, onContinuationDropped);
    this.onContinuationDropped = onContinuationDropped;
  }

  private readonly onContinuationDropped: (() => void) | undefined;

  /** A pending verdict is work: the session must not look settled while it runs. */
  override get continuationPending(): boolean { return (this.check !== null && !this.decided) || super.continuationPending; }

  /**
   * An explicit `create`/`resume` is the user starting or restarting automatic
   * work, so it gets a fresh turn budget and a live abort signal. The native
   * controller resets its own continuation state on the same commands; without
   * this, a resumed goal would pause on the cap it already hit—same goal id, so
   * `observe` never re-arms—and a host abort's dead signal would silence every
   * later verdict. The reset lands before the scheduled continuation turn runs.
   */
  override async handle(command: RpcGoalCommand): Promise<RpcGoalResult> {
    const result = await super.handle(command);
    if (command.op === 'create' || command.op === 'resume') {
      this.verifiedGoalId = null;
      this.turns = 0;
      this.abort = new AbortController();
      this.decided = false;
    }
    return result;
  }

  override observe(event: AgentSessionEvent): void {
    if (event.type !== 'agent_end') {
      super.observe(event);
      return;
    }
    const goalId = this.goalId();
    const objective = this.objective();
    if (!goalId || !objective) { super.observe(event); return; }
    if (this.verifiedGoalId !== goalId) {
      this.verifiedGoalId = goalId;
      this.turns = 0;
      // A new goal re-arms the check; an abort belonged to the previous one.
      this.abort = new AbortController();
    }
    this.turns += 1;
    const abort = this.abort;
    this.decided = false;
    this.check = this.verify(objective, goalId, abort.signal)
      .catch(() => {})
      .finally(() => {
        this.check = null;
        // The verdict already paused or completed the goal; OMP decides the rest
        // from this same terminal event, so the completion is journaled now.
        super.observe(event);
        // If the verdict ended the goal, no continuation follows: tell the host
        // so its pending-continuation marker clears instead of waiting forever.
        if (!this.goalSession.getGoalModeState()?.enabled) this.onContinuationDropped?.();
      });
    void this.check;
  }

  private goalId(): string | null {
    const goal = this.goalSession.getGoalModeState()?.goal;
    return goal && goal.status === 'active' ? goal.id : null;
  }

  private objective(): string | null {
    const goal = this.goalSession.getGoalModeState()?.goal;
    return goal && goal.status === 'active' ? goal.objective : null;
  }

  /** A host abort voids the verdict this check would produce; the next goal re-arms it. */
  private abort = new AbortController();

  override stopForHostAbort(): void {
    super.stopForHostAbort();
    this.abort.abort();
  }

  private async verify(objective: string, goalId: string, signal: AbortSignal): Promise<void> {
    // The cap counts automatic goal turns for this goal, starting at the first check.
    if (this.turns >= this.maxAutoTurns) {
      this.decided = true;
      await this.pause();
      return;
    }
    const context = this.context(objective);
    if (context.objectiveId !== goalId || signal.aborted) return;
    let verdict: GoalVerdict | null;
    try {
      // `classifier` leaves OMP's own `judge` role chain alone: the native
      // resolver itself falls back to the session model, so an unconfigured
      // role is not a reason to skip the check. `small-model` asks the native
      // role resolver for `smol` and pins that selector to `judge`.
      const settings = this.checker === 'small-model'
        ? this.smallModelSettings()
        : this.judgeDeps.settings;
      if (!settings) return;
      const judge = resolveJudge({ ...this.judgeDeps, settings, purpose: 'goal-verification' });
      const result = await judge.judge({ state: context, questions: GOAL_QUESTIONS }, { signal });
      verdict = decideGoalVerdict({
        all_done: result.answers.all_done.noul,
        remaining: result.answers.remaining.noul,
        needs_user: result.answers.needs_user.noul,
      });
    } catch {
      // A failed judge is not a verdict: never claim completion or blockage for it.
      verdict = null;
    }
    // An abort is not a verdict: leave the goal alone and let OMP decide.
    if (signal.aborted) return;
    const live = this.goalSession.getGoalModeState();
    if (!live?.enabled || live.goal.status !== 'active' || live.goal.id !== goalId) return;
    this.decided = true;
    if (verdict === 'complete') await this.complete();
    else if (verdict === 'paused') await this.pause();
  }

  /**
   * Settings whose `judge` role resolves through the cheap utility chain
   * (`smol`, then `tiny`, then the session default), which is what a small
   * checker is expected to run on. Null when no role resolves at all.
   */
  private smallModelSettings(): JudgeDeps['settings'] | null {
    const roles = this.judgeDeps.settings.getModelRoles();
    for (const role of ['smol', 'tiny', 'default'] as const) {
      const selector = resolvedModelSelector(this.goalSession.resolveRoleModelWithThinking(role));
      if (!selector) continue;
      return this.judgeDeps.settings.overlay({ modelRoles: { ...roles, judge: selector } });
    }
    return null;
  }

  private async complete(): Promise<void> {
    try { await this.goalSession.goalRuntime.completeGoalFromTool(); }
    catch { /* dropped or already complete */ }
  }

  private async pause(): Promise<void> {
    if (this.goalSession.getGoalModeState()?.goal.status !== 'active') return;
    try { await super.handle({ op: 'pause' } satisfies RpcGoalCommand); }
    catch { /* a concurrent drop or completion owns the state now */ }
  }
}

/** Project durable mode on the selected branch, including the terminal goal record. */
export function readSessionMode(manager: SessionManager): SessionMode {
  const context = manager.buildSessionContext();
  if (context.mode === 'goal' || context.mode === 'goal_paused') {
    const data = goalFromModeData(context.modeData);
    const parsed = SessionModeSchema.safeParse({ kind: 'goal', status: context.mode === 'goal_paused' ? 'paused' : data?.status,
      objective: data?.objective, tokenBudget: data?.tokenBudget ?? null, tokensUsed: data?.tokensUsed });
    if (parsed.success) return parsed.data;
  }
  if (context.mode === 'plan' || context.mode === 'plan_paused') {
    const data = PlanModeDataSchema.safeParse(context.modeData);
    return { kind: 'plan', status: context.mode === 'plan' ? 'active' : 'paused', planReference: planReference(data.success ? data.data.planFilePath : undefined) };
  }
  if (context.mode === 'vibe') return { kind: 'vibe' };
  const branch = manager.getBranch();
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry.type === 'mode_change') break;
    if (entry.type !== 'custom' || entry.customType !== 'goal-completed') continue;
    const data = z.object({ objective: z.string().min(1), tokenBudget: z.number().int().positive().optional(), tokensUsed: z.number().int().nonnegative() }).safeParse(entry.data);
    if (data.success) return { kind: 'goal', status: 'complete', objective: data.data.objective, tokenBudget: data.data.tokenBudget ?? null, tokensUsed: data.data.tokensUsed };
  }
  return { kind: 'main' };
}

/**
 * Host-captured, non-secret goal preferences. The Host writes them into the
 * worker's bootstrap environment from its own settings; the worker only reads
 * them, so the Bun side never touches the Host preference file.
 */
const GOAL_CHECKER_ENV = 'OPENCHAMBER_SESSION_GOAL_CHECKER';
const GOAL_MAX_TURNS_ENV = 'OPENCHAMBER_SESSION_GOAL_MAX_AUTO_TURNS';
const PLAN_ALLOW_AGENTS_ENV = 'OPENCHAMBER_PLAN_ALLOW_AGENTS';
export const DEFAULT_GOAL_MAX_AUTO_TURNS = 20;
export const GOAL_MAX_AUTO_TURNS_LIMIT = 200;
export type GoalChecker = 'classifier' | 'small-model';

export function readGoalChecker(env: NodeJS.ProcessEnv = process.env): GoalChecker {
  return env[GOAL_CHECKER_ENV] === 'small-model' ? 'small-model' : 'classifier';
}

export function readGoalMaxAutoTurns(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env[GOAL_MAX_TURNS_ENV]);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > GOAL_MAX_AUTO_TURNS_LIMIT) return DEFAULT_GOAL_MAX_AUTO_TURNS;
  return parsed;
}

/** The `provider/model[:effort]` selector of a native role resolution, or null when none. */
export function resolvedModelSelector(resolved: { model?: { provider: string; id: string } | undefined; thinkingLevel?: string | undefined }): string | null {
  if (!resolved.model) return null;
  const base = `${resolved.model.provider}/${resolved.model.id}`;
  return resolved.thinkingLevel ? `${base}:${resolved.thinkingLevel}` : base;
}

export function readPlanAllowAgents(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[PLAN_ALLOW_AGENTS_ENV] === 'true';
}

/** The three noul questions the goal check asks about one goal turn. */
const GOAL_QUESTIONS = {
  all_done: {
    type: 'noul' as const,
    instructions: 'The objective is fully achieved by the work done so far.',
    criteria: { true: 'Every part of the objective is finished and verified.', false: 'Anything in the objective is still missing.' },
  },
  remaining: {
    type: 'noul' as const,
    instructions: 'There is concrete work left that the agent can do without the user.',
    criteria: { true: 'A specific next step is available.', false: 'No further step can be taken.' },
  },
  needs_user: {
    type: 'noul' as const,
    instructions: 'The agent is blocked on a decision, secret, or access only the user can supply.',
    criteria: { true: 'Progress requires the user.', false: 'The agent can proceed alone.' },
  },
};
type GoalVerdict = 'complete' | 'paused' | 'continue';

/** Historical Jev audit thresholds: accept at 0.5 probability. */
export function decideGoalVerdict(answers: { all_done: number; remaining: number; needs_user: number }): GoalVerdict {
  if (answers.needs_user >= 0.5) return 'paused';
  if (answers.all_done >= 0.5 && answers.remaining < 0.5) return 'complete';
  return 'continue';
}

/** OMP owns durable mode; the worker restores the interactive recipe without its TUI. */
export class WorkerModeController {
  readonly goal: RpcGoalController;
  private previous: Previous | undefined;
  private vibePrevious: VibePrevious | undefined;
  private current: SessionMode;
  private armedPlan: { planReference: string } | null = null;
  private pendingTransition: Promise<void> | null = null;
  private transitionError: Error | null = null;
  /** Automatic goal turns taken for the current goal id. */
  private goalTurns = 0;
  private goalTurnsFor: string | null = null;
  /** A goal check is running; the session is not settled until it lands. */
  private goalCheck: Promise<void> | null = null;
  private readonly goalChecker: GoalChecker;
  private readonly goalMaxAutoTurns: number;
  private readonly planAllowAgents: boolean;
  constructor(
    private readonly session: AgentSession,
    private readonly propose: PlanProposalHandler = title => session.preparePlanForReview(title),
    startGoalRun?: (start: () => Promise<boolean>) => Promise<boolean>,
    onContinuationDropped?: () => void,
    private readonly onModeChanged?: (mode: SessionMode) => void,
  ) {
    const continuationModes = cfgGoalContinuationModes.get(session.settings);
    if (!continuationModes.includes('rpc')) cfgGoalContinuationModes.override(session.settings, [...continuationModes, 'rpc']);
    const nativePrompt = session.promptCustomMessage.bind(session);
    const goalSession: RpcGoalSession = {
      settings: session.settings,
      sessionManager: session.sessionManager,
      get goalRuntime() { return session.goalRuntime; },
      getGoalModeState: () => session.getGoalModeState(),
      setGoalModeState: state => session.setGoalModeState(state),
      getPlanModeState: () => session.getPlanModeState(),
      getEnabledToolNames: () => session.getEnabledToolNames(),
      setActiveToolsByName: names => session.setActiveToolsByName(names),
      sendGoalModeContext: options => session.sendGoalModeContext(options),
      getTodoPhases: () => session.getTodoPhases(),
      promptCustomMessage: input => startGoalRun ? startGoalRun(() => nativePrompt(input)) : nativePrompt(input),
      waitForIdle: () => session.waitForIdle(),
      get isStreaming() { return session.isStreaming; },
      get isDisposed() { return session.isDisposed; },
      get isSessionTransitioning() { return session.isSessionTransitioning; },
      get hasAdmittedSubmission() { return session.hasAdmittedSubmission; },
      get queuedMessageCount() { return session.queuedMessageCount; },
    };
    this.goalChecker = readGoalChecker();
    this.goalMaxAutoTurns = readGoalMaxAutoTurns();
    this.planAllowAgents = readPlanAllowAgents();
    this.goal = new GoalVerifyingController(goalSession, onContinuationDropped, {
      settings: session.settings,
      registry: session.modelRegistry,
      sessionModel: session.model,
      sessionId: session.sessionManager.getSessionId() ?? undefined,
      costGate: session.costGate,
      onUsage: journalJudgmentUsage(session.sessionManager),
    }, session, this.goalChecker, this.goalMaxAutoTurns, objective => this.goalContext(objective));
    const context = session.sessionManager.buildSessionContext();
    const parsed = PlanModeDataSchema.safeParse(context.modeData);
    if (!parsed.success && context.modeData !== undefined && (context.mode === 'plan' || context.mode === 'plan_paused')) {
      throw new ProjectionError(503, 'SESSION_RESTORE_FAILED', 'Stored plan mode is invalid');
    }
    const data = parsed.success ? parsed.data : undefined;
    this.current = context.mode === 'plan' || context.mode === 'plan_paused'
      ? { kind: 'plan', status: context.mode === 'plan' ? 'active' : 'paused', planReference: planReference(data?.planFilePath) }
      : context.mode === 'vibe' ? { kind: 'vibe' } : { kind: 'main' };
    if (this.current.kind === 'plan' && data?.previousTools) {
      this.previous = { tools: data.previousTools, mounted: data.previousMounted ?? [], registered: data.previousRegistered ?? data.previousTools, model: data.previousModel };
    }
    if (this.current.kind === 'vibe') {
      const previousTools = z.array(z.string()).safeParse(context.modeData?.previousTools);
      if (!previousTools.success) throw new ProjectionError(503, 'SESSION_RESTORE_FAILED', 'Stored vibe mode tools are invalid');
      this.vibePrevious = { tools: previousTools.data, ownerScope: VibeSessionRegistry.global().ownerScope(this.vibeParent()) };
    }
  }

  mode(): SessionMode {
    if (this.armedPlan) return { kind: 'plan', status: 'armed', planReference: this.armedPlan.planReference };
    const goal = this.session.getGoalModeState()?.goal;
    if (goal && goal.status !== 'dropped') return { kind: 'goal', status: goal.status, objective: goal.objective, tokenBudget: goal.tokenBudget ?? null, tokensUsed: goal.tokensUsed };
    return readSessionMode(this.session.sessionManager);
  }

  async goalState(): Promise<RpcGoalResult> { return this.goal.handle({ op: 'get' }); }
  /** The bounded context given to the judge: objective, recent work and todo plan. */
  private goalContext(objective: string): Record<string, string | number> & { objectiveId: string } {
    const live = this.session.getGoalModeState();
    const recent = this.session.messages.slice(-8).flatMap(message => {
      if (!('content' in message) || typeof message.content === 'string') return [];
      const text = message.content.flatMap(part => {
        if (part.type === 'text') return [part.text];
        if (part.type === 'toolCall') return [`tool ${part.name}: ${JSON.stringify(part.arguments ?? {}).slice(0, 200)}`];
        return [];
      });
      return text.length ? [`${message.role}: ${text.join(' ').slice(0, 400)}`] : [];
    });
    const todos = this.session.getTodoPhases()
      .map(phase => `${phase.name}: ${phase.tasks.map(task => `${task.status} ${task.content}`).join(', ')}`)
      .join(' | ');
    return {
      objectiveId: live?.goal.id ?? '',
      objective,
      recent_work: recent.join('\n').slice(0, 4_000) || '(no transcript)',
      todos: todos.slice(0, 2_000) || '(no todo plan)',
      tokens_used: live?.goal.tokensUsed ?? 0,
    };
  }
  isTransitioning(): boolean { return this.pendingTransition !== null; }
  /** A goal turn, or the check that decides the next one, is still outstanding. */
  get continuationPending(): boolean { return this.goal.continuationPending || this.goalCheck !== null; }
  get goalGuard(): { checker: GoalChecker; maxAutoTurns: number } {
    return { checker: this.goalChecker, maxAutoTurns: this.goalMaxAutoTurns };
  }
  observe(event: Parameters<RpcGoalController['observe']>[0]): void {
    // The controller itself awaits the verdict before handing the same terminal
    // event to OMP, so the native continuation and journal stay authoritative.
    this.goal.observe(event);
    if (this.armedPlan && event.type === 'agent_end') {
      const currentArmed = this.armedPlan;
      this.pendingTransition = this.enterPlan()
        .then(() => {
          if (this.armedPlan !== currentArmed) return;
          this.armedPlan = null;
          this.transitionError = null;
          this.onModeChanged?.(this.mode());
        })
        .catch(error => {
          if (this.armedPlan !== currentArmed) return;
          this.armedPlan = null;
          this.transitionError = error instanceof Error ? error : new Error(String(error));
          this.onModeChanged?.(this.mode());
        })
        .finally(() => {
          this.pendingTransition = null;
        });
    }
  }
  async settleTransition(): Promise<void> {
    if (this.pendingTransition) await this.pendingTransition;
    if (this.transitionError) {
      const err = this.transitionError;
      this.transitionError = null;
      throw err;
    }
  }
  stopForHostAbort(): void {
    const wasArmed = this.armedPlan !== null;
    this.armedPlan = null;
    this.transitionError = null;
    this.goal.stopForHostAbort();
    if (wasArmed) {
      this.onModeChanged?.(this.mode());
    }
  }

  async set(kind: 'main' | 'plan' | 'vibe'): Promise<SessionMode> {
    if (this.session.isRunActive) {
      if (kind === 'plan') {
        this.armedPlan = { planReference: 'local://PLAN.md' };
        return this.mode();
      }
      if (kind === 'main' && this.armedPlan) {
        this.armedPlan = null;
        return this.mode();
      }
      throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
    }
    this.armedPlan = null;
    if (this.mode().kind === 'goal') {
      await this.goal.handle({ op: 'drop' });
      this.session.sessionManager.appendModeChange('none');
    }
    if (kind === 'plan') {
      if (this.current.kind === 'vibe') await this.exitVibe();
      await this.enterPlan();
    } else if (kind === 'vibe') {
      if (this.current.kind === 'plan') await this.exitPlan();
      await this.enterVibe();
    } else if (this.current.kind === 'plan') await this.exitPlan();
    else await this.exitVibe();
    return this.mode();
  }

  private vibeParent(): VibeParentSession {
    return {
      getAgentId: () => this.session.getAgentId() ?? this.session.sessionManager.getSessionId() ?? 'native-session',
      getSessionId: () => this.session.sessionManager.getSessionId() ?? this.session.getAgentId(),
      getSessionFile: () => this.session.sessionManager.getSessionFile() ?? null,
      sessionManager: this.session.sessionManager,
      settings: this.session.settings,
      asyncJobManager: this.session.asyncJobManager,
    };
  }

  private async enterVibe(): Promise<void> {
    if (this.current.kind === 'vibe') return;
    const previous = this.session.getEnabledToolNames();
    const registry = VibeSessionRegistry.global();
    const parent = this.vibeParent();
    const ownerScope = registry.ownerScope(parent);
    registry.activateScope(ownerScope);
    const baseTools = ['read', ...(this.session.hasBuiltInTool('todo') ? ['todo'] : [])];
    try {
      await this.session.activateVibeTools(baseTools);
      this.session.setVibeModeState({ enabled: true });
      this.session.sessionManager.appendModeChange('vibe', { previousTools: previous });
    } catch (error) {
      await this.session.deactivateVibeTools(previous);
      this.session.setVibeModeState(undefined);
      throw error;
    }
    this.vibePrevious = { tools: previous, ownerScope };
    this.current = { kind: 'vibe' };
  }

  private async exitVibe(): Promise<void> {
    if (this.current.kind !== 'vibe') return;
    const previous = this.vibePrevious;
    const registry = VibeSessionRegistry.global();
    await this.session.runModeExitTeardown(async () => {
      if (this.session.isRunActive) await this.session.abort();
      await registry.killAll(this.vibeParent(), previous?.ownerScope);
      await this.session.deactivateVibeTools(previous?.tools ?? []);
      this.session.setVibeModeState(undefined);
    });
    this.session.sessionManager.appendModeChange('none');
    this.vibePrevious = undefined;
    this.current = { kind: 'main' };
  }

  private async enterPlan(): Promise<void> {
    if (this.current.kind === 'plan' && this.current.status === 'active') return;
    const reference = this.current.kind === 'plan' ? this.current.planReference : planReference(this.session.getPlanReferencePath());
    const previous: Previous = {
      tools: this.session.getEnabledToolNames().filter(name => !isMCPToolName(name)),
      mounted: this.session.getMountedToolCommandNames().filter(name => !isMCPToolName(name)),
      registered: this.session.getAllToolNames().filter(name => !isMCPToolName(name)),
      model: this.session.model ? { provider: this.session.model.provider, id: this.session.model.id, thinkingLevel: this.session.configuredThinkingLevel() } : undefined,
    };
    const planModel = this.session.resolveRoleModelWithThinking('plan');
    if (!planModel.model) throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'The plan model role is unavailable');
    const targetModel = planModel.model;
    const originalTools = this.session.getEnabledToolNames();
    const originalState = this.session.getPlanModeState();
    // Native Code Mode partitions tools using plan state, so state must land first.
    this.session.setPlanModeState({ enabled: true, planFilePath: reference, workflow: 'parallel', reentry: this.current.kind === 'plan' });
    try {
      // Plan mode keeps its own tool set; the preference only decides whether the
      // subagent task tool stays available while planning.
      const planTools = [...originalTools, ...(this.session.hasBuiltInTool('write') ? ['write'] : [])];
      if (this.planAllowAgents && this.session.hasBuiltInTool('task') && !planTools.includes('task')) planTools.push('task');
      await this.session.setActiveToolsByName([...new Set(planTools)]);
      this.session.setPlanProposalHandler(this.propose);
      await this.session.setModelTemporary(targetModel, planModel.thinkingLevel);
      const modeData: PlanModeData = {
        planFilePath: reference, previousTools: previous.tools, previousMounted: previous.mounted, previousRegistered: previous.registered,
      };
      if (previous.model) modeData.previousModel = previous.model;
      this.session.sessionManager.appendModeChange('plan', modeData);
    } catch (error) {
      this.session.setPlanModeState(originalState);
      this.session.setPlanProposalHandler(null);
      await this.session.restoreNonMCPToolPresentation(previous.tools, previous.mounted, previous.registered);
      if (previous.model) {
        const model = this.session.modelRegistry.find(previous.model.provider, previous.model.id);
        if (model) await this.session.setModelTemporary(model, previous.model.thinkingLevel);
      }
      throw error;
    }
    this.previous = previous;
    this.current = { kind: 'plan', status: 'active', planReference: reference };
  }

  private async exitPlan(restoreTools = true): Promise<void> {
    if (this.current.kind === 'main') return;
    const previous = this.previous;
    const restoredModel = previous?.model && this.session.modelRegistry.find(previous.model.provider, previous.model.id);
    if (previous?.model && !restoredModel) throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'The previous session model is unavailable');
    const planState = this.session.getPlanModeState();
    const planTools = this.session.getEnabledToolNames();
    const planMounted = this.session.getMountedToolCommandNames();
    const planModel = this.session.model;
    const planThinking = this.session.configuredThinkingLevel();
    this.session.setPlanModeState(undefined);
    try {
      if (restoreTools && previous) await this.session.restoreNonMCPToolPresentation(previous.tools, previous.mounted, previous.registered);
      if (restoredModel) await this.session.setModelTemporary(restoredModel, previous?.model?.thinkingLevel);
      this.session.sessionManager.appendModeChange('none');
    } catch (error) {
      this.session.setPlanModeState(planState);
      await this.session.setActiveToolPresentation(planTools, planMounted);
      if (planModel) await this.session.setModelTemporary(planModel, planThinking);
      throw error;
    }
    this.session.setPlanProposalHandler(null);
    this.previous = undefined;
    this.current = { kind: 'main' };
  }

  async approve(compact?: () => Promise<void>): Promise<SessionMode> {
    if (this.session.isRunActive) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
    if (this.current.kind !== 'plan') throw new ProjectionError(409, 'INVALID_REQUEST', 'Plan mode is not active');
    const previous = this.previous ?? {
      tools: this.session.getEnabledToolNames().filter(name => !isMCPToolName(name)),
      mounted: this.session.getMountedToolCommandNames().filter(name => !isMCPToolName(name)),
      registered: this.session.getAllToolNames().filter(name => !isMCPToolName(name)),
    };
    await this.exitPlan(false);
    try { await compact?.(); }
    finally {
      const tools = previous.tools.includes('read') ? previous.tools : [...previous.tools, 'read'];
      await this.session.restoreNonMCPToolPresentation(tools, previous.mounted, previous.registered);
    }
    return this.mode();
  }

  async restore(): Promise<void> {
    if (this.current.kind === 'vibe') {
      const vibePrevious = this.vibePrevious;
      const tools = vibePrevious?.tools;
      if (!vibePrevious || !tools) throw new ProjectionError(503, 'SESSION_RESTORE_FAILED', 'Stored vibe mode tools are unavailable');
      const parent = this.vibeParent();
      VibeSessionRegistry.global().activateScope(vibePrevious.ownerScope);
      await this.session.activateVibeTools(['read', ...(this.session.hasBuiltInTool('todo') ? ['todo'] : [])]);
      this.session.setVibeModeState({ enabled: true });
      await VibeSessionRegistry.global().rehydrate(parent);
      return;
    }
    if (this.current.kind !== 'plan' || this.current.status === 'paused') return;
    const tools = this.session.getEnabledToolNames();
    this.session.setPlanModeState({ enabled: true, planFilePath: this.current.planReference, workflow: 'parallel', reentry: true });
    const restoreTools = [...tools, ...(this.session.hasBuiltInTool('write') ? ['write'] : [])];
    if (this.planAllowAgents && this.session.hasBuiltInTool('task') && !restoreTools.includes('task')) restoreTools.push('task');
    await this.session.setActiveToolsByName([...new Set(restoreTools)]);
    this.session.setPlanProposalHandler(this.propose);
    // AgentSession already restored the journal's model, not today's role configuration.
  }
}
