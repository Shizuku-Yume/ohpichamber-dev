import path from 'node:path';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const maxWorkers = Math.max(1, Math.min(4, availableParallelism() - 1));

export default defineConfig({
  resolve: {
    alias: [
      { find: 'bun:test', replacement: path.resolve(here, './test/bun-test-shim.ts') },
<<<<<<< HEAD
      // The same shared-UI aliases the app build uses. Without them a test can
      // reference `@openchamber/ui/...` in a mock factory but not resolve the
      // real module behind it, which is what forced mocks to hand-copy export
      // lists that then fell behind the source.
      { find: '@openchamber/agent-contract', replacement: path.resolve(here, '../agent-contract/src/index.ts') },
      { find: 'ohpichamber-sdk/schemas', replacement: path.resolve(here, '../sdk/src/schemas.ts') },
      { find: 'ohpichamber-sdk/ui', replacement: path.resolve(here, '../sdk/src/ui/index.ts') },
      { find: 'ohpichamber-sdk', replacement: path.resolve(here, '../sdk/src/index.ts') },
||||||| bc50ba56aa
      // The same shared-UI aliases the app build uses. Without them a test can
      // reference `@openchamber/ui/...` in a mock factory but not resolve the
      // real module behind it, which is what forced mocks to hand-copy export
      // lists that then fell behind the source.
      { find: '@openchamber/sdk/schemas', replacement: path.resolve(here, '../sdk/src/schemas.ts') },
      { find: '@openchamber/sdk/ui', replacement: path.resolve(here, '../sdk/src/ui/index.ts') },
      { find: '@openchamber/sdk', replacement: path.resolve(here, '../sdk/src/index.ts') },
=======
      { find: '@openchamber/sdk/schemas', replacement: path.resolve(here, '../sdk/src/schemas.ts') },
      { find: '@openchamber/sdk/ui', replacement: path.resolve(here, '../sdk/src/ui/index.ts') },
      { find: '@openchamber/sdk', replacement: path.resolve(here, '../sdk/src/index.ts') },
>>>>>>> upstream/main
      { find: '@openchamber/ui', replacement: path.resolve(here, '../ui/src') },
      { find: '@web', replacement: path.resolve(here, './src') },
      { find: /^@\//, replacement: `${path.resolve(here, '../ui/src')}/` },
    ],
  },
  test: {
    maxWorkers,
    include: [...configDefaults.include, '../ui/src/**/*.vitest.tsx'],
<<<<<<< HEAD
    // These suites use Node's test context and are run with `node --test`; Vitest loads their
    // modules but cannot register the Node-owned tests.
    exclude: [...configDefaults.exclude, 'resources/**', 'server/lib/host/legacy-attachment-importer.test.js', 'server/lib/message-queue/sqlite-store.test.js'],
    // The Git suites drive a real `git` binary against temporary repositories.
    // Those subprocess round-trips routinely pass the 5s default, and which
    // cases exceed it shifts with machine load, so the default made a valid
    // suite fail differently on every run.
||||||| bc50ba56aa
    // The Git suites drive a real `git` binary against temporary repositories.
    // Those subprocess round-trips routinely pass the 5s default, and which
    // cases exceed it shifts with machine load, so the default made a valid
    // suite fail differently on every run.
=======
>>>>>>> upstream/main
    testTimeout: 30_000,
    hookTimeout: 30_000,
<<<<<<< HEAD
    // Tests never touch the developer's real ~/.config/ohpichamber, and
    // supertest servers listen on the loopback address it sends to.
||||||| bc50ba56aa
    // Tests never touch the developer's real ~/.config/openchamber, and
    // supertest servers listen on the loopback address it sends to.
=======
>>>>>>> upstream/main
    setupFiles: ['./test/isolated-data-dir.ts', './test/loopback-supertest.js'],
    env: {
      OPENCHAMBER_ENTERPRISE_MODE: '',
      OPENCHAMBER_RELAY_URL: '',
      OPENCHAMBER_JEV_URL: '',
      OPENCHAMBER_JEV_MODEL: '',
      OPENCHAMBER_JEV_API_KEY: '',
      OPENCODE_DISABLE_CLAUDE_CODE: '',
      OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: '',
      OPENCODE_DISABLE_EXTERNAL_SKILLS: '',
    },
  },
});
