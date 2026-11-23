#!/usr/bin/env node
/**
 * a1-audit-server-wiring.mjs
 *
 * Read-only audit of server route registrations, runtime/store construction,
 * dependency-object keys passed to register* calls, and exported-but-unused
 * register* / create*Runtime functions in packages/web/server.
 *
 * Compares HEAD against an upstream git ref (default: bc50ba56a) and optionally
 * pre-merge fork ref (default: 02d166300) without touching the working tree.
 *
 * Usage:
 *   node scripts/a1-audit-server-wiring.mjs [--upstream-ref bc50ba56a] [--premerge-ref 02d166300] [--json]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { stripModuleSyntax, usesName } from './source.mjs';

const args = process.argv.slice(2);
function getFlag(name, fallback) {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  return fallback;
}
const UPSTREAM_REF = getFlag('--upstream-ref', 'bc50ba56a');
const PREMERGE_REF = getFlag('--premerge-ref', '02d166300');
const JSON_OUT = args.includes('--json');

const REPO_ROOT = process.cwd();

function gitShow(ref, filePath) {
  try {
    return execFileSync('git', ['show', `${ref}:${filePath}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

function readWorktree(filePath) {
  const full = path.join(REPO_ROOT, filePath);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}

function scanBalanced(src, openIdx, openCh, closeCh) {
  let depth = 0;
  let i = openIdx;
  let inStr = null;
  let inLineComment = false;
  let inBlockComment = false;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inStr) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (inStr === '`' && ch === '$' && next === '{') {
        const end = scanBalanced(src, i + 1, '{', '}');
        i = end === -1 ? i + 2 : end + 1;
        continue;
      }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      inStr = ch;
      i++;
      continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function splitTopLevelArgs(argStr) {
  const parts = [];
  let start = 0;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let inStr = null;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < argStr.length; i++) {
    const ch = argStr[i];
    const next = argStr[i + 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '(') depthParen++;
    else if (ch === ')') depthParen--;
    else if (ch === '{') depthBrace++;
    else if (ch === '}') depthBrace--;
    else if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket--;
    else if (ch === ',' && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      parts.push(argStr.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = argStr.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function stripLeadingComments(s) {
  let out = s.trimStart();
  while (true) {
    if (out.startsWith('//')) {
      const nl = out.indexOf('\n');
      out = nl === -1 ? '' : out.slice(nl + 1).trimStart();
      continue;
    }
    if (out.startsWith('/*')) {
      const end = out.indexOf('*/');
      out = end === -1 ? '' : out.slice(end + 2).trimStart();
      continue;
    }
    break;
  }
  return out;
}

function extractObjectKeys(objExpr) {
  const trimmed = stripLeadingComments(objExpr.trim());
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  const inner = trimmed.slice(1, -1);
  const props = splitTopLevelArgs(inner);
  const keys = [];
  for (const rawP of props) {
    const p = stripLeadingComments(rawP);
    if (!p) continue;
    if (p.startsWith('...')) continue;
    const m = /^([A-Za-z_$][\w$]*)\s*(?::|\(|$|,)/.exec(p);
    if (m) keys.push(m[1]);
    else {
      const qm = /^(['"])([^'"]+)\1\s*:/.exec(p);
      if (qm) keys.push(qm[2]);
    }
  }
  return keys;
}

function lineOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx; i++) if (src[i] === '\n') line++;
  return line;
}

function extractCalls(src, fileLabel) {
  if (!src) return [];
  const results = [];
  const re = /(?:^|[^.\w$])((?:[A-Za-z_$][\w$]*\.)?(?:register[A-Z]\w*|create[A-Z]\w*))\s*(?:<[^\n()]*>)?\s*(?:\?\.)?\s*\(/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const fnName = m[1];
    const callIdx = m.index + m[0].indexOf(fnName);
    const openParen = m.index + m[0].length - 1;
    const lineStart = src.lastIndexOf('\n', callIdx) + 1;
    const prefix = src.slice(lineStart, callIdx).trim();
    if (/^(export\s+)?(async\s+)?function\b/.test(prefix)) continue;
    if (/^(import|export)\b/.test(prefix)) continue;
    if (prefix.startsWith('//') || prefix.startsWith('*')) continue;
    const closeParen = scanBalanced(src, openParen, '(', ')');
    if (closeParen === -1) continue;
    const rawArgs = src.slice(openParen + 1, closeParen);
    const argsList = splitTopLevelArgs(rawArgs);
    if (fnName.startsWith('register') && (
      /^(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(argsList[0] ?? '')
      || new RegExp(`\\bfunction\\s+${fnName}\\s*\\(\\s*\\w+\\s*:\\s*(?:Readonly)?(?:Map|Set)\\s*<`).test(src)
    )) continue;
    const objKeys = [];
    for (let i = 0; i < argsList.length; i++) {
      const k = extractObjectKeys(argsList[i]);
      if (k) objKeys.push({ argIndex: i, keys: k });
    }
    results.push({
      file: fileLabel,
      line: lineOf(src, callIdx),
      name: fnName,
      shortName: fnName.includes('.') ? fnName.split('.').pop() : fnName,
      argsCount: argsList.length,
      argsList,
      objKeys,
    });
  }
  return results;
}

const callsBySide = { upstream: [], fork: [], premerge: [] };
const productionSource = (file) => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file)
  && !/(?:^|\/)(?:node_modules|fixtures|__tests__|test-support|dist|build)\//.test(file)
  && !/\.(?:test|spec|fixture|test-support|d)\.[^.]+$/.test(file);
for (const [side, ref] of [['upstream', UPSTREAM_REF], ['premerge', PREMERGE_REF]]) {
  let files;
  try {
    files = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', 'packages/web/server', 'packages/web/bin'], {
      cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    }).split('\n').filter(productionSource);
  } catch (error) {
    if (side !== 'premerge') throw error;
    files = [];
  }
  for (const file of files) callsBySide[side].push(...extractCalls(gitShow(ref, file), file));
}
for (const dir of ['packages/web/server', 'packages/web/bin']) {
  for (const file of walkJsFiles(path.join(REPO_ROOT, dir))) {
    const rel = path.relative(REPO_ROOT, file);
    callsBySide.fork.push(...extractCalls(readWorktree(rel), rel));
  }
}

