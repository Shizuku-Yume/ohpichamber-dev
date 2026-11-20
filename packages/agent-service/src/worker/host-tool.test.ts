import { describe, expect, test } from 'bun:test';
import type { HostToolEnablementInput, HostToolInvocation } from './host-tool.ts';
import { createHostToolController, createHostToolExtension, normalizeHostToolEnablement } from './host-tool.ts';
import { HostActionRequestSchema } from '../native-policy-protocol.ts';
import { ProposedWorkflowResultSchema } from '@openchamber/agent-contract';

interface RegisteredToolStub {
  name: string;
  label: string;
  description: string;
  approval: unknown;
  loadMode: string;
  execute: (callId: string, params: Record<string, unknown>, signal?: AbortSignal) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>;
}

describe('HostActionRequestSchema', () => {
  test('parses workflow.run in the host action schema', () => {
    const parsed = HostActionRequestSchema.safeParse({
      sessionId: 'session-123',
      toolName: 'openchamber_workflow',
      action: 'workflow.run',
      input: { script: 'workflow.js' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.toolName).toBe('openchamber_workflow');
      expect(parsed.data.action).toBe('workflow.run');
    }
  });

  test('parses pr.watch and pr.unwatch in the host action schema under openchamber', () => {
    const parsedWatch = HostActionRequestSchema.safeParse({
      sessionId: 'session-123',
      toolName: 'openchamber',
      action: 'pr.watch',
      input: { url: 'https://github.com/acme/app/pull/1' },
    });
    expect(parsedWatch.success).toBe(true);
    if (parsedWatch.success) {
      expect(parsedWatch.data.toolName).toBe('openchamber');
      expect(parsedWatch.data.action).toBe('pr.watch');
    }

    const parsedUnwatch = HostActionRequestSchema.safeParse({
      sessionId: 'session-123',
      toolName: 'openchamber',
      action: 'pr.unwatch',
      input: {},
    });
    expect(parsedUnwatch.success).toBe(true);
    if (parsedUnwatch.success) {
      expect(parsedUnwatch.data.toolName).toBe('openchamber');
      expect(parsedUnwatch.data.action).toBe('pr.unwatch');
    }
  });

  test('rejects deleted openchamber_image and memory tools', () => {
    expect(HostActionRequestSchema.safeParse({
      sessionId: 'session-123',
      toolName: 'openchamber_image',
      action: 'image.generate',
      input: {},
    }).success).toBe(false);

    expect(HostActionRequestSchema.safeParse({
      sessionId: 'session-123',
      toolName: 'memory',
      action: 'memory.read',
      input: {},
    }).success).toBe(false);
  });
});

describe('createHostToolExtension & controller', () => {
  test('secret commands require call identity and approval before the captured Host invocation', async () => {
    const tools = new Map<string, RegisteredToolStub>();
    const order: string[] = [];
    let rejectApproval = false;
    let cancelApproval = false;
    const cancellation = new AbortController();
    const controller = createHostToolController({
      scope: { sessionId: 'session-123', rootSessionId: 'session-123', workspaceId: 'ws-123' },
      approveSecretRun: async (id, command, signal) => {
        expect(id).toBe('secret-call');
        expect(command).toEqual({ command: "'example' 'a'\\''b' '$(not-a-shell)'" });
        expect(signal).toBe(cancellation.signal);
        order.push('approve');
        if (rejectApproval) throw new Error('Approval rejected');
        if (cancelApproval) cancellation.abort();
      },
      invoke: async ({ request }) => {
        order.push('invoke');
        expect(request).toMatchObject({ sessionId: 'session-123', toolCallId: 'secret-call', toolName: 'openchamber_secret' });
        return { answer: { status: 'ran' }, stdout: '[secret:TOKEN]' };
      },
    });
    controller.extension({
      typebox: { Type: { Object: () => ({}), String: () => ({}), Record: () => ({}), Unknown: () => ({}) } },
      registerTool: (tool: RegisteredToolStub) => tools.set(tool.name, tool),
    } as never);
    const tool = tools.get('openchamber_secret')!;
    const params = { action: 'secret.run', input: { program: 'example', args: ["a'b", '$(not-a-shell)'], sessionId: 'forged', authorized: true } };
    await expect(tool.execute('', params, cancellation.signal)).rejects.toThrow();
    expect(order).toEqual([]);
    const result = await tool.execute('secret-call', params, cancellation.signal);
    expect(order).toEqual(['approve', 'invoke']);
    expect(result.details).toMatchObject({ openchamber: { action: 'secret.run', answer: { status: 'ran' } } });
    order.length = 0;
    rejectApproval = true;
    await expect(tool.execute('secret-call', params, cancellation.signal)).rejects.toThrow('Approval rejected');
    expect(order).toEqual(['approve']);
    order.length = 0;
    rejectApproval = false;
    cancelApproval = true;
    await expect(tool.execute('secret-call', params, cancellation.signal)).rejects.toThrow();
    expect(order).toEqual(['approve']);
  });

  test('secret.run fails closed without an approval owner even with a supplied authorized flag', async () => {
    const tools = new Map<string, RegisteredToolStub>();
    let invoked = false;
    const controller = createHostToolController({
      scope: { sessionId: 'session-123', rootSessionId: 'session-123', workspaceId: 'ws-123' },
      invoke: async () => { invoked = true; return {}; },
    });
    controller.extension({
      typebox: { Type: { Object: () => ({}), String: () => ({}), Record: () => ({}), Unknown: () => ({}) } },
      registerTool: (tool: RegisteredToolStub) => tools.set(tool.name, tool),
    } as never);
    await expect(tools.get('openchamber_secret')!.execute('secret-call', {
      action: 'secret.run', input: { program: 'example', authorized: true },
    })).rejects.toThrow('Secret command approval is unavailable');
    expect(invoked).toBe(false);
    expect(HostActionRequestSchema.safeParse({ sessionId: 'session-123', toolName: 'openchamber_secret', action: 'secret.run', input: {} }).success).toBe(false);
  });

  test('disabled host tool is absent and workflow.run dispatches to host', async () => {
    const registeredTools = new Map<string, RegisteredToolStub>();
    const mockApi = {
      typebox: {
        Type: {
          Object: (props: unknown) => ({ type: 'object', properties: props }),
          String: () => ({ type: 'string' }),
          Record: () => ({ type: 'object' }),
          Unknown: () => ({}),
        },
      },
      registerTool: (tool: RegisteredToolStub) => {
        registeredTools.set(tool.name, tool);
      },
    };

    let capturedInvocation: HostToolInvocation | null = null;
    const controller = createHostToolController({
      scope: { sessionId: 'session-123', rootSessionId: 'root-123', workspaceId: 'ws-123' },
      invoke: async (invocation) => {
        capturedInvocation = invocation;
        return { ok: true, runId: 'run-workflow-1' };
      },
    });

    controller.extension(mockApi as never);

    // Default enabled host tools are registered
    expect(registeredTools.has('openchamber')).toBe(true);
    expect(registeredTools.has('web')).toBe(true);
    expect(registeredTools.has('openchamber_knowledge')).toBe(true);
    expect(registeredTools.has('openchamber_render')).toBe(true);
    expect(registeredTools.has('openchamber_workflow')).toBe(true);

    // Disabled host tool (notify defaults to false) is ABSENT
    expect(registeredTools.has('notify')).toBe(false);

    // Deleted tools are ABSENT
    expect(registeredTools.has('openchamber_image')).toBe(false);
    expect(registeredTools.has('memory')).toBe(false);

    // Execute openchamber_workflow tool call
    const workflowTool = registeredTools.get('openchamber_workflow');
    expect(workflowTool).toBeDefined();
    const result = await workflowTool!.execute('call-wf-1', {
      action: 'workflow.run',
      input: { script: 'deploy.js' },
    });

    expect(result.details).toEqual({
      ok: true,
      action: 'workflow.run',
      data: { ok: true, runId: 'run-workflow-1' },
    });
    expect(ProposedWorkflowResultSchema.safeParse(result.details).success).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({
      ok: true,
      action: 'workflow.run',
      data: { ok: true, runId: 'run-workflow-1' },
    });
    expect(capturedInvocation!.request).toEqual({
      sessionId: 'session-123',
      toolName: 'openchamber_workflow',
      action: 'workflow.run',
      input: { script: 'deploy.js' },
    });

    // Toggle notify on -> dynamically registers tool
    expect(registeredTools.has('notify')).toBe(false);
    await controller.toggle('notify', true);
    expect(registeredTools.has('notify')).toBe(true);
  });

  test('openchamber tool rejects missing input parameter with clear guidance', async () => {
    const registeredTools = new Map<string, RegisteredToolStub>();
    const mockApi = {
      typebox: {
        Type: {
          Object: (props: unknown) => ({ type: 'object', properties: props }),
          String: () => ({ type: 'string' }),
          Record: () => ({ type: 'object' }),
          Unknown: () => ({}),
        },
      },
      registerTool: (tool: RegisteredToolStub) => {
        registeredTools.set(tool.name, tool);
      },
    };

    const controller = createHostToolController({
      scope: { sessionId: 'session-123', rootSessionId: 'root-123', workspaceId: 'ws-123' },
      invoke: async () => ({ ok: true }),
    });
    controller.extension(mockApi as never);

    const openchamberTool = registeredTools.get('openchamber');
    expect(openchamberTool).toBeDefined();

    // Missing input property (e.g. model put url at top level)
    await expect(openchamberTool!.execute('call-1', {
      action: 'pr.watch',
      url: 'https://github.com/acme/app/pull/1',
    })).rejects.toThrow('Host tool action "pr.watch" requires an "input" object containing its parameters');

    // Valid input property succeeds
    const result = await openchamberTool!.execute('call-2', {
      action: 'pr.watch',
      input: { url: 'https://github.com/acme/app/pull/1' },
    });
    expect(result.details).toEqual({ ok: true });
  });

  test('re-registers and deactivates tools on toggle with active session mock', async () => {
    const registeredTools = new Map<string, RegisteredToolStub>();
    const mockApi = {
      typebox: {
        Type: {
          Object: (props: unknown) => ({ type: 'object', properties: props }),
          String: () => ({ type: 'string' }),
          Record: () => ({ type: 'object' }),
          Unknown: () => ({}),
        },
      },
      registerTool: (tool: RegisteredToolStub) => {
        registeredTools.set(tool.name, tool);
      },
    };

    let activeTools = ['openchamber', 'web', 'openchamber_knowledge', 'openchamber_render', 'openchamber_workflow'];
    const mockSession = {
      getActiveToolNames: () => [...activeTools],
      setActiveToolsByName: async (names: string[]) => {
        activeTools = [...names];
      },
    };

    const controller = createHostToolController({
      scope: { sessionId: 'session-123', rootSessionId: 'root-123', workspaceId: 'ws-123' },
      invoke: async () => ({ ok: true }),
    });

    controller.extension(mockApi as never);
    controller.bindSession(mockSession as never);

    expect(mockSession.getActiveToolNames()).not.toContain('notify');

    // Toggle notify on
    await controller.toggle('notify', true);
    expect(registeredTools.has('notify')).toBe(true);
    expect(mockSession.getActiveToolNames()).toContain('notify');

    // Toggle web off -> removed from session active tool list
    await controller.toggle('web', false);
    expect(mockSession.getActiveToolNames()).not.toContain('web');
  });
});

test('openchamber_render is registered and carries its call id and answer envelope', async () => {
  const registeredTools = new Map<string, RegisteredToolStub>();
  const mockApi = {
    typebox: {
      Type: {
        Object: (props: unknown) => ({ type: 'object', properties: props }),
        String: () => ({ type: 'string' }),
        Record: () => ({ type: 'object' }),
        Unknown: () => ({}),
      },
    },
    registerTool: (tool: RegisteredToolStub) => { registeredTools.set(tool.name, tool); },
  };
  const invocations: HostToolInvocation[] = [];
  const extension = createHostToolExtension({
    scope: { sessionId: 'session-123', rootSessionId: 'root-123', workspaceId: 'ws-123' },
    invoke: async (invocation) => {
      invocations.push(invocation);
      return { title: 'Fixture page', answer: { answered: true, summary: 'Chose the first', data: { choice: 1 } } };
    },
  });
  extension(mockApi as never);
  expect(registeredTools.has('openchamber_render')).toBe(true);
  expect(registeredTools.get('openchamber_render')!.description).toContain('root = Stack(');
  expect(registeredTools.get('openchamber_render')!.description).toContain('```openui-lang');
  expect(registeredTools.get('web')!.description).not.toContain('UI blocks:');
  const result = await registeredTools.get('openchamber_render')!.execute('call-render', {
    action: 'render.page',
    input: { html: '<h1>Fixture</h1>', title: 'Fixture page', awaitAnswer: true },
  });
  expect(invocations[0]?.request).toEqual({
    sessionId: 'session-123', toolName: 'openchamber_render', action: 'render.page',
    input: { html: '<h1>Fixture</h1>', title: 'Fixture page', awaitAnswer: true }, toolCallId: 'call-render',
  });
  expect(result.details).toMatchObject({
    ok: true, action: 'render.page',
    openchamber: { schemaVersion: 1, ok: true, action: 'render.page', answer: { answered: true, summary: 'Chose the first' } },
  });
});

test('normalizeHostToolEnablement preserves valid flags when an entry has a non-boolean value', () => {
  const input: HostToolEnablementInput = { openchamber: false };
  Object.assign(input, { extra: 'yes', web: 123 });
  expect(normalizeHostToolEnablement(input)).toEqual({
    openchamber: false,
    web: true,
    openchamber_knowledge: true,
    notify: false,
    openchamber_usage: false,
    openchamber_render: true,
    openchamber_secret: true,
    openchamber_workflow: true,
  });
});

test('usage is opt-in, schema-restricted and publishes the native usage card envelope', async () => {
  expect(normalizeHostToolEnablement({}).openchamber_usage).toBe(false);
  expect(normalizeHostToolEnablement({ agentUsageToolEnabled: true }).openchamber_usage).toBe(true);
  expect(normalizeHostToolEnablement({ agentUsageToolEnabled: false }).openchamber_usage).toBe(false);
  for (const action of ['usage.read', 'session.track', 'session.markDone']) {
    expect(HostActionRequestSchema.safeParse({ toolName: action === 'usage.read' ? 'openchamber_usage' : 'openchamber', action, sessionId: 'session-123', input: {} }).success).toBe(true);
  }
  expect(HostActionRequestSchema.safeParse({ toolName: 'openchamber_usage', action: 'session.send', sessionId: 'session-123', input: {} }).success).toBe(false);
  const registered = new Map<string, RegisteredToolStub>();
  const invoked: HostToolInvocation[] = [];
  createHostToolExtension({
    scope: { sessionId: 'session-123', rootSessionId: 'session-123', workspaceId: 'ws-123' },
    initialEnablement: { openchamber_usage: true },
    invoke: async (invocation) => { invoked.push(invocation); return { providers: [] }; },
  })({ typebox: { Type: { Object: (props: unknown) => ({ properties: props }), String: () => ({}), Record: () => ({}), Unknown: () => ({}) } }, registerTool: (tool: RegisteredToolStub) => { registered.set(tool.name, tool); } } as never);
  expect(registered.get('openchamber_usage')?.description).toContain('usage.read');
  const result = await registered.get('openchamber_usage')!.execute('call-usage', { action: 'usage.read', input: {} });
  expect(invoked[0]?.request).toEqual({ sessionId: 'session-123', toolName: 'openchamber_usage', action: 'usage.read', input: {} });
  expect(result.details).toMatchObject({ ok: true, action: 'usage.read', openchamber: { schemaVersion: 1, ok: true, action: 'usage.read', data: { providers: [] } } });
});
