#!/usr/bin/env node
/**
 * a1-audit-ui-api.mjs
 *
 * Read-only audit that extracts:
 *   1. All HTTP/WS /api/* routes actually mounted by the fork's Express server
 *      (tracing from server/index.js + canonical /api/agent/v1 routes + mounted sub-routers,
 *       excluding uncalled route modules such as notifications/channel-routes.js).
 *   2. All /api/* string and template-literal URLs called in packages/ui/src,
 *      packages/electron (excluding resources/ and dist-bundle/ build artifacts),
 *      and packages/mobile/src (if present).
 *   3. Every UI /api/* call with no matching mounted server route.
 *
 * Usage:
 *   node scripts/a1-audit-ui-api.mjs [--upstream-ref bc50ba56a] [--include-web-src] [--json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { stripModuleSyntax, usesName } from './source.mjs';

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const INCLUDE_WEB_SRC = args.includes('--include-web-src');
const REPO_ROOT = process.cwd();

function walkFiles(dir, exts, skipTests = true) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'dist-bundle', 'build', 'resources', 'web-dist', '.git', '__tests__', 'fixtures', 'test-support'].includes(entry.name)) continue;
      out.push(...walkFiles(full, exts, skipTests));
    } else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
      if (skipTests && (/\.(test|spec|vitest)\./.test(entry.name) || /\.fixture\./.test(entry.name))) continue;
      out.push(full);
    }
  }
  return out;
}

function lineOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx; i++) if (src[i] === '\n') line++;
  return line;
}

function isNotFoundFallback(src, callIdx) {
  const window = src.slice(callIdx, callIdx + 400);
  return /^[^\n]*?\(\s*['"`][^'"`]+['"`]\s*,\s*\(?[^)]*\)?\s*=>\s*\{\s*res\.status\(404\)/.test(window);
}

// Only an explicit `method: '...'` in the call's options constrains the route method.
function inferMethod(src, litStart) {
  const window = src.slice(litStart, litStart + 300);
  const m = /\bmethod\s*:\s*['"`]([A-Za-z]+)['"`]/.exec(window);
  return m ? m[1].toUpperCase() : null;
}

function methodMatches(route, method) {
  if (method === null) return true;
  if (route.method === 'USE' || route.method === 'ANY' || route.method === 'ALL') return true;
  if (route.method === 'WS') return method === 'WS';
  return route.method === method;
}

function resolveLocalImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const stem = base.replace(/\.[cm]?js$/, '');
  const candidates = [base, ...['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'].flatMap((ext) => [`${base}${ext}`, `${stem}${ext}`]), path.join(base, 'index.js'), path.join(base, 'index.ts')];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function collectReachableServerFiles(entryFile) {
  const visited = new Set();
  const queue = [path.resolve(REPO_ROOT, entryFile)];
  const importRe = /(?:import\s+(?:[\s\S]*?\s+from\s+)?|import\s*\(\s*)['"]([^'"]+)['"]/g;
  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    const src = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = importRe.exec(src)) !== null) {
      const target = resolveLocalImport(file, m[1]);
      if (target && !visited.has(target)) queue.push(target);
    }
  }
  return [...visited];
}

const activeServerFiles = collectReachableServerFiles('packages/web/server/index.js');
const strippedActiveSrc = new Map(activeServerFiles.map((f) => [f, stripModuleSyntax(fs.readFileSync(f, 'utf8'))]));

// A module that exports routes, factories or register functions mounts its routes only
// when another active file uses one of its exports outside import statements. An
// import alone does not mount anything (for example an imported but never-registered route module).
function isMountedFile(file) {
  if (file === path.resolve(REPO_ROOT, 'packages/web/server/index.js')) return true;
  const src = fs.readFileSync(file, 'utf8');
  const exported = [...src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  if (exported.length === 0) return true;
  return exported.some((name) => activeServerFiles.some((other) => other !== file && usesName(strippedActiveSrc.get(other), name)));
}

const serverRoutes = [];
function addRoute(method, patternStr, sourceFile, line, kind = 'express') {
  const clean = patternStr.split('?')[0];
  serverRoutes.push({
    method: method.toUpperCase(),
    raw: patternStr,
    normalized: clean,
    source: `${path.relative(REPO_ROOT, sourceFile)}:${line}`,
    kind,
  });
}

const FILE_PREFIX_MAP = new Map([
  ['packages/web/server/lib/host/canonical-routes.js', '/api/agent/v1'],
  ['packages/web/server/lib/host/file-resource-agent-routes.js', '/api/agent/v1'],
  ['packages/web/server/lib/host/attachment-routes.js', '/api/agent/v1/attachments'],
  ['packages/web/server/lib/host/skill-file-routes.js', '/api/agent/v1'],
  ['packages/web/server/lib/host/skill-catalog-routes.js', '/api/agent/v1'],
]);

for (const file of activeServerFiles.filter(isMountedFile)) {
  const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
  const src = fs.readFileSync(file, 'utf8');
  const filePrefix = FILE_PREFIX_MAP.get(rel) ?? '';

  // Collect simple `const VAR = '/api/...'` bindings in this file
  const constRoutes = new Map();
  const constRe = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])(\/api\/[^'"]+)\2/g;
  let cm;
  while ((cm = constRe.exec(src)) !== null) {
    constRoutes.set(cm[1], cm[3]);
  }

  // 1. app.<method>('...', ...) or router.<method>('...', ...)
  const routeCallRe = /\b(app|router|expressApp|apiRouter)\.(get|post|put|patch|delete|all|options|head|use)\s*\(\s*(['"`])([^'"`]+)\3/g;
  let m;
  while ((m = routeCallRe.exec(src)) !== null) {
    const targetObj = m[1];
    const method = m[2];
    const rawPath = m[4];
    if (!rawPath.startsWith('/')) continue;
    let fullPath = rawPath;
    if (targetObj === 'router') {
      if (rel === 'packages/web/server/lib/openchamber-sessions/routes.js') {
        fullPath = `/api/agent/v1/sessions${rawPath === '/' ? '' : rawPath}`;
      } else if (rel === 'packages/web/server/lib/message-queue/runtime.js') {
        fullPath = `/api/agent/v1${rawPath}`;
      } else if (filePrefix && !rawPath.startsWith('/api/')) {
        fullPath = `${filePrefix}${rawPath === '/' ? '' : rawPath}`;
      }
    }
    if (method === 'use') {
      // An unconditional 404 responder mounted under a prefix answers every
      // unknown path; it is not endpoint coverage.
      if (fullPath.startsWith('/api/') && !isNotFoundFallback(src, m.index)) {
        addRoute('USE', `${fullPath}*`, file, lineOf(src, m.index), 'use');
      }
    } else {
      addRoute(method, fullPath, file, lineOf(src, m.index), 'route');
    }
  }

  // 1b. app.<method>(CONST_NAME, ...)
  const varRouteRe = /\b(app|router|expressApp|apiRouter)\.(get|post|put|patch|delete|all|options|head)\s*\(\s*([A-Za-z_$][\w$]*)\s*,/g;
  while ((m = varRouteRe.exec(src)) !== null) {
    const varPath = constRoutes.get(m[3]);
    if (varPath) addRoute(m[2], varPath, file, lineOf(src, m.index), 'var-route');
  }
  // 1c. app.<method>(/^\/api\/.../, ...)
  const literalRegexRouteRe = /\b(app|router|expressApp|apiRouter)\.(get|post|put|patch|delete|all|options|head)\s*\(\s*(\/)/g;
  while ((m = literalRegexRouteRe.exec(src)) !== null) {
    let idx = m.index + m[0].length;
    let inClass = false;
    let closed = false;
    while (idx < src.length) {
      const ch = src[idx];
      if (ch === '\\') {
        idx += 2;
        continue;
      }
      if (ch === '[' && !inClass) inClass = true;
      else if (ch === ']' && inClass) inClass = false;
      else if (ch === '/' && !inClass) {
        closed = true;
        break;
      }
      idx++;
    }
    if (closed) {
      const regexLit = src.slice(m.index + m[0].length - 1, idx + 1);
      if (regexLit.includes('api')) {
        let p = regexLit.slice(1, -1).replace(/^\^/, '').replace(/\$$/, '').replace(/\\\//g, '/');
        if (p.includes('(')) {
          p = p.slice(0, p.indexOf('(')) + '*';
        }
        addRoute(m[2], p, file, lineOf(src, m.index), 'regex-route');
      }
    }
  }
  // 2. AGENT_ROUTES / FILE_RESOURCE_AGENT_ROUTES: { method: 'GET', pattern: /^\/...$/ }
  const agentRouteRe = /\{\s*method:\s*(['"])(GET|POST|PUT|PATCH|DELETE)\1\s*,\s*pattern:\s*(\/[^\n]+\/)/g;
  while ((m = agentRouteRe.exec(src)) !== null) {
    const method = m[2];
    let regexLit = m[3];
    let ri = 1;
    let inCharClass = false;
    while (ri < regexLit.length) {
      if (regexLit[ri] === '\\') { ri += 2; continue; }
      if (regexLit[ri] === '[') inCharClass = true;
      else if (regexLit[ri] === ']') inCharClass = false;
      else if (regexLit[ri] === '/' && !inCharClass) break;
      ri++;
    }
    regexLit = regexLit.slice(0, ri + 1);

    let p = regexLit.slice(1, -1).replace(/^\^/, '').replace(/\$$/, '').replace(/\\\//g, '/');
    const variants = [];
    const optGroup = /\(\?:([^)]+)\)\?/.exec(p);
    if (optGroup) {
      variants.push(p.replace(optGroup[0], optGroup[1]));
      variants.push(p.replace(optGroup[0], ''));
    } else {
      variants.push(p);
    }
    for (let v of variants) {
      v = v.replace(/\(\?<[^>]+>\[\^\/\]\+\)/g, ':param').replace(/\[\^\/\]\+/g, ':param');
      addRoute(method, `/api/agent/v1${v}`, file, lineOf(src, m.index), 'canonical-proxy');
    }
  }

  // 3. Array of paths or tuple lists of `/api/...` routes inside files with app.<method>(routeVar, ...)
  const arrRe = /\b(app|router)\.(get|post|put|patch|delete|all)\s*\(\s*\[([^\]]+)\]/g;
  while ((m = arrRe.exec(src)) !== null) {
    const method = m[2];
    const items = [...m[3].matchAll(/(['"`])([^'"`]+)\1/g)].map((x) => x[2]);
    for (const item of items) {
      if (item.startsWith('/')) addRoute(method, item, file, lineOf(src, m.index), 'array-route');
    }
  }

  // 4. Regex path: app.<method>(/^\/api\/.../)
  const regRouteRe = /\b(app|router)\.(get|post|put|patch|delete|all|use)\s*\(\s*\/(\^?\\\/api\\\/[^\n]+)\//g;
  while ((m = regRouteRe.exec(src)) !== null) {
    const method = m[2];
    const rawReg = m[3];
    let ri = 0;
    let inCC = false;
    while (ri < rawReg.length) {
      if (rawReg[ri] === '\\') { ri += 2; continue; }
      if (rawReg[ri] === '[') inCC = true;
      else if (rawReg[ri] === ']') inCC = false;
      else if (rawReg[ri] === '/' && !inCC) break;
      ri++;
    }
    let p = rawReg.slice(0, ri).replace(/^\^/, '').replace(/\$$/, '').replace(/\\\//g, '/');
    p = p.replace(/\(\?:[^)]*\)\?/g, '').replace(/\[\^\/\]\+/g, ':param').replace(/\(\.\*\)/g, '*').replace(/\.\+/g, '*');
    addRoute(method === 'use' ? 'USE' : method, p, file, lineOf(src, m.index), 'regex-route');
  }

  // 5. Template literal route: app.get(`${PREFIX}/...`)
  const tmplRouteRe = /\b(app|router)\.(get|post|put|patch|delete|all|use)\s*\(\s*`([^`]+)`/g;
  while ((m = tmplRouteRe.exec(src)) !== null) {
    const method = m[2];
    const resolved = m[3].replace(/\$\{(\w+)\}/g, (_, varName) => constRoutes.get(varName) ?? ':param');
    if (resolved.startsWith('/')) {
      addRoute(method === 'use' ? 'USE' : method, resolved, file, lineOf(src, m.index), 'tmpl-route');
    }
  }

  // 6. WS upgrade paths
  const wsPathRe = /pathname\s*(?:===|\.startsWith\()\s*(['"`])(\/api\/[^'"`]+)\1/g;
  while ((m = wsPathRe.exec(src)) !== null) {
    addRoute('WS', m[2], file, lineOf(src, m.index), 'ws-upgrade');
  }
}

// Explicit dynamic/table-driven mounts verified in active server files:
addRoute('ANY', '/api/agent/v1/workspaces/:workspaceId/skills/files*', path.join(REPO_ROOT, 'packages/web/server/lib/host/skill-file-routes.js'), 12, 'regex-router');
addRoute('GET', '/api/agent/v1/workspaces/:workspaceId/skills/repositories', path.join(REPO_ROOT, 'packages/web/server/lib/host/skill-catalog-routes.js'), 17, 'regex-router');
addRoute('POST', '/api/agent/v1/workspaces/:workspaceId/skills/repositories/source', path.join(REPO_ROOT, 'packages/web/server/lib/host/skill-catalog-routes.js'), 20, 'regex-router');
addRoute('POST', '/api/agent/v1/workspaces/:workspaceId/skills/repositories/scan', path.join(REPO_ROOT, 'packages/web/server/lib/host/skill-catalog-routes.js'), 21, 'regex-router');
addRoute('POST', '/api/agent/v1/workspaces/:workspaceId/skills/repositories/install', path.join(REPO_ROOT, 'packages/web/server/lib/host/skill-catalog-routes.js'), 22, 'regex-router');
addRoute('POST', '/api/config/themes/catalog/search', path.join(REPO_ROOT, 'packages/web/server/lib/host/theme-catalog.js'), 177, 'table-route');
addRoute('POST', '/api/config/themes/catalog/package', path.join(REPO_ROOT, 'packages/web/server/lib/host/theme-catalog.js'), 178, 'table-route');
addRoute('WS', '/api/guests/:id/surface/ws', path.join(REPO_ROOT, 'packages/web/server/lib/guests/surface.js'), 1, 'ws-upgrade');

const scProvRoutesFile = path.join(REPO_ROOT, 'packages/web/server/lib/source-control/provider-routes.js');
if (fs.existsSync(scProvRoutesFile)) {
  const src = fs.readFileSync(scProvRoutesFile, 'utf8');
  const routeCallRe = /\b(app|router)\.(get|post|put|patch|delete|all|use)\s*\(\s*(['"`])([^'"`]+)\3/g;
  let m;
  while ((m = routeCallRe.exec(src)) !== null) {
    const rawPath = m[4];
    if (rawPath.startsWith('/api/')) addRoute(m[2], rawPath, scProvRoutesFile, lineOf(src, m.index), 'provider-route');
    else if (rawPath.startsWith('/')) addRoute(m[2], `/api/source-control/:provider${rawPath}`, scProvRoutesFile, lineOf(src, m.index), 'provider-route');
  }
}

const trackerRoutesFile = path.join(REPO_ROOT, 'packages/web/server/lib/trackers/routes.js');
if (fs.existsSync(trackerRoutesFile)) {
  const src = fs.readFileSync(trackerRoutesFile, 'utf8');
  const tmplRe = /\b(app|router)\.(get|post|put|patch|delete|all|use)\s*\(\s*`([^`]+)`/g;
  let m;
  while ((m = tmplRe.exec(src)) !== null) {
    const p = m[3].replace(/\$\{[^}]+\}/g, ':param');
    if (p.startsWith('/api/')) addRoute(m[2], p, trackerRoutesFile, lineOf(src, m.index), 'tracker-route');
  }
}

function compileRouteMatcher(routePath) {
  let clean = routePath.split('?')[0];
  // Express 5 wildcard `{*param}` -> trailing `*`
  clean = clean.replace(/\{\*[^}]+\}$/, '*');
  if (clean.endsWith('*')) {
    const prefix = clean.slice(0, -1);
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z_]\w*/g, '[^/]+');
    return new RegExp(`^${escaped}.*$`);
  }
  clean = clean.replace(/\/+$/, '') || '/';
  const parts = clean.split('/').filter(Boolean);
  const regexParts = parts.map((seg) => {
    if (seg.startsWith(':')) {
      if (seg.endsWith('?')) return '(?:/[^/]+)?';
      return '/[^/]+';
    }
    if (seg.includes(':param')) {
      return '/' + seg.replace(/:param/g, '[^/]+');
    }
    return '/' + seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return new RegExp(`^${regexParts.join('')}/?$`);
}

const compiledServerRoutes = serverRoutes
  .filter((r) => r.normalized.startsWith('/api/') || r.normalized === '/api' || r.normalized === '/health')
  .map((r) => ({ ...r, regex: compileRouteMatcher(r.normalized) }));

function extractStringAndTemplateLiterals(src) {
  const out = [];
  let i = 0;
  const len = src.length;
  while (i < len) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      const nl = src.indexOf('\n', i);
      i = nl === -1 ? len : nl + 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? len : end + 2;
      continue;
    }
    if (ch === '\'' || ch === '"') {
      const quote = ch;
      const start = i;
      i++;
      let val = '';
      while (i < len) {
        const c = src[i];
        if (c === '\\') { val += src.slice(i, i + 2); i += 2; continue; }
        if (c === quote) { i++; break; }
        if (c === '\n') break;
        val += c;
        i++;
      }
      out.push({ start, quote, value: val });
      continue;
    }
    if (ch === '`') {
      const parsed = readTemplate(src, i);
      out.push(...parsed.literals);
      i = parsed.end;
      continue;
    }
    i++;
  }
  return out;
}

