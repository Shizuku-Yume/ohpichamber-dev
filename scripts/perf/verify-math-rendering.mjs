/**
 * Verifies lazy KaTeX typesetting in the real built app against a running
 * isolated server:
 *   1. startup of a no-math session fetches no katex chunk;
 *   2. opening the seeded math session renders `.katex` elements for inline,
 *      display (\[...\]) and fenced (```math) math;
 *   3. a screenshot of the rendered math is saved for visual review.
 *
 * Usage: node scripts/perf/verify-math-rendering.mjs --url http://127.0.0.1:5471 \
 *          --session <sessionId> --shot <path.png>
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CdpClient, createPageTarget, launchChrome, reservePort, resolveChrome, wait } from './cdp.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx === -1 ? fallback : args[idx + 1];
}
const URL = argValue('--url', 'http://127.0.0.1:5471');
const SESSION = argValue('--session', 'c329c27d-e6e1-4cb1-bac8-136abd793065');
const SHOT = argValue('--shot', '/tmp/math-render.png');

const chrome = resolveChrome(null);
const port = await reservePort();
const profile = mkdtempSync(path.join(tmpdir(), 'math-verify-'));
const child = launchChrome({ chrome, profileDir: profile, port, headless: true });

const failures = [];
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

try {
  const target = await createPageTarget(port);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');
  const requests = [];
  client.on('Network.requestWillBeSent', (e) => { requests.push(e.request.url); });

  const evaluate = async (expression) => {
    const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluation failed');
    return result.result?.value;
  };

  // 1. cold load of the app — session list, no math anywhere visible
  await client.send('Page.navigate', { url: URL });
  const deadline = Date.now() + 20_000;
  for (; ;) {
    const ready = await evaluate(`document.querySelectorAll('[data-session-row]').length > 0 || Boolean(document.querySelector('[data-chat-input="true"]'))`).catch(() => false);
    if (ready) break;
    if (Date.now() > deadline) { check('app boots with session rows', false); throw new Error('boot timeout'); }
    await wait(100);
  }
  await wait(4000);
  const katexAtBoot = requests.filter((u) => u.includes('katex')).length;
  check('no katex chunk fetched at startup', katexAtBoot === 0, `${katexAtBoot} requests`);

  // 2. navigate straight into the seeded math session
  const clicked = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-session-row]')];
    const row = rows.find((r) => r.textContent.includes('perf: math check'));
    if (!row) return 'row-not-found:' + rows.length;
    row.click();
    return 'clicked';
  })()`);
  console.log('session row click:', clicked);
  await wait(2500);
  const mathDeadline = Date.now() + 20_000;
  let mathCount = 0;
  for (; ;) {
    mathCount = await evaluate(`document.querySelectorAll('.katex').length`).catch(() => 0);
    if (mathCount >= 3) break;
    if (Date.now() > mathDeadline) break;
    await wait(150);
  }
  check('inline + display + fence math all typeset (.katex >= 3)', mathCount >= 3, `${mathCount} elements`);

  const displayCount = await evaluate(`document.querySelectorAll('.katex-display').length`).catch(() => 0);
  check('display math present (.katex-display >= 1)', displayCount >= 1, `${displayCount} blocks`);

  const katexAfterOpen = requests.filter((u) => u.includes('katex')).length;
  check('katex chunk fetched lazily when math rendered', katexAfterOpen >= 1, `${katexAfterOpen} requests`);

  const errorCount = await evaluate(`document.querySelectorAll('.katex-error').length`).catch(() => -1);
  check('no katex-error fallbacks', errorCount === 0, `${errorCount}`);

  // html correctness: inline math must be inline (inside a text paragraph)
  const inlineOk = await evaluate(`(() => {
    const els = [...document.querySelectorAll('.katex')];
    return els.some((el) => !el.closest('.katex-display') && el.closest('p,li,td,div'));
  })()`).catch(() => false);
  check('inline math renders inline in prose', inlineOk === true);

  mkdirSync(path.dirname(SHOT), { recursive: true });
  const shot = await client.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  console.log('screenshot:', SHOT);

  try { client.socket.close(); } catch { }
} finally {
  try { child.kill('SIGKILL'); } catch { }
  rmSync(profile, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`FAILURES: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('math verification passed');
process.exit(0);
