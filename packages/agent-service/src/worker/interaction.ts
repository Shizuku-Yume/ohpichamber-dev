import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  ExtensionAskDialogQuestion,
  ExtensionAskDialogResult,
  ExtensionUIContext,
  ExtensionUISelectItem,
  ToolApprovalRequestedEvent,
  ToolCallEvent,
} from '@oh-my-pi/pi-coding-agent/sdk';
import type { Theme } from '@oh-my-pi/pi-tui/theme';
import { JsonObjectSchema } from '@openchamber/agent-contract';
import type { JsonObject, JsonValue } from '@openchamber/agent-contract';
import type { WorkerInteraction as WorkerInteractionMessage } from '../protocol.ts';

type PendingApproval = { resolve: (choice: string | undefined) => void; approve: string; reject: string };
type PendingQuestion = { questions: ExtensionAskDialogQuestion[]; resolve: (result: ExtensionAskDialogResult | undefined) => void };

export interface WorkerInteractionCallbacks {
  request: (interaction: WorkerInteractionMessage) => void;
  currentTurn: () => string | undefined;
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
  private readonly questionHandles = new Map<string, PendingQuestion>();
  private closed = false;

  constructor(private readonly callbacks: WorkerInteractionCallbacks) {}

  observeToolCall(event: ToolCallEvent): void {
    if (!this.closed) this.inputs.set(event.toolCallId, JsonObjectSchema.parse(JSON.parse(JSON.stringify(event.input))));
  }

  observeApproval(event: ToolApprovalRequestedEvent): void {
    if (!this.closed) this.observed.set(event.toolCallId, event);
  }
  forgetToolCall(toolCallId: string): void {
    this.inputs.delete(toolCallId);
    this.observed.delete(toolCallId);
  }

