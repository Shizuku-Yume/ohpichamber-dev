import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getExtensionUISelectOptionLabel } from '@oh-my-pi/pi-coding-agent/extensibility/extensions';
import type { ClientBridgePermissionOption, ClientBridgePermissionToolCall } from '@oh-my-pi/pi-coding-agent/session/client-bridge';
import type {
  ExtensionApprovalAnswer,
  ExtensionApprovalPrompt,
  ExtensionAskDialogOption,
  ExtensionAskDialogQuestion,
  ExtensionAskDialogResult,
  ExtensionAskDialogResultItem,
  ExtensionFormDialogResult,
  ExtensionUIDialogOptions,
  ExtensionUIContext,
  ExtensionUISelectItem,
  ToolApprovalRequestedEvent,
  ToolCallEvent,
} from '@oh-my-pi/pi-coding-agent/sdk';
import { ensureThemeSync, theme, type Theme } from '@oh-my-pi/pi-tui/theme';
import { JsonObjectSchema, PlanReviewSchema, PlanReviewResponseSchema, type PlanReview, type PlanReviewResponse } from '@openchamber/agent-contract';
import type { JsonObject, JsonValue } from '@openchamber/agent-contract';
import type { WorkerInteraction as WorkerInteractionMessage } from '../protocol.ts';
import { approvalInputSummary, oneLineApprovalText } from '../interaction/approval-summary.ts';
import { NativeFormDialog } from './form-dialog.ts';
import { ProjectionError } from '../projection/journal.ts';

type PendingApproval = { toolCallId: string; resolve: (choice: string | undefined) => void; approve: string; reject: string };
export type NativePermissionChoice = 'once' | 'always' | 'reject';
type PendingPermission = { toolCallId: string; resolve: (choice: NativePermissionChoice | undefined) => void };
type PendingQuestion = { questions: ExtensionAskDialogQuestion[]; resolve: (result: ExtensionAskDialogResult | undefined) => void };

export interface WorkerInteractionCallbacks {
  request: (interaction: WorkerInteractionMessage) => void;
  currentTurn: () => string | undefined;
  /** Resolves an in-flight tool call to the subagent run that owns it. */
  subagentForToolCall?: (toolCallId: string) => { subagentId: string; childSessionId?: string } | undefined;
}

function actionType(toolName: string): 'bash_command' | 'file_write' | 'network_request' | 'custom_tool' {
  if (toolName === 'bash' || toolName === 'shell') return 'bash_command';
  if (toolName === 'edit' || toolName === 'write') return 'file_write';
  if (toolName === 'fetch' || toolName === 'http') return 'network_request';
  return 'custom_tool';
}
const NativeAnswerSchema = z.strictObject({
  results: z.array(z.strictObject({ id: z.string(), selectedOptions: z.array(z.string()), customInput: z.string().optional(), note: z.string().optional() })),
});

/** Bridges native Promise-based UI calls to JSON IPC while retaining native handles in the worker. */
export class WorkerInteraction {
  private readonly observed = new Map<string, ToolApprovalRequestedEvent>();
  private readonly inputs = new Map<string, JsonObject>();
  private readonly approvalHandles = new Map<string, PendingApproval>();
  private readonly permissionHandles = new Map<string, PendingPermission>();
  private readonly executionReceipts = new Map<string, string>();
  private readonly questionHandles = new Map<string, PendingQuestion>();
  private readonly formHandles = new Map<string, { form: NativeFormDialog; resolve: (result: ExtensionFormDialogResult | undefined) => void; options?: ExtensionUIDialogOptions }>();
  private readonly planHandles = new Map<string, (response: PlanReviewResponse | undefined) => void>();
  private closed = false;

  constructor(private readonly callbacks: WorkerInteractionCallbacks) {
    ensureThemeSync();
  }

  observeToolCall(event: ToolCallEvent): void {
    if (!this.closed) this.inputs.set(event.toolCallId, JsonObjectSchema.parse(JSON.parse(JSON.stringify(event.input))));
  }

