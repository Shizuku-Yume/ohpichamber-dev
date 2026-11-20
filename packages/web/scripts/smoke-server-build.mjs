import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceCli = process.argv.includes('--source-cli');
const builtCli = process.argv.includes('--built-cli');
const label = sourceCli ? 'Node source CLI' : builtCli ? 'Node built CLI' : 'Node built entry';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-built-server-'));
const listener = net.createServer();
await new Promise((resolve, reject) => listener.once('error', reject).listen(0, 'localhost', resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const env = Object.fromEntries(['PATH', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'SystemRoot', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP']
  .filter((name) => process.env[name] !== undefined).map((name) => [name, process.env[name]]));
for (const folder of ['home', 'config', 'data', 'cache', 'state', 'openchamber', 'desktop', 'agent']) fs.mkdirSync(path.join(root, folder));
Object.assign(env, {
  HOME: path.join(root, 'home'),
  XDG_CONFIG_HOME: path.join(root, 'config'),
  XDG_DATA_HOME: path.join(root, 'data'),
  XDG_CACHE_HOME: path.join(root, 'cache'),
  XDG_STATE_HOME: path.join(root, 'state'),
  OPENCHAMBER_DATA_DIR: path.join(root, 'openchamber'),
  OPENCHAMBER_DESKTOP_USER_DATA_DIR: path.join(root, 'desktop'),
  PI_CONFIG_DIR: path.join(root, 'agent'),
  OPENCHAMBER_RELAY_HOST: 'off',
});
const log = fs.openSync(path.join(root, 'server.log'), 'w');
const args = sourceCli
  ? [path.join(webRoot, 'bin/cli.js'), 'serve', '--foreground', '--api-only']
  : builtCli
    ? [path.join(webRoot, 'build/bin/cli.js'), 'serve', '--foreground']
    : [path.join(webRoot, 'build/server/index.js')];
const child = spawn(process.execPath, [...args, '--host', 'localhost', '--port', String(port)], {
  cwd: webRoot, env, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', log, log],
});
const exited = new Promise((resolve) => {
  child.once('error', (error) => resolve(error));
  child.once('exit', (code, signal) => resolve({ code, signal }));
});
try {
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(fs.readFileSync(path.join(root, 'server.log'), 'utf8'));
    try {
      const response = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(1_000) });
      const health = await response.json();
      if (response.ok && health.status === 'ok') {
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  if (!ready) throw new Error(`Built Node entry did not answer:\n${fs.readFileSync(path.join(root, 'server.log'), 'utf8')}`);
  console.log(`${label} /health: 200; port=${port}; pid=${child.pid}`);
  let agentReady = false;
  while (Date.now() < deadline && child.exitCode === null) {
    const response = await fetch(`http://localhost:${port}/api/agent/v1/ready`, { signal: AbortSignal.timeout(2_000) }).catch(() => null);
    const state = response?.ok ? await response.json() : null;
    if (state?.ready === true && state.engine === 'omp') { agentReady = true; break; }
    await delay(100);
  }
  if (!agentReady) throw new Error(`Built Node entry did not start the native Agent Service:\n${fs.readFileSync(path.join(root, 'server.log'), 'utf8')}`);
  for (const route of [...(sourceCli ? [] : ['/']), '/api/agent/v1/ready']) {
    const response = await fetch(`http://localhost:${port}${route}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
    if (route === '/') {
      if (!(await response.text()).toLowerCase().includes('<!doctype html')) throw new Error('UI response is not HTML');
    } else {
      const result = await response.json();
      if (result.ready !== true || result.engine !== 'omp') throw new Error('Native Agent Service is not ready');
    }
    console.log(`${label} ${route}: 200`);
  }
  if (sourceCli) {
    const projectPath = path.join(root, 'project-with-favicon');
    fs.mkdirSync(projectPath);
    fs.writeFileSync(path.join(projectPath, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>');
    const requestJson = (route, method, body) => fetch(`http://localhost:${port}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const project = { id: 'project-with-favicon', path: projectPath, addedAt: Date.now(), lastOpenedAt: Date.now() };
    const saved = await requestJson('/api/config/settings', 'PUT', { projects: [project], activeProjectId: project.id });
    assert.equal(saved.status, 200, 'Project settings save');
    const { activeProjectId, projects } = await saved.json();
    assert.ok(activeProjectId, 'Saved project has an active ID');
    const discovered = await requestJson(`/api/projects/${encodeURIComponent(activeProjectId)}/icon/discover`, 'POST', { force: false });
    assert.equal(discovered.status, 200, 'Favicon discovery');
    const { settings } = await discovered.json();
    const savedIcon = settings.projects.find(({ id }) => id === activeProjectId)?.iconImage;
    assert.equal(savedIcon?.source, 'auto');
    assert.equal(savedIcon?.mime, 'image/svg+xml');
    console.log(`${label} project add and favicon discovery: 200; icon source=auto`);
    const stale = { ...projects.find(({ id }) => id === activeProjectId), lastOpenedAt: project.lastOpenedAt + 1 };
    const rewritten = await requestJson('/api/config/settings', 'PUT', { projects: [stale], activeProjectId });
    assert.equal(rewritten.status, 200, 'Queued project activation settings save');
    const persisted = JSON.parse(fs.readFileSync(path.join(env.OPENCHAMBER_DATA_DIR, 'settings.json'), 'utf8'));
    const persistedProject = persisted.projects.find(({ id }) => id === activeProjectId);
    assert.equal(persistedProject.lastOpenedAt, stale.lastOpenedAt);
    assert.deepEqual(persistedProject.iconImage, savedIcon);
    console.log(`${label} discovered favicon survived the queued project settings write`);
  }
} finally {
  child.kill('SIGTERM');
  const abort = new AbortController();
  const stopped = await Promise.race([exited, delay(35_000, false, { signal: abort.signal })]);
  abort.abort();
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, stopped ? 'SIGTERM' : 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  } else if (!stopped) child.kill('SIGKILL');
  await exited;
  fs.closeSync(log);
  fs.rmSync(root, { recursive: true, force: true });
  console.log('Server stopped; isolated data removed.');
}
