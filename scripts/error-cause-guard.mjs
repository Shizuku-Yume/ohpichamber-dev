#!/usr/bin/env node
// Guardrail for the two error-cause classes R6 fixed.
//
// 1. A UI failure is shown with the cause the failure carried, not only a
//    translated sentence. A `catch` that never reads its error and then shows
//    `toast.error(t(…))` / `set…Error(t(…))` throws the cause away. The sites
//    that predate this guardrail are the baseline in
//    `scripts/error-cause-baseline.json`; the count may shrink, never grow.
//
// 2. A Host policy refusal names the check that refused it. `denied(` in
//    `worker-operation-authorizer.ts` requires a reason argument; a refusal
//    without one is the defect this guardrail exists to stop.
//
// Usage:
//   node scripts/error-cause-guard.mjs            fail on a new violation
//   node scripts/error-cause-guard.mjs --update   rewrite the baseline

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI_ROOT = path.join(REPO_ROOT, 'packages/ui/src');
const BASELINE = path.join(REPO_ROOT, 'scripts/error-cause-baseline.json');
const AUTHORIZER = path.join(REPO_ROOT, 'packages/web/server/lib/host/worker-operation-authorizer.ts');

// A failure shown as a translated sentence. `problemMessage(error, t(…))` is the
// accepted form: the cause wins and the translation is the fallback.
const TRANSLATION_ONLY_DISPLAY = /\b(?:toast\.(?:error|warning)|set[A-Z]\w*(?:Error|Failure|Message)|autosaveFailed|setImportError)\s*\(\s*t\(/;
// Reading the error only to log it is not showing it: the person still sees the
// translated sentence. These calls consume the binding without displaying it.
const LOG_ONLY_USE = /\b(?:console\.(?:log|warn|error|debug|info)|reportError|Sentry\.\w+|logger\.\w+)\s*\([^;]*?\)/g;

const sourceFiles = (root) => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(full);
    }
  };
  walk(root);
  return files.sort();
};

/** Every `catch` clause whose binding is unused and whose body shows a translation,
 * reported relative to `root`. */
export const findTranslationOnlyCatches = (root, reportRoot = REPO_ROOT) => {
  const findings = [];
  for (const file of sourceFiles(root)) {
    const src = fs.readFileSync(file, 'utf8');
    for (let i = 0; i < src.length; i += 1) {
      if (!src.startsWith('catch', i) || (i > 0 && /[\w$.]/.test(src[i - 1]))) continue;
      let j = i + 'catch'.length;
      while (src[j] === ' ') j += 1;
      let binding = null;
      if (src[j] === '(') {
        const close = src.indexOf(')', j);
        binding = src.slice(j + 1, close).trim();
        j = close + 1;
      }
      while (src[j] === ' ') j += 1;
      if (src[j] !== '{') continue;
      let depth = 0;
      let end = j;
      for (; end < src.length; end += 1) {
        if (src[end] === '{') depth += 1;
        else if (src[end] === '}') { depth -= 1; if (depth === 0) break; }
      }
      const body = src.slice(j, end + 1);
      if (!TRANSLATION_ONLY_DISPLAY.test(body)) continue;
      // Reading the error only to log it does not show it: the person still gets
      // the translated sentence. Remove logging calls, then any remaining
      // reference to the binding means the cause itself is displayed.
      const name = binding === null || binding === '' ? null : binding.replace(/[^\w$]/g, '');
      const withoutLogging = body.slice(1).replace(LOG_ONLY_USE, 'log(');
      const displaysCause = name !== null
        && new RegExp(`(^|[^\\w$.])${name}([^\\w$]|$)`).test(withoutLogging);
      if (displaysCause) continue;
      findings.push(`${path.relative(reportRoot, file).replaceAll(path.sep, '/')}:${src.slice(0, i).split('\n').length}`);
    }
  }
  return findings;
};

/** Every `denied(` call that does not pass a reason, reported relative to `root`. */
export const findReasonlessDenials = (file, root = REPO_ROOT) => {
  if (!fs.existsSync(file)) return [];
  const src = fs.readFileSync(file, 'utf8');
  const findings = [];
  for (const match of src.matchAll(/(?<![\w$.])denied\(/g)) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let end = open;
    for (; end < src.length; end += 1) {
      if (src[end] === '(') depth += 1;
      else if (src[end] === ')') { depth -= 1; if (depth === 0) break; }
    }
    const args = src.slice(open + 1, end).trim();
    if (args === '') findings.push(`${path.relative(root, file).replaceAll(path.sep, '/')}:${src.slice(0, match.index).split('\n').length}`);
  }
  return findings;
};

const readBaseline = () => {
  try { return JSON.parse(fs.readFileSync(BASELINE, 'utf8')); }
  catch { return { translationOnlyCatches: [] }; }
};

const main = () => {
  const update = process.argv.includes('--update');
  const current = findTranslationOnlyCatches(UI_ROOT);
  if (update) {
    fs.writeFileSync(BASELINE, `${JSON.stringify({ translationOnlyCatches: current }, null, 2)}\n`);
    console.log(`[error-cause] baseline now holds ${current.length} site(s)`);
    return;
  }
  const baseline = new Set(readBaseline().translationOnlyCatches);
  const added = current.filter((site) => !baseline.has(site));
  const reasonless = findReasonlessDenials(AUTHORIZER);
  const failed = added.length > 0 || reasonless.length > 0;
  if (added.length > 0) {
    console.error(`[error-cause] ${added.length} new translation-only error display(s); read the caught error with problemMessage(error, t(…)):`);
    for (const site of added) console.error(`  ${site}`);
  }
  if (reasonless.length > 0) {
    console.error(`[error-cause] ${reasonless.length} denied() call(s) without a reason; a refusal must name the check that refused:`);
    for (const site of reasonless) console.error(`  ${site}`);
  }
  if (failed) process.exit(1);
  console.log(`[error-cause] ${current.length} baseline site(s) unchanged, every denial names its reason`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
