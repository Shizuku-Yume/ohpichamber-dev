import { describe, expect, it, vi } from 'vitest';

import { createStartupPipelineRuntime } from './startup-pipeline-runtime.js';

describe('startup pipeline runtime', () => {
  it('starts only the Agent Service after Host capabilities, listener publication and signal wiring', async () => {
    const order = [];
    const broadcastUiEvent = vi.fn();
    const createTerminalRuntime = vi.fn(() => ({}));
    const runtime = createStartupPipelineRuntime({
<<<<<<< HEAD:packages/web/server/lib/host/startup-pipeline-runtime.test.js
      createTerminalRuntime: () => { order.push('terminal'); return {}; },
      createDictationRuntime: () => { order.push('dictation'); return {}; },
      createMessageStreamWsRuntime: () => { order.push('events'); return {}; },
=======
      createTerminalRuntime,
      createDictationRuntime: () => ({}),
      createMessageStreamWsRuntime: () => ({}),
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/startup-pipeline-runtime.test.js
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
<<<<<<< HEAD:packages/web/server/lib/host/startup-pipeline-runtime.test.js
=======
      broadcastUiEvent,
      setupProxy: vi.fn(),
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/startup-pipeline-runtime.test.js
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

<<<<<<< HEAD:packages/web/server/lib/host/startup-pipeline-runtime.test.js
    expect(order).toEqual(['terminal', 'dictation', 'events', 'listen', 'port:3901', 'git', 'handlers', 'agent']);
=======
    expect(order).toEqual(['listen', 'port:3901', 'detect', 'bootstrap']);
    expect(createTerminalRuntime).toHaveBeenCalledWith(expect.objectContaining({ broadcastUiEvent }));
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/startup-pipeline-runtime.test.js
  });
});
