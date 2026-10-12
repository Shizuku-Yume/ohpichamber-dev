import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentService } from './supervisor/service.ts';

function requestedPort(args: string[]): number {
  if (args.length === 0) return 0;
  if (args.length !== 2 || args[0] !== '--port') throw new Error('Invalid Agent Service arguments');
  const port = Number(args[1]);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('Invalid Agent Service port');
  return port;
}

async function main(): Promise<void> {
  let service: AgentService | undefined;
  try {
    const current = fileURLToPath(import.meta.url);
    const workerFile = extname(current) === '.ts' ? './worker/index.ts' : './worker/index.js';
    service = new AgentService({
      workerEntrypoint: fileURLToPath(new URL(workerFile, import.meta.url)),
      internalSecret: process.env.OHPICHAMBER_INTERNAL_SECRET ?? '',
      port: requestedPort(process.argv.slice(2)),
    });
    const owned = service;
    const stop = () => {
      void owned.stop().then(() => process.exit(0), () => process.exit(1));
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    await owned.start();
  } catch {
    process.stderr.write('Agent Service startup failed\n');
    try { await service?.stop(); } finally { process.exitCode = 1; }
  }
}

if (import.meta.main) void main();
