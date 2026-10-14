import { describe, expect, it, vi } from 'vitest';

import { createStartupPipelineRuntime } from './startup-pipeline-runtime.js';

describe('startup pipeline runtime', () => {
  it('starts the Agent Service after listener publication and signal wiring, independently of legacy bootstrap', async () => {
    const order = [];
    const runtime = createStartupPipelineRuntime({
      createTerminalRuntime: () => ({}),
      createDictationRuntime: () => ({}),
      createMessageStreamWsRuntime: () => ({}),
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
      setupProxy: vi.fn(),
      staticRoutesRuntime: { registerStaticRoutes: vi.fn() },
      apiOnly: false,
      tunnelRuntimeContext: {
        setActivePort: (port) => order.push(`port:${port}`),
      },
      scheduleOpenCodeApiDetection: () => order.push('detect'),
      bootstrapOpenCodeAtStartup: () => order.push('bootstrap'),
      startAgentService: () => order.push('agent'),
      process: {},
      crypto: {},
      server: {},
      attachSignals: false,
    });

    expect(order).toEqual(['listen', 'port:3901', 'handlers', 'agent', 'detect', 'bootstrap']);
  });
});
