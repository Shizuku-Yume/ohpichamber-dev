import type { ExtensionFactory, ExtensionAPI } from '@oh-my-pi/pi-coding-agent/sdk';
import type { AgentSession } from '@oh-my-pi/pi-coding-agent/session/agent-session';
import { z } from 'zod';
import { JsonObjectSchema, type JsonObject, type JsonValue } from '@openchamber/agent-contract';
import { HostActionRequestSchema, type HostActionRequest } from '../native-policy-protocol.ts';
import { UI_BLOCKS_GUIDANCE } from './ui-blocks-guidance.ts';

export type HostToolName =
  | 'openchamber'
  | 'web'
  | 'openchamber_knowledge'
  | 'notify'
  | 'openchamber_render'
  | 'openchamber_secret'
  | 'openchamber_workflow';

export const HOST_TOOL_NAMES: readonly HostToolName[] = [
  'openchamber',
  'web',
  'openchamber_knowledge',
  'notify',
  'openchamber_render',
  'openchamber_secret',
  'openchamber_workflow',
] as const;

const DEFAULT_HOST_TOOL_ENABLEMENT: Readonly<Record<HostToolName, boolean>> = Object.freeze({
  openchamber: true,
  web: true,
  openchamber_knowledge: true,
  notify: false,
  openchamber_render: true,
  openchamber_secret: true,
  openchamber_workflow: true,
});
const HostToolEnablementInputSchema = z.record(z.string(), z.boolean().optional().catch(undefined)).optional();
export type HostToolEnablementInput = z.infer<typeof HostToolEnablementInputSchema>;

export function normalizeHostToolEnablement(input?: HostToolEnablementInput) {
  const parsed = HostToolEnablementInputSchema.safeParse(input);
  const record = parsed.success ? parsed.data : undefined;

  const result = { ...DEFAULT_HOST_TOOL_ENABLEMENT };
  if (!record) return result;

  for (const name of HOST_TOOL_NAMES) {
    if (record[name] !== undefined) result[name] = record[name];
  }
  if (record.agentControlToolEnabled !== undefined) result.openchamber = record.agentControlToolEnabled;
  if (record.agentWebToolEnabled !== undefined) result.web = record.agentWebToolEnabled;
  if (record.agentKnowledgeToolEnabled !== undefined) result.openchamber_knowledge = record.agentKnowledgeToolEnabled;
  if (record.agentNotifyToolEnabled !== undefined) result.notify = record.agentNotifyToolEnabled;
  if (record.agentRenderToolEnabled !== undefined) result.openchamber_render = record.agentRenderToolEnabled;
  if (record.agentSecretToolEnabled !== undefined) result.openchamber_secret = record.agentSecretToolEnabled;
  if (record.agentWorkflowToolEnabled !== undefined) result.openchamber_workflow = record.agentWorkflowToolEnabled;
  return result;
}

export interface HostToolScope { sessionId: string; rootSessionId: string; workspaceId: string }
export interface HostToolInvocation extends HostToolScope { request: HostActionRequest; signal: AbortSignal }
export const HOST_TOOL_DESCRIPTIONS = {
  openchamber: 'Invoke retained OhPiChamber project/model, session, pull request watch, schedule or file.open actions in the captured workspace. '
    + 'Pass action parameters inside input, for example {"action":"pr.watch","input":{"url":"https://github.com/owner/repo/pull/123"}} or {"action":"session.list","input":{}}. '
    + 'pr.watch watches a pull or merge request at url (GitHub/GitLab) for check status, reviews/comments, conflicts, or merge, waking the session with a message on change; requires url, optional sessionId (defaults to calling session) and directory. '
    + 'pr.unwatch stops watching a pull request for optional sessionId (defaults to calling session) without waking it. '
    + 'wait.list lists this session’s timer and extension waits and available sources. wait.start takes source and args from wait.list (e.g. "timer" and {"minutes":5}) and wakes this session when the wait fires. wait.stop takes optional waitId and stops that wait or all timer and extension waits without waking the session.',
  openchamber_knowledge: "The project's Notes, Todos and Plans, shown in OhPiChamber's Project knowledge panel and shared by its sessions. One action per call. "
    + 'knowledge.list returns everything unless planId or ready narrows it; read it before answering a question the project notes may hold. '
    + 'knowledge.save requires kind and body; with id it replaces, and an update may send only completed, planId or dependsOn. '
    + 'Notes are short facts the user wants at hand; your own learnings go to memory. Todos are the user\'s backlog: add one when asked or when you stop with work left, never for the steps of your current task. '
    + 'Plans are markdown files: list gives their paths, and read or edit one with your file tools; save creates or replaces one whole. '
    + 'knowledge.show opens a plan for the user. knowledge.delete requires kind and id.',
  web: 'Invoke retained browser navigation, snapshot, interaction, inspection, capture and resize actions. Browser credentials remain with the Host.',
  notify: 'Invoke notify.send for an authorized OhPiChamber notification.',
  openchamber_secret: 'Run one approved command with secrets supplied privately by the user. secret.run requires program, args (optional), reason, and inputs: [{env,label,placeholder?}]. Values enter only the child environment, never tool arguments; stdout and stderr are redacted. Remembered values last ten minutes in memory; secret.forget clears this session. secret.request file mode is disabled because secrets must not be saved to disk.',
  openchamber_render: 'Show a page in the chat: one complete HTML document or one openui-lang program, with a title, in the same call. '
    + 'With awaitAnswer the page waits for the user\'s answer and returns their summary and data; without it the page is only shown. '
    + 'With answerLater, for a decision the rest of the task does not wait on, the call returns at once and the page stays open, across restarts, until the user answers or declines; the answer arrives later as a message in this session. '
    + 'With share ({"recipients":["Name"]}) the page is for people outside this chat: the user sends each link and PIN from the card, you never see them, and each answer arrives later as a message; it goes with neither awaitAnswer nor answerLater. '
    + 'The chat draws the page inline, so do not restate what it already says.\n\n' + UI_BLOCKS_GUIDANCE,
  openchamber_workflow: 'Propose, check, run, inspect, stop or resume multi-agent workflows in the project. Actions: workflow.run, workflow.check, workflow.status, workflow.result, workflow.stop, workflow.resume, workflow.save, workflow.list.',
} satisfies Record<HostActionRequest['toolName'], string>;

