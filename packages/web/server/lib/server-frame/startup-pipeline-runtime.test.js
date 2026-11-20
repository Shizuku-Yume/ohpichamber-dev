import { describe, expect, it, vi } from 'vitest';

import { createStartupPipelineRuntime } from './startup-pipeline-runtime.js';

describe('startup pipeline runtime', () => {
  it('starts only the Agent Service after Host capabilities, listener publication and signal wiring', async () => {
    const order = [];
    const runtime = createStartupPipelineRuntime({
      createTerminalRuntime: () => { order.push('terminal'); return {}; },
      createDictationRuntime: () => { order.push('dictation'); return {}; },
      createMessageStreamWsRuntime: () => { order.push('events'); return {}; },
      createServerStartupRuntime: () => ({
        resolveBindHost: () => '127.0.0.1',
        startListeningAndMaybeTunnel: async () => {
          order.push('listen');
          return { activePort: 3901 };
        },
        attachProcessHandlers: () => order.push('handlers'),
      }),
    });

    await runtime.run({
      app: {},
      staticRoutesRuntime: { registerStaticRoutes: vi.fn() },
      apiOnly: false,
      tunnelRuntimeContext: {
        setActivePort: (port) => order.push(`port:${port}`),
      },
      startAgentService: () => order.push('agent'),
      onListenerReady: () => order.push('git'),
      process: {},
      crypto: {},
      server: {},
      attachSignals: false,
    });

    expect(order).toEqual(['terminal', 'dictation', 'events', 'listen', 'port:3901', 'git', 'handlers', 'agent']);
  });
});