  readonly ui: ExtensionUIContext = {
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
    notify: () => {},
    onTerminalInput: () => () => {},
    setStatus: () => {},
    setWorkingMessage: () => {},
    setWidget: () => {},
    setFooter: () => {},
    setHeader: () => {},
    setTitle: () => {},
    custom: async () => { throw new Error('Custom interactive UI is unavailable in the Agent Service worker'); },
    setEditorText: () => {},
    pasteToEditor: () => {},
    getEditorText: () => '',
    editor: async () => { throw new Error('Terminal editor UI is unavailable in the Agent Service worker'); },
    addAutocompleteProvider: () => {},
    setEditorComponent: () => {},
    get theme(): Theme { throw new Error('Terminal theme UI is unavailable in the Agent Service worker'); },
    getAllThemes: async () => [],
    getTheme: async () => undefined,
    setTheme: async () => ({ success: false, error: 'Theme UI is unavailable in the Agent Service worker' }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => {},
  };

  private async select(title: string, options: ExtensionUISelectItem[], dialogOptions?: { signal?: AbortSignal }): Promise<string | undefined> {
    if (this.closed) return undefined;
    const turnId = this.callbacks.currentTurn();
    if (!turnId) return undefined;
    const observer = [...this.observed.values()][0];
    if (!observer) {
      const result = await this.askDialog([{ id: 'select', question: title, options: options.map(option => typeof option === 'string' ? { label: option } : option) }], dialogOptions);
      return result?.kind === 'submit' ? result.results[0]?.selectedOptions[0] : undefined;
    }
    this.observed.delete(observer.toolCallId);
    const input = this.inputs.get(observer.toolCallId);
    if (!input) throw new Error('Native approval has no captured execution input');
    this.inputs.delete(observer.toolCallId);
    const labels = options.map(option => typeof option === 'string' ? option : option.label);
    const approve = labels[0];
    const reject = labels[1];
    if (labels.length !== 2 || approve === undefined || reject === undefined) throw new Error('Native approval choices are invalid');
    const approvalId = randomUUID();
    const details = JsonObjectSchema.parse({
      reason: observer.reason ?? '', options: labels, approvalMode: observer.approvalMode, input,
    });
    const interaction: WorkerInteractionMessage = {
      kind: 'approval', approvalId, toolCallId: observer.toolCallId, toolName: observer.toolName,
      actionType: actionType(observer.toolName), commandSummary: title, details,
      policyTarget: { toolName: observer.toolName, pattern: JSON.stringify(input) }, turnId,
    };
    return new Promise<string | undefined>(resolve => {
      const pending: PendingApproval = { resolve, approve, reject };
      this.approvalHandles.set(approvalId, pending);
      this.callbacks.request(interaction);
      if (dialogOptions?.signal) {
        const abort = () => { this.approvalHandles.delete(approvalId); resolve(undefined); };
        if (dialogOptions.signal.aborted) abort();
        else dialogOptions.signal.addEventListener('abort', abort, { once: true });
      }
    });
  }

  private async askDialog(questions: ExtensionAskDialogQuestion[], dialogOptions?: { signal?: AbortSignal }): Promise<ExtensionAskDialogResult | undefined> {
    if (this.closed) return undefined;
    const turnId = this.callbacks.currentTurn();
    if (!turnId || questions.length === 0) return undefined;
    const questionId = randomUUID();
    const safeQuestions = questions.map(question => ({
      id: question.id, question: question.question,
      ...(question.header === undefined ? {} : { header: question.header }),
      options: question.options.map(option => ({
        label: option.label,
        ...(option.description === undefined ? {} : { description: option.description }),
        ...(option.preview === undefined ? {} : { preview: option.preview }),
      })),
      ...(question.multi === undefined ? {} : { multi: question.multi }),
      ...(question.recommended === undefined ? {} : { recommended: question.recommended }),
    }));
    const schema = JsonObjectSchema.parse({ type: 'omp.ask', questions: safeQuestions });
    return new Promise<ExtensionAskDialogResult | undefined>(resolve => {
      this.questionHandles.set(questionId, { questions, resolve });
      this.callbacks.request({ kind: 'question', questionId, turnId, prompt: questions.map(question => question.question).join('\n'), schema });
      if (dialogOptions?.signal) {
        const abort = () => { this.questionHandles.delete(questionId); resolve(undefined); };
        if (dialogOptions.signal.aborted) abort();
        else dialogOptions.signal.addEventListener('abort', abort, { once: true });
      }
    });
  }

  resolveApproval(approvalId: string, decision: 'approve' | 'reject'): boolean {
    const pending = this.approvalHandles.get(approvalId);
    if (!pending) return false;
    this.approvalHandles.delete(approvalId);
    pending.resolve(decision === 'approve' ? pending.approve : pending.reject);
    return true;
  }

  resolveQuestion(questionId: string, action: 'answer' | 'cancel', response?: JsonValue): boolean {
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
      if (!question.multi && item.selectedOptions.length > 1) return false;
      if (item.customInput !== undefined && item.customInput.trim().length === 0) return false;
      if (item.selectedOptions.length === 0 && item.customInput === undefined) return false;
    }
    const results = parsed.data.results.map((item, index) => {
      const question = pending.questions[index]!;
      return {
        id: item.id, question: question.question,
        options: question.options.map(option => option.label), multi: question.multi ?? false,
        selectedOptions: item.selectedOptions,
        ...(item.customInput === undefined ? {} : { customInput: item.customInput }),
        ...(item.note === undefined ? {} : { note: item.note }),
      };
    });
    this.questionHandles.delete(questionId);
    pending.resolve({ kind: 'submit', results });
    return true;
  }

  cancelAll(): void {
    for (const pending of this.approvalHandles.values()) pending.resolve(undefined);
    for (const pending of this.questionHandles.values()) pending.resolve(undefined);
    this.approvalHandles.clear();
    this.questionHandles.clear();
    this.observed.clear();
    this.inputs.clear();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.cancelAll();
  }
}