  observeApproval(event: ToolApprovalRequestedEvent): void {
    if (!this.closed) this.observed.set(event.toolCallId, event);
  }
  forgetToolCall(toolCallId: string, forgetReceipt = true): void {
    this.inputs.delete(toolCallId);
    this.observed.delete(toolCallId);
    if (forgetReceipt) this.executionReceipts.delete(toolCallId);
  }
  takeApprovalReceipt(toolCallId: string): string | undefined {
    const receipt = this.executionReceipts.get(toolCallId);
    this.executionReceipts.delete(toolCallId);
    return receipt;
  }
  async approveTool(toolCallId: string, toolName: string, input: JsonObject, reason: string, signal?: AbortSignal): Promise<boolean> {
    const captured = this.inputs.get(toolCallId) ?? input;
    const turnId = this.callbacks.currentTurn() ?? 'turn-0';
    if (this.closed || signal?.aborted) return false;
    const choice = await this.requestApproval(
      turnId,
      toolCallId,
      toolName,
      captured,
      reason || `Host policy requires approval for ${toolName}`,
      ['Approve', 'Reject'],
      signal,
    );
    return choice === 'Approve';
  }

  async approveBash(toolCallId: string, input: JsonObject, signal?: AbortSignal): Promise<boolean> {
    return this.approveTool(toolCallId, 'bash', input, 'Host policy requires approval for this exact command', signal);
  }

  async approveSecretCommand(toolCallId: string, command: JsonObject, signal?: AbortSignal): Promise<boolean> {
    if (this.closed || signal?.aborted) return false;
    const choice = await this.requestApproval(
      this.callbacks.currentTurn() ?? 'turn-0', toolCallId, 'bash', command,
      'Approve this exact command before supplying secrets', ['Approve', 'Reject'], signal,
    );
    return choice === 'Approve';
  }