const isRegisterCall = (c) => /^register|Routes$|^register[A-Z]/.test(c.shortName) || c.name.endsWith('.registerRoutes') || c.name.endsWith('.register') || c.name.endsWith('.registerApiRoute');

function indexByName(list) {
  const map = new Map();
  for (const item of list) {
    const key = item.name;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

const upReg = indexByName(callsBySide.upstream.filter(isRegisterCall));
const fkReg = indexByName(callsBySide.fork.filter(isRegisterCall));
const pmReg = indexByName(callsBySide.premerge.filter(isRegisterCall));

const upCreate = indexByName(callsBySide.upstream.filter((c) => !isRegisterCall(c)));
const fkCreate = indexByName(callsBySide.fork.filter((c) => !isRegisterCall(c)));
const pmCreate = indexByName(callsBySide.premerge.filter((c) => !isRegisterCall(c)));

function walkJsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'fixtures', '__tests__', 'test-support', 'dist', 'build', 'agent-runtime', 'agent-runtime.staging'].includes(entry.name)) continue;
      out.push(...walkJsFiles(full));
    } else if (entry.isFile() && productionSource(full)) {
      out.push(full);
    }
  }
  return out;
}

const serverFiles = walkJsFiles(path.join(REPO_ROOT, 'packages/web/server'));
const allProductionFiles = [
  ...serverFiles,
  ...walkJsFiles(path.join(REPO_ROOT, 'packages/web/bin')),
  ...walkJsFiles(path.join(REPO_ROOT, 'packages/electron')),
];

const fileContents = new Map();
for (const f of allProductionFiles) {
  fileContents.set(path.relative(REPO_ROOT, f), fs.readFileSync(f, 'utf8'));
}

// Every create*/register* call the fork makes anywhere in production server code.
// A constructor counts as present when some production file calls it.
const forkAllCallNames = new Set();
for (const [rel, src] of fileContents.entries()) {
  for (const c of extractCalls(src, rel)) {
    forkAllCallNames.add(c.name);
    forkAllCallNames.add(c.shortName);
  }
}

const exportedFns = [];
for (const f of serverFiles) {
  const rel = path.relative(REPO_ROOT, f);
  const src = fileContents.get(rel);
  const exportPatterns = [
    /export\s+(?:async\s+)?(?:const|let|var|function)\s+((?:register|create)[A-Z]\w*)/g,
    /export\s*\{([^}]+)\}/g,
  ];
  for (const re of exportPatterns) {
    let m;
    while ((m = re.exec(src)) !== null) {
      if (re.source.includes('\\{')) {
        const items = m[1].split(',').map((s) => s.trim()).filter(Boolean);
        for (const item of items) {
          const asMatch = /(\w+)\s+as\s+(\w+)/.exec(item);
          const name = asMatch ? asMatch[2] : item;
          if (/^(register|create)[A-Z]/.test(name)) {
            exportedFns.push({ file: rel, line: lineOf(src, m.index), name });
          }
        }
      } else {
        exportedFns.push({ file: rel, line: lineOf(src, m.index), name: m[1] });
      }
    }
  }
}

const unusedExports = [];
const strippedByFile = new Map([...fileContents].map(([rel, src]) => [rel, stripModuleSyntax(src)]));
for (const exp of exportedFns) {
  // A use is any reference outside import and re-export statements: a call, or a value
  // such as a default parameter or a dependency object entry. An import alone is not use.
  const callers = [...strippedByFile.entries()].filter(([otherFile, src]) => {
    const references = otherFile === exp.file
      ? src.replace(new RegExp(`\\b(?:function\\s+|(?:const|let|var)\\s+)${exp.name}\\b`, 'g'), '')
      : src;
    return usesName(references, exp.name);
  });
  if (callers.length === 0) {
    unusedExports.push(exp);
  }
}