/**
 * A host action's answer as the chat's cards read it. Only a card-drawn tool
 * publishes the envelope; every other tool hands back the plain value its
 * caller reads.
 */
function envelopeFor(toolName: HostActionRequest['toolName'], action: string, value: JsonValue): JsonObject | null {
  if (toolName === 'openchamber_render' || toolName === 'openchamber_secret') {
    const data = JsonObjectSchema.safeParse(value);
    if (!data.success) return null;
    const answer = JsonObjectSchema.safeParse(data.data.answer);
    return {
      ok: true, schemaVersion: 1, action,
      openchamber: { schemaVersion: 1, ok: true, action, ...(answer.success ? { answer: answer.data } : {}), data: data.data },
    };
  }
  if (toolName === 'openchamber_workflow' && action === 'workflow.run') {
    const data = JsonObjectSchema.safeParse(value);
    if (!data.success) return null;
    const runId = typeof data.data.runId === 'string' ? data.data.runId : undefined;
    if (!runId) return null;
    return {
      ok: true,
      action: 'workflow.run',
      data: { ...data.data, runId },
    };
  }
  return null;
}

export interface HostToolController {
  readonly isEnabled: (tool: HostToolName) => boolean;
  readonly toggle: (tool: HostToolName, enabled: boolean) => Promise<void>;
  readonly configure: (tools: Partial<Record<HostToolName, boolean>>) => Promise<void>;
  readonly bindSession: (session: AgentSession) => void;
  /** Follow a native session rekey (a completed `/btw` branch) so tool calls name the live session. */
  readonly rekey: (sessionId: string) => void;
  readonly extension: ExtensionFactory;
}