function readTemplate(src, startIdx) {
  const literals = [];
  let i = startIdx + 1;
  const len = src.length;
  let val = '';
  while (i < len) {
    const ch = src[i];
    if (ch === '\\') { val += src.slice(i, i + 2); i += 2; continue; }
    if (ch === '`') { i++; break; }
    if (ch === '$' && src[i + 1] === '{') {
      val += '${EXPR}';
      i += 2;
      let depth = 1;
      while (i < len && depth > 0) {
        const ec = src[i];
        const en = src[i + 1];
        if (ec === '\\') { i += 2; continue; }
        if (ec === '/' && en === '/') {
          const nl = src.indexOf('\n', i);
          i = nl === -1 ? len : nl + 1;
          continue;
        }
        if (ec === '/' && en === '*') {
          const end = src.indexOf('*/', i + 2);
          i = end === -1 ? len : end + 2;
          continue;
        }
        if (ec === '\'' || ec === '"') {
          const q = ec;
          const sStart = i;
          i++;
          let sVal = '';
          while (i < len) {
            if (src[i] === '\\') { sVal += src.slice(i, i + 2); i += 2; continue; }
            if (src[i] === q || src[i] === '\n') { i++; break; }
            sVal += src[i];
            i++;
          }
          literals.push({ start: sStart, quote: q, value: sVal });
          continue;
        }
        if (ec === '`') {
          const nested = readTemplate(src, i);
          literals.push(...nested.literals);
          i = nested.end;
          continue;
        }
        if (ec === '{') depth++;
        else if (ec === '}') depth--;
        i++;
      }
      continue;
    }
    val += ch;
    i++;
  }
  literals.unshift({ start: startIdx, quote: '`', value: val });
  return { literals, end: i };
}

