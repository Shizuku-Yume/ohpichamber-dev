import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentService } from './supervisor/service.ts';
import { HostApprovalPolicies } from './interaction/host-policy.ts';

function requestedPort(args: string[]): number {
  if (args.length === 0) return 0;
  if (args.length !== 2 || args[0] !== '--port') throw new Error('Invalid Agent Service arguments');
  const port = Number(args[1]);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('Invalid Agent Service port');
  return port;
}

async function main(): Promise<void> {
  let service: AgentService | undefined;
  const policies = new HostApprovalPolicies();
  try {
    const current = fileURLToPath(import.meta.url);
    const workerFile = extname(current) === '.ts' ? './worker/index.ts' : './worker/index.js';
    service = new AgentService({
      workerEntrypoint: fileURLToPath(new URL(workerFile, import.meta.url)),
      internalSecret: process.env.OHPICHAMBER_INTERNAL_SECRET ?? '',
      stateDirectory: join(process.cwd(), 'agent-state'),
      port: requestedPort(process.argv.slice(2)),
      approvalPolicyCommit: policies.commit,
      approvalPolicyLoad: policies.load,
    });
    const owned = service;
    const stop = () => {
      void owned.stop().then(() => { policies.close(); process.exit(0); }, () => { policies.close(); process.exit(1); });
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    await owned.start();
  } catch {
    process.stderr.write('Agent Service startup failed\n');
    try { await service?.stop(); } finally { policies.close(); process.exitCode = 1; }
  }
}

if (import.meta.main) void main();
