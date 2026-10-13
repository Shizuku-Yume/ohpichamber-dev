import type { ExtensionFactory } from '@oh-my-pi/pi-coding-agent/sdk';
import { JsonObjectSchema, type JsonValue } from '@openchamber/agent-contract';
import { HostActionRequestSchema, type HostActionRequest } from '../native-policy-protocol.ts';

export interface HostToolScope { sessionId: string; rootSessionId: string; workspaceId: string }
export interface HostToolInvocation extends HostToolScope { request: HostActionRequest; signal: AbortSignal }
export function createHostToolExtension({ scope, invoke }: { scope: HostToolScope; invoke: (request: HostToolInvocation) => Promise<JsonValue> }): ExtensionFactory {
  const captured = Object.freeze({ ...scope });
  return api => {
    const descriptions: Record<HostActionRequest['toolName'], string> = {
      openchamber: 'Invoke retained OpenChamber project/model, session, schedule or file.open actions in the captured workspace.',
      web: 'Invoke retained browser navigation, snapshot, interaction, inspection, capture and resize actions. Browser credentials remain with the Host.',
      memory: 'Invoke memory.read, memory.list, memory.save or memory.delete in the captured session.',
      notify: 'Invoke notify.send for an authorized OpenChamber notification.',
    };
    for (const toolName of ['openchamber', 'web', 'memory', 'notify'] as const) {
      const parameters = api.typebox.Type.Object({
        action: api.typebox.Type.String(),
        input: api.typebox.Type.Record(api.typebox.Type.String(), api.typebox.Type.Unknown()),
      });
      api.registerTool<typeof parameters>({
        name: toolName, label: toolName, description: descriptions[toolName], parameters, approval: 'exec',
        async execute(_toolCallId, params, signal) {
          const cancellation = signal ?? new AbortController().signal;
          cancellation.throwIfAborted();
          const input = JsonObjectSchema.parse(params);
          const action = typeof input.action === 'string' ? input.action : '';
          const toolInput = JsonObjectSchema.parse(input.input);
          const parsed = HostActionRequestSchema.parse({ sessionId: captured.sessionId, toolName, action, input: toolInput });
          const value = await invoke({ ...captured, request: parsed, signal: cancellation });
          cancellation.throwIfAborted();
          return { content: [{ type: 'text', text: JSON.stringify(value) }], details: value };
        },
      });
    }
  };
}