const uiRoots = [
  'packages/ui/src',
  'packages/electron',
  'packages/mobile/src',
];
if (INCLUDE_WEB_SRC) uiRoots.push('packages/web/src');

const callerFiles = uiRoots.flatMap((r) => walkFiles(path.join(REPO_ROOT, r), ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'], true));

const apiCalls = [];
for (const file of callerFiles) {
  const rel = path.relative(REPO_ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const lits = extractStringAndTemplateLiterals(src);
  for (const lit of lits) {
    if (!lit.value.includes('/api/')) continue;
    const line = lineOf(src, lit.start);
    const lineText = lines[line - 1]?.trim() ?? '';
    if (/^(import|export)\b/.test(lineText) && lineText.includes('from')) continue;
    if (lit.value.startsWith('@/lib/api/') || lit.value.startsWith('@openchamber/') || lit.value.startsWith('./') || lit.value.startsWith('../')) continue;
    if (/^https?:\/\//.test(lit.value) && !/^https?:\/\/(localhost|127\.0\.0\.1|\$\{)/.test(lit.value)) continue;

    const apiIdx = lit.value.indexOf('/api/');
    let apiSub = lit.value.slice(apiIdx);
    const endMatch = apiSub.search(/[\s"'`;|)>]/);
    if (endMatch !== -1) apiSub = apiSub.slice(0, endMatch);
    if (apiSub === '/api/' || apiSub === '/api') continue;
    const before = src.slice(Math.max(0, lit.start - 40), lit.start);
    if (/(?:\.startsWith|\.includes|\.endsWith|\.indexOf|\.replace|===|!==|==|!=)\s*\(\s*$/.test(before) || /(?:===|!==|==|!=)\s*$/.test(before)) {
      continue;
    }
    const qIdx = apiSub.indexOf('?');
    let norm = qIdx === -1 ? apiSub : apiSub.slice(0, qIdx);
    norm = norm.replace(/\$\{EXPR\}/g, ':param').replace(/\/+$/, '');
    norm = norm.replace(/:param$/, (m, offset, full) => (full[offset - 1] === '/' ? ':param' : ''));
    if (!norm || norm === '/api') continue;

    // A base prefix constant (`const API_BASE = '/api/git'`) is not a request: its callers
    // append the rest of the path in a template this audit does not follow.
    if (/^(export\s+)?const\s+[\w$]+\s*=\s*\[?\s*['"]\/api\/[^'"]*['"]/.test(lineText)) continue;
    apiCalls.push({
      file: rel,
      line,
      raw: apiSub,
      normalized: norm,
      lineText,
      method: inferMethod(src, lit.start),
    });
  }
}

const unmatched = [];
for (const call of apiCalls) {
  const probe = call.normalized.replace(/:param/g, 'PARAM_SEGMENT');
  const hits = compiledServerRoutes.filter((r) => methodMatches(r, call.method) && r.regex.test(probe));
  if (hits.length === 0) {
    unmatched.push(call);
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({
    activeServerFilesCount: activeServerFiles.length,
    mountedRoutesCount: compiledServerRoutes.length,
    callerFilesCount: callerFiles.length,
    totalApiCalls: apiCalls.length,
    unmatchedCount: unmatched.length,
    unmatched,
  }, null, 2));
} else {
  console.log(`Active server files traced from index.js: ${activeServerFiles.length}`);
  console.log(`Mounted /api routes extracted: ${compiledServerRoutes.length}`);
  console.log(`Caller files scanned: ${callerFiles.length}`);
  console.log(`Total /api/* calls extracted: ${apiCalls.length}`);
  console.log(`Unmatched /api/* calls: ${unmatched.length}\n`);
  console.log('=== UNMATCHED /api/* CALLS ===');
  for (const u of unmatched) {
    console.log(`- ${u.file}:${u.line} | ${u.normalized} | raw: ${JSON.stringify(u.raw)}`);
    console.log(`    ${u.lineText}`);
  }
}