const report = {
  upstreamRef: UPSTREAM_REF,
  premergeRef: PREMERGE_REF,
  registerCalls: {
    onlyUpstream: [...upReg.keys()].filter((k) => !fkReg.has(k)).map((k) => ({
      name: k,
      upstream: upReg.get(k).map((x) => `${x.file}:${x.line}`),
      inPremerge: pmReg.has(k),
    })),
    onlyFork: [...fkReg.keys()].filter((k) => !upReg.has(k)).map((k) => ({
      name: k,
      fork: fkReg.get(k).map((x) => `${x.file}:${x.line}`),
    })),
    depDiffs: [],
  },
  createCalls: {
    onlyUpstream: [...upCreate.keys()].filter((k) => !forkAllCallNames.has(k)).map((k) => ({
      name: k,
      upstream: upCreate.get(k).map((x) => `${x.file}:${x.line}`),
      inPremerge: pmCreate.has(k),
    })),
    onlyFork: [...fkCreate.keys()].filter((k) => !upCreate.has(k)).map((k) => ({
      name: k,
      fork: fkCreate.get(k).map((x) => `${x.file}:${x.line}`),
    })),
    depDiffs: [],
  },
  unusedExports,
};

function dependencyDiffs(upstream, fork) {
  const diffs = [];
  const owner = (call) => call.file.replace(/\.ts$/, '.js');
  for (const [name, upstreamCalls] of upstream) {
    const forkCalls = fork.get(name) ?? [];
    for (const file of new Set(upstreamCalls.map(owner))) {
      const uList = upstreamCalls.filter((call) => owner(call) === file);
      const fList = forkCalls.filter((call) => owner(call) === file);
      if (fList.length === 0) continue;
      const uKeys = new Set(uList.flatMap((call) => call.objKeys.flatMap((object) => object.keys)));
      const fKeys = new Set(fList.flatMap((call) => call.objKeys.flatMap((object) => object.keys)));
      const missingInFork = [...uKeys].filter((key) => !fKeys.has(key));
      const unresolvedKeys = missingInFork.filter((key) => {
        const indices = new Set(uList.flatMap((call) => call.objKeys
          .filter((object) => object.keys.includes(key)).map((object) => object.argIndex)));
        return fList.some((call) => [...indices].some((index) => call.argsList[index]
          && extractObjectKeys(call.argsList[index]) === null));
      });
      const extraInFork = [...fKeys].filter((key) => !uKeys.has(key));
      if (missingInFork.length || extraInFork.length) {
        diffs.push({ name, upstream: uList.map((call) => `${call.file}:${call.line}`), fork: fList.map((call) => `${call.file}:${call.line}`), missingInFork: missingInFork.filter((key) => !unresolvedKeys.includes(key)), unresolvedKeys, extraInFork });
      }
    }
  }
  return diffs;
}

report.registerCalls.depDiffs = dependencyDiffs(upReg, fkReg);
report.createCalls.depDiffs = dependencyDiffs(upCreate, fkCreate);

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('=== REGISTER CALLS ONLY IN UPSTREAM ===');
  for (const r of report.registerCalls.onlyUpstream) {
    console.log(`- ${r.name} | upstream: ${r.upstream.join(', ')} | inPremerge(${PREMERGE_REF}): ${r.inPremerge}`);
  }
  console.log('\n=== REGISTER CALLS ONLY IN FORK ===');
  for (const r of report.registerCalls.onlyFork) {
    console.log(`- ${r.name} | fork: ${r.fork.join(', ')}`);
  }
  console.log('\n=== REGISTER CALL DEPENDENCY KEY DIFFS ===');
  for (const d of report.registerCalls.depDiffs) {
    console.log(`- ${d.name} (up: ${d.upstream.join(', ')} | fk: ${d.fork.join(', ')})`);
    if (d.missingInFork.length) console.log(`    missingInFork: ${d.missingInFork.join(', ')}`);
    if (d.extraInFork.length) console.log(`    extraInFork:   ${d.extraInFork.join(', ')}`);
  }
  console.log('\n=== CREATE* CALLS ONLY IN UPSTREAM ===');
  for (const r of report.createCalls.onlyUpstream) {
    console.log(`- ${r.name} | upstream: ${r.upstream.join(', ')} | inPremerge(${PREMERGE_REF}): ${r.inPremerge}`);
  }
  console.log('\n=== CREATE* CALL DEPENDENCY KEY DIFFS ===');
  for (const d of report.createCalls.depDiffs) {
    console.log(`- ${d.name} (up: ${d.upstream.join(', ')} | fk: ${d.fork.join(', ')})`);
    if (d.missingInFork.length) console.log(`    missingInFork: ${d.missingInFork.join(', ')}`);
    if (d.extraInFork.length) console.log(`    extraInFork:   ${d.extraInFork.join(', ')}`);
  }
  console.log('\n=== EXPORTED register*/create* IN SERVER LIBS WITH ZERO CALLERS OUTSIDE FILE ===');
  for (const u of report.unusedExports) {
    console.log(`- ${u.name} (${u.file}:${u.line})`);
  }
}