export function createHostToolController({
  scope,
  invoke,
  initialEnablement,
  approveSecretRun,
}: {
  scope: HostToolScope;
  invoke: (request: HostToolInvocation) => Promise<JsonValue>;
  initialEnablement?: Partial<Record<HostToolName, boolean>> | ((tool: HostToolName) => boolean);
  approveSecretRun?: (toolCallId: string, command: JsonObject, signal: AbortSignal) => Promise<void>;
}): HostToolController {
  const captured: HostToolScope = { ...scope };
  const enablement: Record<HostToolName, boolean> = { ...DEFAULT_HOST_TOOL_ENABLEMENT };
  if (typeof initialEnablement === 'function') {
    for (const name of HOST_TOOL_NAMES) enablement[name] = initialEnablement(name);
  } else if (initialEnablement) {
    for (const name of HOST_TOOL_NAMES) {
      if (typeof initialEnablement[name] === 'boolean') enablement[name] = initialEnablement[name]!;
    }
  }

  let registeredApi: ExtensionAPI | undefined;
  let boundSession: AgentSession | undefined;
  const registeredWithApi = new Set<HostToolName>();

  const registerSingleTool = (api: ExtensionAPI, toolName: HostToolName) => {
    const parameters = api.typebox.Type.Object({
      action: api.typebox.Type.String({ description: 'The action to invoke, for example "pr.watch" or "session.list"' }),
      input: api.typebox.Type.Record(api.typebox.Type.String(), api.typebox.Type.Unknown(), { description: 'Action-specific parameters object, e.g. {"url":"..."}' }),
    });
    api.registerTool<typeof parameters>({
      name: toolName,
      label: toolName,
      description: HOST_TOOL_DESCRIPTIONS[toolName],
      parameters,
      approval: toolName === 'openchamber_secret' ? { tier: 'exec', policy: 'allow', reason: 'Secret commands require a separate exact-command Bash receipt at execution' } : 'exec',
      loadMode: 'essential',
      async execute(toolCallId, params, signal) {
        const cancellation = signal ?? new AbortController().signal;
        cancellation.throwIfAborted();
        const input = JsonObjectSchema.safeParse(params);
        if (!input.success) {
          throw new Error('Host tool parameters must be an object with "action" and "input", e.g. {"action":"...","input":{}}');
        }
        const action = z.string().min(1).safeParse(input.data.action);
        if (!action.success) {
          throw new Error('Host tool parameters require a non-empty "action" string, e.g. {"action":"...","input":{}}');
        }
        const toolInput = JsonObjectSchema.safeParse(input.data.input);
        if (!toolInput.success) {
          throw new Error(`Host tool action "${action.data}" requires an "input" object containing its parameters, e.g. {"action":"${action.data}","input":{...}}`);
        }
        const parsed = HostActionRequestSchema.parse({
          sessionId: captured.sessionId,
          toolName,
          action: action.data,
          input: toolInput.data,
          ...((toolName === 'openchamber_render' || toolName === 'openchamber_secret') && toolCallId ? { toolCallId } : {}),
        });
        if (parsed.toolName === 'openchamber_secret' && parsed.action === 'secret.run') {
          const command = z.object({
            program: z.string().trim().min(1).refine(value => !value.includes('\0')),
            args: z.array(z.string().refine(value => !value.includes('\0'))).max(64).default([]),
          }).parse(parsed.input);
          if (!approveSecretRun) throw new Error('Secret command approval is unavailable');
          const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
          await approveSecretRun(toolCallId, { command: [command.program, ...command.args].map(quote).join(' ') }, cancellation);
          cancellation.throwIfAborted();
        }
        const value = await invoke({ ...captured, request: parsed, signal: cancellation });
        cancellation.throwIfAborted();
        const envelope = envelopeFor(toolName, parsed.action, value);
        return { content: [{ type: 'text', text: JSON.stringify(envelope ?? value) }], details: envelope ?? value };
      },
    });
    registeredWithApi.add(toolName);
  };

  const extension: ExtensionFactory = (api: ExtensionAPI) => {
    registeredApi = api;
    for (const toolName of HOST_TOOL_NAMES) {
      if (enablement[toolName]) {
        registerSingleTool(api, toolName);
      }
    }
  };

  const toggle = async (tool: HostToolName, enabled: boolean): Promise<void> => {
    enablement[tool] = enabled;
    if (enabled && registeredApi && !registeredWithApi.has(tool)) {
      registerSingleTool(registeredApi, tool);
    }
    if (boundSession) {
      const currentEnabled = typeof boundSession.getEnabledToolNames === 'function'
        ? boundSession.getEnabledToolNames()
        : boundSession.getActiveToolNames();
      const currentMounted = typeof boundSession.getMountedXdevToolNames === 'function'
        ? boundSession.getMountedXdevToolNames()
        : [];
      const nextEnabled = enabled
        ? (currentEnabled.includes(tool) ? currentEnabled : [...currentEnabled, tool])
        : currentEnabled.filter(name => name !== tool);
      const nextMounted = currentMounted.filter(name => name !== tool);
      if (typeof boundSession.setActiveToolPresentation === 'function') {
        await boundSession.setActiveToolPresentation(nextEnabled, nextMounted);
      } else {
        await boundSession.setActiveToolsByName(nextEnabled);
      }
    }
  };

  const configure = async (tools: Partial<Record<HostToolName, boolean>>): Promise<void> => {
    for (const [key, value] of Object.entries(tools)) {
      if (typeof value === 'boolean' && HOST_TOOL_NAMES.includes(key as HostToolName)) {
        await toggle(key as HostToolName, value);
      }
    }
  };

  return {
    isEnabled: (tool: HostToolName) => enablement[tool] === true,
    toggle,
    configure,
    bindSession: (session: AgentSession) => { boundSession = session; },
    rekey: sessionId => { captured.sessionId = sessionId; captured.rootSessionId = sessionId; },
    extension,
  };
}

export function createHostToolExtension(options: {
  scope: HostToolScope;
  invoke: (request: HostToolInvocation) => Promise<JsonValue>;
  initialEnablement?: Partial<Record<HostToolName, boolean>> | ((tool: HostToolName) => boolean);
}): ExtensionFactory {
  return createHostToolController(options).extension;
}