  readonly ui: ExtensionUIContext = {
    approve: (prompt, dialogOptions) => this.handleApprove(prompt, dialogOptions),
    select: (title, options, dialogOptions) => this.select(title, options, dialogOptions),
    confirm: async (title, message, options) => {
      const result = await this.askDialog([{ id: 'confirm', question: `${title}\n${message}`, options: [{ label: 'Yes' }, { label: 'No' }] }], options);
      return result?.kind === 'submit' && result.results[0]?.selectedOptions.includes('Yes') === true;
    },
    input: async (title, _placeholder, options) => {
      const result = await this.askDialog([{ id: 'input', question: title, options: [] }], options);
      return result?.kind === 'submit' ? result.results[0]?.customInput : undefined;
    },
    askDialog: (questions, dialogOptions) => this.askDialog(questions, dialogOptions),
    formDialog: (html, dialogOptions) => this.formDialog(html, dialogOptions),
    notify: () => { },
    onTerminalInput: () => () => { },
    setStatus: () => { },
    setWorkingMessage: () => { },
    setWidget: () => { },
    setFooter: () => { },
    setHeader: () => { },
    setTitle: () => { },
    custom: async () => { throw new Error('Custom interactive UI is unavailable in the Agent Service worker'); },
    setEditorText: () => { },
    pasteToEditor: () => { },
    getEditorText: () => '',
    editor: async () => { throw new Error('Terminal editor UI is unavailable in the Agent Service worker'); },
    addAutocompleteProvider: () => { },
    setEditorComponent: () => { },
    getEditorComponent: () => undefined,
    refreshTranscript: () => { },
    rerenderMessage: () => { },
    getLinkClicksAvailable: () => false,
    get theme(): Theme { ensureThemeSync(); return theme; },
    getAllThemes: async () => [],
    getTheme: async () => undefined,
    setTheme: async () => ({ success: false, error: 'Theme UI is unavailable in the Agent Service worker' }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => { },
  };

  private async handleApprove(prompt: ExtensionApprovalPrompt, dialogOptions?: { signal?: AbortSignal }): Promise<ExtensionApprovalAnswer> {
    if (this.closed) return 'deny';
    const turnId = this.callbacks.currentTurn() ?? 'turn-0';
    const callId = (dialogOptions as { toolCallId?: string } | undefined)?.toolCallId
      ?? (prompt as { toolCallId?: string } | undefined)?.toolCallId;
    let observer: ToolApprovalRequestedEvent | undefined;
    if (callId && this.observed.has(callId)) {
      observer = this.observed.get(callId);
    } else {
      for (const candidate of this.observed.values()) {
        const input = this.inputs.get(candidate.toolCallId);
        const nameMatches = prompt.full.toLowerCase().includes(candidate.toolName.toLowerCase())
          || prompt.compact.toLowerCase().includes(candidate.toolName.toLowerCase());
        const inputValues = input ? Object.values(input).map(String) : [];
        const inputMatches = inputValues.some(val => val.length > 2 && (prompt.full.includes(val) || prompt.compact.includes(val)));
        if (nameMatches && inputMatches) {
          observer = candidate;
          break;
        }
      }
      if (!observer) {
        for (const candidate of this.observed.values()) {
          if (prompt.full.toLowerCase().includes(candidate.toolName.toLowerCase())
            || prompt.compact.toLowerCase().includes(candidate.toolName.toLowerCase())) {
            observer = candidate;
            break;
          }
        }
      }
      observer ??= [...this.observed.values()][0];
    }
    if (!observer) return 'deny';
    this.observed.delete(observer.toolCallId);
    const input = this.inputs.get(observer.toolCallId);
    if (!input) throw new Error('Native approval has no captured execution input');
    this.inputs.delete(observer.toolCallId);
    const reason = observer.reason ?? prompt.compact ?? prompt.full;
    const choices: [string, string] = ['Approve', 'Reject'];
    const choice = await this.requestApproval(turnId, observer.toolCallId, observer.toolName, input, reason, choices, dialogOptions?.signal);
    if (choice === 'Approve') return 'once';
    return 'deny';
  }

  private async select(title: string, options: ExtensionUISelectItem[], dialogOptions?: ExtensionUIDialogOptions): Promise<string | undefined> {
    if (options.length === 0 || dialogOptions?.signal?.aborted) return undefined;
    if (this.closed) return undefined;
    const turnId = this.callbacks.currentTurn() ?? 'turn-0';
    const callId = (dialogOptions as { toolCallId?: string } | undefined)?.toolCallId;
    let observer: ToolApprovalRequestedEvent | undefined;
    if (callId && this.observed.has(callId)) {
      observer = this.observed.get(callId);
    } else {
      for (const candidate of this.observed.values()) {
        if (title.toLowerCase().includes(candidate.toolName.toLowerCase())) {
          observer = candidate;
          break;
        }
      }
      observer ??= [...this.observed.values()][0];
    }
    if (!observer) {
      const result = await this.askDialog([{
        id: 'select',
        question: title,
        options: options.map(option => option instanceof Object ? option : { label: option }),
      }], dialogOptions, {
        allowCustom: false,
        ...(dialogOptions?.initialIndex !== undefined ? { initialSelected: [getExtensionUISelectOptionLabel(options[dialogOptions.initialIndex] ?? options[0]!)] } : {}),
        ...(dialogOptions?.selectionMarker !== undefined ? { selectionMarker: dialogOptions.selectionMarker } : {}),
        ...(dialogOptions?.checkedIndices !== undefined ? { checkedIndices: [...dialogOptions.checkedIndices] } : {}),
        ...(dialogOptions?.markableCount !== undefined ? { markableCount: dialogOptions.markableCount } : {}),
      });
      return result?.kind === 'submit' ? result.results[0]?.selectedOptions[0] : undefined;
    }
    this.observed.delete(observer.toolCallId);
    const input = this.inputs.get(observer.toolCallId);
    if (!input) throw new Error('Native approval has no captured execution input');
    this.inputs.delete(observer.toolCallId);
    const labels = options.map(getExtensionUISelectOptionLabel);
    const approve = labels.find(l => l.startsWith('Approve Once') || l === 'Approve') ?? labels[0];
    const reject = labels.find(l => l === 'Deny' || l === 'Reject') ?? labels[labels.length - 1];
    if (approve === undefined || reject === undefined) throw new Error('Native approval choices are invalid');
    const choices: [string, string] = [approve, reject];
    return this.requestApproval(turnId, observer.toolCallId, observer.toolName, input, observer.reason ?? '', choices, dialogOptions?.signal);
  }

  /**
   * The one path that asks the user to approve a *tool execution*: `approveBash`,
   * `ui.approve` and an observed `ui.select` all land here, whether the request
   * came from the ACP bridge (`requestPermission`) or the native approval
   * extension. Every one of them is automatable; `ui.select` without an observed
   * tool and `confirm`/`input`/`askDialog` stay questions, because they are
   * dialogs rather than an execution gate. Provider and Host authorization do
   * not pass through this method at all.
   */
  private async requestApproval(turnId: string, toolCallId: string, toolName: string, input: JsonObject, reason: string, choices: [string, string], signal?: AbortSignal): Promise<string | undefined> {
    const approvalId = randomUUID();
    const [approve, reject] = choices;
    const action = actionType(toolName);
    const summary = approvalInputSummary(action, input);
    const subagent = this.callbacks.subagentForToolCall?.(toolCallId);
    const interaction: WorkerInteractionMessage = {
      kind: 'approval', approvalId, toolCallId, toolName, actionType: action,
      commandSummary: summary, details: JsonObjectSchema.parse({ reason: oneLineApprovalText(reason), options: choices, input }),
      policyTarget: { toolName, pattern: JSON.stringify(input) }, turnId, permissionRequest: true,
      ...(subagent === undefined ? {} : { subagentId: subagent.subagentId, ...(subagent.childSessionId === undefined ? {} : { childSessionId: subagent.childSessionId }) }),
    };
    const { promise, resolve } = Promise.withResolvers<string | undefined>();
    this.approvalHandles.set(approvalId, { toolCallId, resolve, approve, reject });
    const abort = () => { this.approvalHandles.delete(approvalId); this.executionReceipts.delete(toolCallId); resolve(undefined); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      if (signal?.aborted) abort();
      else this.callbacks.request(interaction);
      return await promise;
    } finally { signal?.removeEventListener('abort', abort); }
  }

  private approvalInput(toolCall: ClientBridgePermissionToolCall): JsonObject {
    const parsed = JsonObjectSchema.safeParse(JSON.parse(JSON.stringify(toolCall.rawInput ?? {})));
    return parsed.success ? parsed.data : {};
  }

  /** The native ACP permission gate's four-option prompt, surfaced as a canonical approval. */
  async requestPermission(
    toolCall: ClientBridgePermissionToolCall,
    options: ClientBridgePermissionOption[],
    sessionRuleKey: string | undefined,
    signal?: AbortSignal,
    steeringSignal?: AbortSignal,
  ): Promise<NativePermissionChoice | undefined> {
    const turnId = this.callbacks.currentTurn() ?? 'turn-0';
    if (this.closed || signal?.aborted || steeringSignal?.aborted) return undefined;
    const approvalId = randomUUID();
    const input = this.approvalInput(toolCall);
    const action = actionType(toolCall.toolName);
    const names = options.map(option => option.name);
    const subagent = this.callbacks.subagentForToolCall?.(toolCall.toolCallId);
    this.callbacks.request({
      kind: 'approval', approvalId, toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, actionType: action,
      commandSummary: approvalInputSummary(action, input),
      details: JsonObjectSchema.parse({ options: names }),
      policyTarget: { toolName: toolCall.toolName, pattern: JSON.stringify(input) }, turnId, sessionRuleKey,
      permissionRequest: true,
      ...(subagent === undefined ? {} : { subagentId: subagent.subagentId, ...(subagent.childSessionId === undefined ? {} : { childSessionId: subagent.childSessionId }) }),
    });
    const { promise, resolve } = Promise.withResolvers<NativePermissionChoice | undefined>();
    this.permissionHandles.set(approvalId, { toolCallId: toolCall.toolCallId, resolve });
    const abort = () => {
      if (!this.permissionHandles.has(approvalId)) return;
      this.permissionHandles.delete(approvalId);
      resolve(undefined);
    };
    const steerAbort = () => {
      if (!this.permissionHandles.has(approvalId)) return;
      this.permissionHandles.delete(approvalId);
      this.callbacks.request({ kind: 'cancel', approvalId });
      resolve(undefined);
    };
    signal?.addEventListener('abort', abort, { once: true });
    steeringSignal?.addEventListener('abort', steerAbort, { once: true });
    try {
      if (steeringSignal?.aborted) steerAbort();
      else if (signal?.aborted) abort();
      return await promise;
    } finally {
      signal?.removeEventListener('abort', abort);
      steeringSignal?.removeEventListener('abort', steerAbort);
    }
  }

  /** Re-authorizes a native-approved bash call with an exact Host execution grant. */
  async requestNativeGrant(toolCallId: string, input: JsonObject, signal?: AbortSignal): Promise<boolean> {
    // Async jobs (a vibe worker's own `bash`) outlive the turn that spawned
    // them, exactly like `approveTool`'s fallback; the grant stays tied to
    // `toolCallId`, so a turn-less request still resolves only its own call.
    const turnId = this.callbacks.currentTurn() ?? 'turn-0';
    if (this.closed || signal?.aborted) return false;
    const approvalId = randomUUID();
    const action = actionType('bash');
    const { promise, resolve } = Promise.withResolvers<string | undefined>();
    // The manager can dispatch the exact grant before this method resumes; the
    // handle must exist first or the resolution is lost.
    this.approvalHandles.set(approvalId, { toolCallId, resolve, approve: 'Approve', reject: 'Deny' });
    this.callbacks.request({
      kind: 'approval', approvalId, toolCallId, toolName: 'bash', actionType: action,
      commandSummary: approvalInputSummary(action, input), details: {},
      policyTarget: { toolName: 'bash', pattern: JSON.stringify(input) }, turnId, nativeGrant: true,
    });
    const abort = () => { this.approvalHandles.delete(approvalId); resolve(undefined); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      if (signal?.aborted) abort();
      return await promise === 'Approve';
    } finally { signal?.removeEventListener('abort', abort); }
  }

  private async askDialog(questions: ExtensionAskDialogQuestion[], dialogOptions?: ExtensionUIDialogOptions, presentation?: JsonObject): Promise<ExtensionAskDialogResult | undefined> {
    if (this.closed) return undefined;
    const turnId = this.callbacks.currentTurn();
    if (!turnId || questions.length === 0) return undefined;
    const questionId = randomUUID();
    const safeQuestions = questions.map((question): ExtensionAskDialogQuestion => {
      const options = question.options.map((option): ExtensionAskDialogOption => {
        const safeOption: ExtensionAskDialogOption = { label: option.label };
        if (option.description !== undefined) safeOption.description = option.description;
        if (option.preview !== undefined) safeOption.preview = option.preview;
        return safeOption;
      });
      const safeQuestion: ExtensionAskDialogQuestion = {
        id: question.id,
        question: question.question,
        options,
      };
      if (question.header !== undefined) safeQuestion.header = question.header;
      if (question.multi !== undefined) safeQuestion.multi = question.multi;
      if (question.recommended !== undefined) safeQuestion.recommended = question.recommended;
      return safeQuestion;
    });
    const schema: JsonObject = JsonObjectSchema.parse({ type: 'omp.ask', questions: safeQuestions.map(question => ({ ...question, ...presentation })) });
    if (dialogOptions?.timeout !== undefined) schema.timeout = dialogOptions.timeout;
    const callId = dialogOptions && 'toolCallId' in dialogOptions && typeof dialogOptions.toolCallId === 'string'
      ? dialogOptions.toolCallId
      : undefined;
    const subagent = callId ? this.callbacks.subagentForToolCall?.(callId) : undefined;
    const { promise, resolve } = Promise.withResolvers<ExtensionAskDialogResult | undefined>();
    this.questionHandles.set(questionId, { questions, resolve });
    this.callbacks.request({
      kind: 'question', questionId, turnId, prompt: questions.map(question => question.question).join('\n'),
      schema, timeout: dialogOptions?.timeout,
      ...(subagent === undefined ? {} : { subagentId: subagent.subagentId, ...(subagent.childSessionId === undefined ? {} : { childSessionId: subagent.childSessionId }) }),
    });
    if (dialogOptions?.signal) {
      const abort = () => { this.questionHandles.delete(questionId); resolve(undefined); };
      if (dialogOptions.signal.aborted) abort();
      else dialogOptions.signal.addEventListener('abort', abort, { once: true });
    }
    return promise;
  }

  private async formDialog(html: string, options?: ExtensionUIDialogOptions): Promise<ExtensionFormDialogResult | undefined> {
    const turnId = this.callbacks.currentTurn();
    if (this.closed || !turnId || options?.signal?.aborted) return undefined;
    const form = new NativeFormDialog(html, options?.timeout);
    const questionId = randomUUID();
    const { promise, resolve } = Promise.withResolvers<ExtensionFormDialogResult | undefined>();
    this.formHandles.set(questionId, { form, resolve, options });
    const abort = () => {
      if (!this.formHandles.delete(questionId)) return;
      options?.onAbandon?.(form.abandoned());
      this.callbacks.request({ kind: 'cancel', questionId });
      resolve(undefined);
    };
    options?.signal?.addEventListener('abort', abort, { once: true });
    const callId = options && 'toolCallId' in options && typeof options.toolCallId === 'string'
      ? options.toolCallId
      : undefined;
    const subagent = callId ? this.callbacks.subagentForToolCall?.(callId) : undefined;
    try {
      this.callbacks.request({
        kind: 'question', questionId, turnId, prompt: '', schema: form.schema, timeout: options?.timeout,
        ...(subagent === undefined ? {} : { subagentId: subagent.subagentId, ...(subagent.childSessionId === undefined ? {} : { childSessionId: subagent.childSessionId }) }),
      });
      if (options?.signal?.aborted) abort();
      return await promise;
    } finally {
      this.formHandles.delete(questionId);
      options?.signal?.removeEventListener('abort', abort);
    }
  }

  resolveApproval(approvalId: string, decision: 'approve' | 'approve-always' | 'reject'): boolean {
    const permission = this.permissionHandles.get(approvalId);
    if (permission) {
      this.permissionHandles.delete(approvalId);
      if (decision === 'approve' || decision === 'approve-always') this.executionReceipts.set(permission.toolCallId, approvalId);
      permission.resolve(decision === 'approve-always' ? 'always' : decision === 'approve' ? 'once' : 'reject');
      return true;
    }
    const pending = this.approvalHandles.get(approvalId);
    if (!pending) return false;
    this.approvalHandles.delete(approvalId);
    if (decision === 'approve' || decision === 'approve-always') this.executionReceipts.set(pending.toolCallId, approvalId);
    pending.resolve(decision === 'reject' ? pending.reject : pending.approve);
    return true;
  }

  requestPlanReview(review: PlanReview, resolved: (response: PlanReviewResponse | undefined) => void): void {
    const turnId = this.callbacks.currentTurn();
    if (this.closed || !turnId) throw new Error('Plan review requires an active worker turn');
    if (this.planHandles.size > 0) throw new Error('A plan is already awaiting review');
    const schema = PlanReviewSchema.parse(review);
    const questionId = randomUUID();
    this.planHandles.set(questionId, resolved);
    try {
      this.callbacks.request({ kind: 'question', questionId, turnId, prompt: schema.title, schema });
    } catch (error) {
      this.planHandles.delete(questionId);
      throw error;
    }
  }

  resolveQuestion(questionId: string, action: 'answer' | 'cancel' | 'update' | 'timeout', response?: JsonValue): boolean {
    const pendingForm = this.formHandles.get(questionId);
    if (pendingForm) {
      if (action === 'answer' || action === 'update') {
        if (!pendingForm.form.update(response, action === 'answer')) throw new ProjectionError(400, 'INVALID_REQUEST', pendingForm.form.validationError ?? 'Form response violates its native controls');
        if (action === 'update') { pendingForm.options?.onTimeoutReset?.(); return true; }
      }
      this.formHandles.delete(questionId);
      if (action === 'timeout') pendingForm.options?.onTimeout?.();
      pendingForm.resolve(action === 'cancel' ? undefined : pendingForm.form.result(action === 'timeout'));
      return true;
    }
    if (action === 'update' || action === 'timeout') return false;
    const plan = this.planHandles.get(questionId);
    if (plan) {
      const parsed = action === 'answer' ? PlanReviewResponseSchema.safeParse(response) : undefined;
      if (parsed && !parsed.success) return false;
      this.planHandles.delete(questionId);
      plan(parsed?.success ? parsed.data : undefined);
      return true;
    }
    const pending = this.questionHandles.get(questionId);
    if (!pending) return false;
    if (action === 'cancel') {
      this.questionHandles.delete(questionId);
      pending.resolve(undefined);
      return true;
    }
    const parsed = NativeAnswerSchema.safeParse(response);
    if (!parsed.success || parsed.data.results.length !== pending.questions.length) return false;
    for (const [index, item] of parsed.data.results.entries()) {
      const question = pending.questions[index];
      if (!question || item.id !== question.id) return false;
      const labels = question.options.map(option => option.label);
      if (item.selectedOptions.some(label => !labels.includes(label))) return false;
      if (new Set(item.selectedOptions).size !== item.selectedOptions.length) return false;
      if (item.customInput !== undefined && item.customInput.trim().length === 0) return false;
      if (!question.multi && item.selectedOptions.length + (item.customInput === undefined ? 0 : 1) !== 1) return false;
    }
    const results = parsed.data.results.map((item, index): ExtensionAskDialogResultItem => {
      const question = pending.questions[index]!;
      const result: ExtensionAskDialogResultItem = {
        id: item.id,
        question: question.question,
        options: question.options.map(option => option.label),
        multi: question.multi ?? false,
        selectedOptions: item.selectedOptions,
      };
      if (item.customInput !== undefined) result.customInput = item.customInput;
      if (item.note !== undefined) result.note = item.note;
      return result;
    });
    this.questionHandles.delete(questionId);
    pending.resolve({ kind: 'submit', results });
    return true;
  }

  cancelAll(): void {
    for (const pending of this.formHandles.values()) pending.resolve(undefined);
    this.formHandles.clear();
    for (const pending of this.approvalHandles.values()) pending.resolve(undefined);
    for (const pending of this.permissionHandles.values()) pending.resolve(undefined);
    for (const pending of this.questionHandles.values()) pending.resolve(undefined);
    for (const resolve of this.planHandles.values()) resolve(undefined);
    this.planHandles.clear();
    this.approvalHandles.clear();
    this.permissionHandles.clear();
    this.questionHandles.clear();
    this.observed.clear();
    this.inputs.clear();
    this.executionReceipts.clear();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.cancelAll();
  }
}
