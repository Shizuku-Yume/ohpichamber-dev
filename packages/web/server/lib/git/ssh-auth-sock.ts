import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const gpgconfCandidates = ['gpgconf', '/opt/homebrew/bin/gpgconf', '/usr/local/bin/gpgconf'];
const gpgAgentLaunchesWithoutSocket = new Set<string>();

const isSocketPath = async (candidate: string) => {
  if (!candidate) {
    return false;
  }
  try {
    const stat = await fs.promises.stat(candidate);
    return stat.isSocket();
  } catch {
    return false;
  }
};

const RESOLUTION_RETRY_MS = 30_000;
let memoized: { value: string | null; at: number } | undefined;
let inflight: Promise<string | null> | null = null;

const resolveSshAuthSockUncached = async () => {
  const existing = (process.env.SSH_AUTH_SOCK || '').trim();
  if (existing) {
    return existing;
  }

  if (process.platform === 'win32') {
    return null;
  }

  const gpgSock = path.join(os.homedir(), '.gnupg', 'S.gpg-agent.ssh');
  if (await isSocketPath(gpgSock)) {
    return gpgSock;
  }

  const runGpgconf = async (args: string[]) => {
    for (const candidate of gpgconfCandidates) {
      try {
        const { stdout } = await execFileAsync(candidate, args);
        return String(stdout || '');
      } catch {
        continue;
      }
    }
    return '';
  };

  const candidate = (await runGpgconf(['--list-dirs', 'agent-ssh-socket'])).trim();
  if (candidate && await isSocketPath(candidate)) {
    return candidate;
  }

  if (candidate && !gpgAgentLaunchesWithoutSocket.has(candidate)) {
    await runGpgconf(['--launch', 'gpg-agent']);
    const retried = (await runGpgconf(['--list-dirs', 'agent-ssh-socket'])).trim();
    if (retried && await isSocketPath(retried)) {
      return retried;
    }
    gpgAgentLaunchesWithoutSocket.add(candidate);
  }

  return null;
};

export const resolveSshAuthSock = async () => {
  if ((process.env.SSH_AUTH_SOCK || '').trim()) {
    return (process.env.SSH_AUTH_SOCK || '').trim();
  }
  if (memoized) {
    if (memoized.value === null && Date.now() - memoized.at < RESOLUTION_RETRY_MS) return null;
    if (memoized.value !== null && await isSocketPath(memoized.value)) return memoized.value;
  }
  if (!inflight) {
    inflight = resolveSshAuthSockUncached().finally(() => { inflight = null; });
  }
  const value = await inflight;
  memoized = { value, at: Date.now() };
  return value;
};
