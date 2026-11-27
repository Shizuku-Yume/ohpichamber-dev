import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConnectUrlCommand } from './commands-connect-url.js';
import { EXIT_CODE } from './cli-errors.js';

const tempDirs = [];

const createTempDataDir = (settings = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpichamber-connect-url-'));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings), 'utf8');
  return dir;
};

afterEach(() => {
  delete process.env.OPENCHAMBER_DATA_DIR;
  delete process.env.OPENCHAMBER_RELAY_URL;
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe('commands-connect-url relay configuration', () => {
  it('fails fast with USAGE_ERROR when --relay is passed without a configured relay URL', async () => {
    process.env.OPENCHAMBER_DATA_DIR = createTempDataDir({});
    delete process.env.OPENCHAMBER_RELAY_URL;
    const serveCommand = vi.fn(async () => { });
    const command = createConnectUrlCommand({ serveCommand });

    await expect(
      command({ port: 3000, relay: true, server: 'http://127.0.0.1:3000', json: true }),
    ).rejects.toMatchObject({
      exitCode: EXIT_CODE.USAGE_ERROR,
      message: expect.stringContaining('No relay URL is configured'),
    });
    expect(serveCommand).not.toHaveBeenCalled();
  });

  it('omits the relay candidate on plain connect-url when privateRelay.enabled is true without a relayUrl', async () => {
    process.env.OPENCHAMBER_DATA_DIR = createTempDataDir({ privateRelay: { enabled: true } });
    delete process.env.OPENCHAMBER_RELAY_URL;
    const serveCommand = vi.fn(async () => { });
    let output = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    const command = createConnectUrlCommand({ serveCommand });

    await command({ port: 3000, server: 'http://192.168.1.20:3000', json: true });

    const payload = JSON.parse(output);
    expect(payload.candidates).toEqual([
      { type: 'lan', url: 'http://192.168.1.20:3000', priority: 10 },
    ]);
  });

  it('keeps privateRelay.enabled when the stored relayUrl is mistyped', async () => {
    process.env.OPENCHAMBER_DATA_DIR = createTempDataDir({ privateRelay: { enabled: true, relayUrl: 42 } });
    process.env.OPENCHAMBER_RELAY_URL = 'wss://relay.selfhosted.test/ws';
    const serveCommand = vi.fn(async () => { });
    let output = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    const command = createConnectUrlCommand({ serveCommand });

    await command({ port: 3000, server: 'http://192.168.1.20:3000', json: true });

    // relayUrl: 42 degrades only itself — the pinned env relay still applies,
    // and the valid enabled: true beside it must survive, so plain connect-url
    // keeps advertising the relay candidate.
    const payload = JSON.parse(output);
    expect(payload.candidates).toHaveLength(2);
    expect(payload.candidates[1]).toMatchObject({ type: 'relay', relayUrl: 'wss://relay.selfhosted.test/ws' });
  });

  it('includes the configured relay candidate when OPENCHAMBER_RELAY_URL is set', async () => {
    process.env.OPENCHAMBER_DATA_DIR = createTempDataDir({});
    process.env.OPENCHAMBER_RELAY_URL = 'wss://relay.selfhosted.test/ws';
    const serveCommand = vi.fn(async () => { });
    let output = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    const command = createConnectUrlCommand({ serveCommand });

    await command({ port: 3000, relay: true, server: 'http://192.168.1.20:3000', json: true });

    const payload = JSON.parse(output);
    expect(payload.candidates).toHaveLength(2);
    expect(payload.candidates[1]).toMatchObject({
      type: 'relay',
      relayUrl: 'wss://relay.selfhosted.test/ws',
      priority: 30,
    });
  });
});
