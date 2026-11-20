import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sourceRegistration = new URL('../../web/scripts/register-server-sources.mjs', import.meta.url).href;
const runner = fileURLToPath(new URL('../../../scripts/run-isolated-tests.mjs', import.meta.url));

const result = spawnSync(process.execPath, [runner, '.', '--exclude', 'resources/agent-runtime'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${JSON.stringify(sourceRegistration)}`, '--conditions=openchamber-source'].filter(Boolean).join(' '),
    BUN_OPTIONS: [process.env.BUN_OPTIONS, '--conditions=openchamber-source'].filter(Boolean).join(' '),
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
