#!/usr/bin/env node
// `node --test scripts/upstream-gaps.test.mjs`, as the repository's isolated runner does.
// Each case builds a small git repository: the committed files are the upstream
// reference, the working tree is the fork, and the guardrail runs inside it
// exactly as `scripts/check.mjs` runs it in the real repository.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = [];

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const write = (root, file, content) => {
  const absolute = path.join(root, file);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
};

const INDEX = `import express from 'express';
import { registerTrackerRoutes } from './lib/trackers/routes.js';
import { createAutoReviewRuntime } from './lib/auto-review/runtime.js';

const app = express();
registerTrackerRoutes(app);
const autoReview = createAutoReviewRuntime({ enabled: true });
export { app, autoReview };
`;

const TRACKER_ROUTES = `export function registerTrackerRoutes(app) {
  app.get('/api/tracker/things', (_req, res) => {
    res.json({ things: [] });
  });
  app.use('/api/tracker', (_req, res) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  });
}
`;

const AUTO_REVIEW = `export function createAutoReviewRuntime(options) {
  return { enabled: options.enabled };
}
`;

const TRACKER_CLIENT = `export const loadThings = () => fetch('/api/tracker/things').then((r) => r.json());
`;

const UI_STORE = `export interface UIStore {
  terminalCloseOnExit: boolean;
  setTerminalCloseOnExit: (value: boolean) => void;
}

export const useUIStore = create<UIStore>()((set) => ({
  terminalCloseOnExit: true,
  setTerminalCloseOnExit: (value) => {
    set({ terminalCloseOnExit: value });
  },
}));
`;

const DECISIONS = '# Decisions\n\n## 2026-01-01 - Keep the tracker surface\n\nWhy.\n\n## 2026-11-10 - Merge upstream OpenChamber with a real git merge\n\nProcess.\n';
const ALLOWLIST_HEADER = 'class\titem\tcitation\teffect\n';

// Builds the fixture: `files` are committed as upstream and mirrored in the working tree.
function makeFixture(files, allowlistRows = []) {
  const root = mkdtempSync(path.join(tmpdir(), 'upstream-gaps-'));
  roots.push(root);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  cpSync(path.join(REPO_ROOT, 'scripts/upstream-gaps.mjs'), path.join(root, 'scripts/upstream-gaps.mjs'));
  cpSync(path.join(REPO_ROOT, 'scripts/lib/upstream-gaps'), path.join(root, 'scripts/lib/upstream-gaps'), { recursive: true });
  write(root, '.workflow/decisions.md', DECISIONS);
  write(root, 'scripts/upstream-gaps.allowlist.tsv', ALLOWLIST_HEADER + allowlistRows.join('\n') + (allowlistRows.length ? '\n' : ''));
  for (const [file, content] of Object.entries(files)) write(root, file, content);
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'upstream'], { cwd: root });
  const upstreamRef = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  return { root, upstreamRef, fork: (file, content) => write(root, file, content), remove: (file) => rmSync(path.join(root, file)) };
}

const baseFiles = () => ({
  'packages/web/server/index.js': INDEX,
  'packages/web/server/lib/trackers/routes.js': TRACKER_ROUTES,
  'packages/web/server/lib/auto-review/runtime.js': AUTO_REVIEW,
  'packages/ui/src/api/tracker.ts': TRACKER_CLIENT,
  'packages/ui/src/stores/useUIStore.ts': UI_STORE,
});

function runGuardrail(fixture) {
  const result = spawnSync('node', ['scripts/upstream-gaps.mjs', '--check', '--upstream-ref', fixture.upstreamRef], {
    cwd: fixture.root,
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test('an unchanged fork passes the guardrail', () => {
  const result = runGuardrail(makeFixture(baseFiles()));
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /PASSED/);
});

test('typed factory calls are counted and still expose missing named dependencies', () => {
  const files = baseFiles();
  files['packages/web/server/index.js'] = INDEX.replace('createAutoReviewRuntime({ enabled: true })', 'createAutoReviewRuntime<{ enabled: boolean }>({ enabled: true })');
  const fixture = makeFixture(files);
  assert.equal(runGuardrail(fixture).status, 0);
  fixture.fork('packages/web/server/index.js', files['packages/web/server/index.js'].replace('{ enabled: true }', '{}'));
  assert.match(runGuardrail(fixture).output, /\[route-deps\] createAutoReviewRuntime.enabled/);
});

test('spread variable names are not dependency names but explicit keys remain audited', () => {
  const files = baseFiles();
  files['packages/web/server/index.js'] = INDEX.replace('{ enabled: true }', '{ ...oldOptions, enabled: true }');
  const fixture = makeFixture(files);
  fixture.fork('packages/web/server/index.js', files['packages/web/server/index.js'].replace('...oldOptions', '...newOptions'));
  assert.equal(runGuardrail(fixture).status, 0);
  fixture.fork('packages/web/server/index.js', INDEX.replace('{ enabled: true }', '{ ...newOptions }'));
  assert.match(runGuardrail(fixture).output, /\[route-deps\] createAutoReviewRuntime.enabled/);
});

test('indirect dependency bags require owner review without claiming their keys are missing', () => {
  const fixture = makeFixture(baseFiles());
  fixture.fork('packages/web/server/index.js', `const options = { enabled: true };\n${INDEX.replace('{ enabled: true }', 'options')}`);
  const indirect = runGuardrail(fixture);
  assert.equal(indirect.status, 1);
  assert.match(indirect.output, /\[route-deps-indirect\] createAutoReviewRuntime/);
  assert.doesNotMatch(indirect.output, /\[route-deps\] createAutoReviewRuntime.enabled/);
  fixture.fork('scripts/upstream-gaps.allowlist.tsv', `${ALLOWLIST_HEADER}route-deps-indirect\tcreateAutoReviewRuntime\tOMP packages/web/server/lib/auto-review/runtime.js\tThe reviewed owner receives options through a variable.\n`);
  assert.equal(runGuardrail(fixture).status, 0);
  fixture.fork('packages/web/server/index.js', INDEX.replace('{ enabled: true }', '{}'));
  const empty = runGuardrail(fixture);
  assert.match(empty.output, /\[route-deps\] createAutoReviewRuntime.enabled/);
});

test('callback transactions and typed collection helpers are not HTTP route registrations', () => {
  const files = baseFiles();
  files['packages/web/server/lib/collection.ts'] = `function registerEntry(registry: Map<string, string>, entry: string) { registry.set(entry, entry); }\nregisterEntry(new Map(), 'a');\nregisterTransaction(async (projects) => projects[0]);\n`;
  const fixture = makeFixture(files);
  fixture.fork('packages/web/server/lib/collection.ts', '');
  assert.equal(runGuardrail(fixture).status, 0);
  fixture.fork('packages/web/server/index.js', INDEX.replace('registerTrackerRoutes(app);', ''));
  assert.match(runGuardrail(fixture).output, /\[route-registration\] registerTrackerRoutes/);
});

test('same-named factory dependencies are compared within their source owner', () => {
  const files = baseFiles();
  files['packages/web/server/lib/a.js'] = `createClient({ baseUrl: '/legacy' });\n`;
  files['packages/web/server/lib/b.js'] = `createClient({ token: 'opaque' });\n`;
  const fixture = makeFixture(files);
  fixture.fork('packages/web/server/lib/a.js', `createCanonicalClient({ origin: '/api/agent/v1' });\n`);
  assert.equal(runGuardrail(fixture).status, 0);
  fixture.fork('packages/web/server/lib/b.js', `createClient({});\n`);
  assert.match(runGuardrail(fixture).output, /\[route-deps\] createClient.token/);
});

test('a same-file route caller counts but an exported definition alone does not', () => {
  const files = baseFiles();
  files['packages/web/server/lib/trackers/routes.js'] += `\nexport function registerNestedRoutes(app) { app.get('/api/nested', () => {}); }\n`;
  files['packages/web/server/lib/trackers/routes.js'] = files['packages/web/server/lib/trackers/routes.js'].replace("  app.get('/api/tracker/things'", "  registerNestedRoutes(app);\n  app.get('/api/tracker/things'");
  const fixture = makeFixture(files);
  assert.equal(runGuardrail(fixture).status, 0);
  fixture.fork('packages/web/server/lib/trackers/routes.js', files['packages/web/server/lib/trackers/routes.js'].replace('  registerNestedRoutes(app);', ''));
  assert.match(runGuardrail(fixture).output, /\[unused-route-fn\] registerNestedRoutes/);
});

test('TypeScript route owners count through JavaScript import specifiers without counting imports as mounting', () => {
  const files = baseFiles();
  files['packages/web/server/index.js'] = `import './lib/server-frame/bootstrap.js';\n`;
  files['packages/web/server/lib/server-frame/bootstrap.ts'] = INDEX.replace("'./lib/", "'../").replace("'./lib/", "'../");
  files['packages/web/server/lib/trackers/routes.ts'] = files['packages/web/server/lib/trackers/routes.js'];
  delete files['packages/web/server/lib/trackers/routes.js'];
  const fixture = makeFixture(files);
  const covered = runGuardrail(fixture);
  assert.equal(covered.status, 0, covered.output);
  fixture.fork('packages/web/server/lib/server-frame/bootstrap.ts', files['packages/web/server/lib/server-frame/bootstrap.ts'].replace('registerTrackerRoutes(app);', ''));
  const missing = runGuardrail(fixture);
  assert.equal(missing.status, 1, missing.output);
  assert.match(missing.output, /\[ui-call-no-route\] \/api\/tracker\/things/);
  assert.match(missing.output, /\[unused-route-fn\] registerTrackerRoutes/);
});

test('the default comparison uses the committed upstream pin instead of a historical literal', () => {
  const fixture = makeFixture(baseFiles());
  fixture.fork('.workflow/upstream-baseline.json', JSON.stringify({ upstream: { revision: fixture.upstreamRef } }));
  const result = spawnSync('node', ['scripts/upstream-gaps.mjs', '--check'], { cwd: fixture.root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test('typed Express calls and converted canonical router owners retain route coverage', () => {
  const files = baseFiles();
  files['packages/web/server/index.js'] += `\nimport { registerQueueRoutes } from './lib/message-queue/runtime.js';\nregisterQueueRoutes(app);\n`;
  files['packages/web/server/lib/message-queue/runtime.ts'] = `export function registerQueueRoutes(router) {
    router.get<unknown, { id: string; name: string }>('/sessions/:id/queue', (_req, res) => res.json({}));
  }\n`;
  files['packages/ui/src/api/queue.ts'] = `export const load = () => fetch('/api/agent/v1/sessions/session/queue');\n`;
  const fixture = makeFixture(files);
  const covered = runGuardrail(fixture);
  assert.equal(covered.status, 0, covered.output);
  fixture.fork('packages/web/server/lib/message-queue/runtime.ts', 'export function registerQueueRoutes(router) {}\n');
  const missing = runGuardrail(fixture);
  assert.equal(missing.status, 1, missing.output);
  assert.match(missing.output, /\[ui-call-no-route\] \/api\/agent\/v1\/sessions\/session\/queue/);
});

test('request method inference stops at its own options instead of the next request', () => {
  const files = baseFiles();
  files['packages/ui/src/api/tracker.ts'] = `
    export const read = () => fetch('/api/tracker/things', { signal: undefined });
    export const remove = () => fetch('/api/tracker/removed', { method: 'DELETE' });
  `;
  files['packages/web/server/lib/trackers/routes.js'] += `export function registerRemovalRoutes(app) {
    app.delete('/api/tracker/removed', (_req, res) => res.json({}));
  }\n`;
  files['packages/web/server/index.js'] += `\nimport { registerRemovalRoutes } from './lib/trackers/routes.js';\nregisterRemovalRoutes(app);\n`;
  const fixture = makeFixture(files);
  const covered = runGuardrail(fixture);
  assert.equal(covered.status, 0, covered.output);
  fixture.fork('packages/web/server/lib/trackers/routes.js', files['packages/web/server/lib/trackers/routes.js'].replace("app.get('/api/tracker/things', (_req, res) => {\n    res.json({ things: [] });\n  });", ''));
  const missing = runGuardrail(fixture);
  assert.equal(missing.status, 1, missing.output);
  assert.match(missing.output, /\[ui-call-no-route\] \/api\/tracker\/things/);
});

test('a public Host constructor can be owned by Electron without an unused-export exemption', () => {
  const files = baseFiles();
  files['packages/web/server/lib/native-host.js'] = 'export const createNativeHost = () => ({});\n';
  files['packages/electron/main.mjs'] = `import { createNativeHost } from '../web/server/lib/native-host.js';\ncreateNativeHost();\n`;
  const fixture = makeFixture(files);
  const covered = runGuardrail(fixture);
  assert.equal(covered.status, 0, covered.output);
  fixture.fork('packages/electron/main.mjs', files['packages/electron/main.mjs'].replace('createNativeHost();', ''));
  const missing = runGuardrail(fixture);
  assert.equal(missing.status, 1, missing.output);
  assert.match(missing.output, /\[unused-route-fn\] createNativeHost/);
});

test('settings sanitizer coverage follows its TypeScript owner after relocation', () => {
  const files = baseFiles();
  files['packages/ui/src/lib/settings/registry.ts'] = `export const SETTINGS_REGISTRY = {
  terminalCloseOnExit: field({scope: 'profile', effect: ['ui'], ui: uiStore('terminalCloseOnExit')}),
};\n`;
  const registry = JSON.stringify({fields: {terminalCloseOnExit: {type: 'boolean'}}});
  const helpers = `export const sanitizeSettingsUpdate = (candidate) => {
  const result = {};
  if (typeof candidate.terminalCloseOnExit === 'boolean') result.terminalCloseOnExit = candidate.terminalCloseOnExit;
  return result;
};\n`;
  files['packages/web/server/lib/host/settings-registry.json'] = registry;
  files['packages/web/server/lib/host/settings-helpers.js'] = helpers;
  const fixture = makeFixture(files);
  fixture.fork('packages/web/server/lib/settings/settings-registry.json', registry);
  const typedHelpers = `const SESSION_BOOLEAN_SETTINGS: readonly string[] = Object.freeze(['terminalCloseOnExit']);
export const sanitizeSettingsUpdate = (candidate: Record<string, unknown>) => {
  const result: Record<string, boolean> = {};
  for (const key of SESSION_BOOLEAN_SETTINGS) {
    if (typeof candidate[key] === 'boolean') result[key] = candidate[key];
  }
  return result;
};
const normalizeProject = (candidate) => { const result = []; return candidate.id || result.findIndex(() => true); };
`;
  fixture.fork('packages/web/server/lib/settings/settings-helpers.ts', typedHelpers);
  fixture.remove('packages/web/server/lib/host/settings-registry.json');
  fixture.remove('packages/web/server/lib/host/settings-helpers.js');
  const covered = runGuardrail(fixture);
  assert.equal(covered.status, 0, covered.output);
  fixture.fork('packages/web/server/lib/settings/settings-helpers.ts', typedHelpers.replace('for (const key of SESSION_BOOLEAN_SETTINGS)', 'for (const key of [])'));
  const missing = runGuardrail(fixture);
  assert.equal(missing.status, 1, missing.output);
  assert.match(missing.output, /missing from settings-helpers.js sanitizer/);
});

test('split store types, setters and persistence remain audited', () => {
  const fixture = makeFixture(baseFiles());
  fixture.fork('packages/ui/src/stores/useUIStore.ts', `import type { UIStore } from './ui/types';
import { createActions } from './ui/actions';
import { persistOptions } from './ui/persistence';
export const useUIStore = create<UIStore>()(persist((set) => ({terminalCloseOnExit: true, ...createActions(set)}), persistOptions));\n`);
  fixture.fork('packages/ui/src/stores/ui/types.ts', UI_STORE.slice(0, UI_STORE.indexOf('export const useUIStore')));
  fixture.fork('packages/ui/src/stores/ui/actions.ts', 'export const createActions = (set) => ({setTerminalCloseOnExit: (value) => set({terminalCloseOnExit: value})});\n');
  fixture.fork('packages/ui/src/stores/ui/persistence.ts', 'export const persistOptions = {partialize: (state) => ({terminalCloseOnExit: state.terminalCloseOnExit})};\n');
  const covered = runGuardrail(fixture);
  assert.equal(covered.status, 0, covered.output);
  fixture.fork('packages/ui/src/stores/ui/actions.ts', 'export const createActions = () => ({});\n');
  const missing = runGuardrail(fixture);
  assert.equal(missing.status, 1, missing.output);
  assert.match(missing.output, /setter is declared in the store type without an implementation/);
});

test('mounted canonical router prefixes match callers with native filesystem paths', () => {
  const files = baseFiles();
  const routes = [
    ['host/canonical-routes.js', '/ready', '/api/agent/v1/ready'],
    ['host/file-resource-agent-routes.js', '/files', '/api/agent/v1/files'],
    ['host/attachment-routes.js', '/:id', '/api/agent/v1/attachments/attachment'],
    ['host/skill-file-routes.js', '/skills/file', '/api/agent/v1/skills/file'],
    ['host/skill-catalog-routes.js', '/skills/catalog', '/api/agent/v1/skills/catalog'],
    ['openchamber-sessions/routes.js', '/:id/snapshot', '/api/agent/v1/sessions/session/snapshot'],
    ['message-queue/runtime.js', '/sessions/:id/queue', '/api/agent/v1/sessions/session/queue'],
  ];
  for (const [index, [file, route, caller]] of routes.entries()) {
    files['packages/web/server/index.js'] += `\nimport { registerFixture${index}Routes } from './lib/${file}';\nregisterFixture${index}Routes(app);\n`;
    files[`packages/web/server/lib/${file}`] = `export function registerFixture${index}Routes(router) { router.get('${route}', (_req, res) => res.json({})); }\n`;
    files[`packages/ui/src/api/canonical${index}.ts`] = `export const load = () => fetch('${caller}');\n`;
  }
  const fixture = makeFixture(files);
  const covered = runGuardrail(fixture);
  assert.equal(covered.status, 0, covered.output);
  fixture.fork('packages/web/server/lib/host/canonical-routes.js', 'export function registerFixture0Routes(router) {}\n');
  const missing = runGuardrail(fixture);
  assert.equal(missing.status, 1, missing.output);
  assert.match(missing.output, /\[ui-call-no-route\] \/api\/agent\/v1\/ready/);
});

test('deleting a tracker route handler leaves its caller uncovered, even with a 404 fallback mounted', () => {
  const fixture = makeFixture(baseFiles());
  fixture.fork('packages/web/server/lib/trackers/routes.js', TRACKER_ROUTES.replace(/  app\.get\('\/api\/tracker\/things'[\s\S]*?\}\);\n/, ''));
  const result = runGuardrail(fixture);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /\[ui-call-no-route\] \/api\/tracker\/things/);
});

test('a route covered only by an explicit allowlist decision passes', () => {
  const fixture = makeFixture(baseFiles(), ['ui-call-no-route\t/api/tracker/things\t## 2026-01-01 - Keep the tracker surface\tTracker surface retired for this fixture.']);
  fixture.fork('packages/web/server/lib/trackers/routes.js', TRACKER_ROUTES.replace(/  app\.get\('\/api\/tracker\/things'[\s\S]*?\}\);\n/, ''));
  const result = runGuardrail(fixture);
  assert.equal(result.status, 0, result.output);
});

test('an HTTP method the route does not serve is not coverage', () => {
  const fixture = makeFixture(baseFiles());
  fixture.fork('packages/ui/src/api/tracker.ts', "export const saveThing = () => fetch('/api/tracker/things', { method: 'POST' });\n");
  const result = runGuardrail(fixture);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /\[ui-call-no-route\] \/api\/tracker\/things/);
});

test('deleting the setTerminalCloseOnExit implementation while keeping its type fails', () => {
  const fixture = makeFixture(baseFiles());
  fixture.fork('packages/ui/src/stores/useUIStore.ts', UI_STORE.replace(/  setTerminalCloseOnExit: \(value\) => \{[\s\S]*?\n  \},\n/, ''));
  const result = runGuardrail(fixture);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /\[settings-store\] useUIStore\.setTerminalCloseOnExit/);
});

test('deleting a create*Runtime call fails even while its import remains', () => {
  const fixture = makeFixture(baseFiles());
  fixture.fork('packages/web/server/index.js', INDEX.replace(/const autoReview = createAutoReviewRuntime\(\{ enabled: true \}\);\n/, ''));
  const result = runGuardrail(fixture);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /\[runtime-constructor\] createAutoReviewRuntime/);
});

test('an imported but never-called route function is not coverage', () => {
  const fixture = makeFixture(baseFiles());
  fixture.fork('packages/web/server/index.js', INDEX.replace("import { createAutoReviewRuntime }", "import { createAutoReviewRuntime, registerNoteRoutes }"));
  fixture.fork('packages/web/server/lib/notes/routes.js', "export function registerNoteRoutes(app) {\n  app.get('/api/notes', (_req, res) => res.json([]));\n}\n");
  const result = runGuardrail(fixture);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /\[unused-route-fn\] registerNoteRoutes/);
});

test('routes of an imported module that never mounts them are not coverage', () => {
  const fixture = makeFixture(baseFiles());
  fixture.fork('packages/web/server/index.js', INDEX.replace("import { createAutoReviewRuntime }", "import { registerNoteRoutes } from './lib/notes/routes.js';\nimport { createAutoReviewRuntime }"));
  fixture.fork('packages/web/server/lib/notes/routes.js', "export function registerNoteRoutes(app) {\n  app.get('/api/notes', (_req, res) => res.json([]));\n}\n");
  fixture.fork('packages/ui/src/api/notes.ts', "export const loadNotes = () => fetch('/api/notes');\n");
  const result = runGuardrail(fixture);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /\[ui-call-no-route\] \/api\/notes/);
});
test('an allowlist row must cite a decisions.md heading or an existing OMP module', () => {
  const fixture = makeFixture(baseFiles(), ['ui-call-no-route\t/api/unused\t## 2026-99-99 - Not a decision\tBlanket excuse.']);
  const result = runGuardrail(fixture);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /lack a decisions\.md heading/);
});

test('an allowlist row for a gap that no longer exists fails', () => {
  // A removed gap leaves its row behind: the citation still resolves, so only a
  // stale-row check catches it, and the row would otherwise hide a future
  // regression of the same key under an old decision.
  const fixture = makeFixture(baseFiles());
  fixture.fork('scripts/upstream-gaps.allowlist.tsv', `${ALLOWLIST_HEADER}ui-call-no-route\t/api/tracker/things\t## 2026-01-01 - Keep the tracker surface\tCovered while the route existed.\n`);
  const result = runGuardrail(fixture);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /describe a gap that no longer exists/);
  assert.match(result.output, /ui-call-no-route:\/api\/tracker\/things/);
});

const ROW_CONTROL = `export const Row = ({ setting }) => {
  const anchor = \`omp.\${setting.id}\`;
  return <Checkbox settingsItem={anchor} />;
};
`;

const SEARCH_ITEMS = `export const SETTINGS_SEARCH_ITEMS = [
  { id: 'omp.bash.enabled', page: 'omp' },
];
`;

const PLACEMENTS = `const RAW_PLACEMENTS: Readonly<Record<string, string>> = {
  'bash.enabled': 'engine',
};
const GUI_WRITTEN_PAGES: Readonly<Record<string, true>> = {
  sessions: true,
};
`;

test("a row component's anchor template counts for the settings it renders", () => {
  const fixture = makeFixture({
    ...baseFiles(),
    'packages/agent-service/src/worker/settings-ui.ts': PLACEMENTS,
    'packages/ui/src/components/RowControl.tsx': ROW_CONTROL,
    'packages/ui/src/lib/settings/search.ts': SEARCH_ITEMS,
  });
  const result = runGuardrail(fixture);
  assert.equal(result.status, 0, result.output);
});

test('a search entry the row template cannot reach is still a gap', () => {
  const fixture = makeFixture({
    ...baseFiles(),
    'packages/agent-service/src/worker/settings-ui.ts': PLACEMENTS,
    'packages/ui/src/RowControl.tsx': ROW_CONTROL,
    'packages/ui/src/lib/settings/search.ts': SEARCH_ITEMS.replace('bash.enabled', 'bash.removed'),
  });
  const result = runGuardrail(fixture);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /\[settings-search\] omp\.bash\.removed/);
});

const REGISTRY_UPSTREAM = `export const SETTINGS_REGISTRY = {
  staleMemoryFlag: field({
    scope: 'instance',
    effect: ['ui'],
    computed: true,
    parse: parseBoolean,
  }),
};
`;

test('a stale staged bundle is not read as a settings consumer', () => {
  // A checkout can hold gitignored build output (`resources/web-dist`, produced
  // by electron:build). A git ref lists only tracked paths, so the filesystem
  // walk must skip the same directories: otherwise a stale bundle keeps a
  // removed key looking half-present and the guardrail points at a file that is
  // not source at all.
  const files = {
    ...baseFiles(),
    'packages/agent-service/src/worker/settings-ui.ts': PLACEMENTS,
    'packages/ui/src/components/RowControl.tsx': ROW_CONTROL,
    'packages/ui/src/lib/settings/search.ts': SEARCH_ITEMS,
    'packages/ui/src/lib/settings/registry.ts': REGISTRY_UPSTREAM,
  };
  const fixture = makeFixture(files);
  // The fork removes the key from every source surface and keeps only the
  // stale bundle, which still mentions it.
  fixture.fork('packages/ui/src/lib/settings/registry.ts', "export const SETTINGS_REGISTRY = {};\n");
  fixture.fork('packages/electron/resources/web-dist/assets/stale.js', "export const staleMemoryFlag = true;\n");
  const result = runGuardrail(fixture);
  assert.doesNotMatch(result.output, /web-dist/);
});

test('only a placement a GUI owner draws counts as exposure', () => {
  // The audit reads the placement table alone, because OMP's descriptors are
  // not in this tree. Exposure is therefore exactly: `owned-by`, `engine`, and a
  // `page` placement on a page listed in GUI_WRITTEN_PAGES. A `config-only`,
  // `tui-only` or `boundary` row, or a page placement on a page with no GUI
  // control, is config.yml-only, so a search entry pointing at it is a dead row.
  const placements = PLACEMENTS.replace(
    "'bash.enabled': 'engine',",
    [
      "'bash.enabled': 'engine',",
      "'bash.approval': 'sessions:execution',",
      "'bash.missing': 'voice:general',",
      "'bash.configOnly': 'config-only',",
      "'bash.terminalOnly': 'tui-only',",
    ].join('\n  '),
  );
  const fixture = makeFixture({
    ...baseFiles(),
    'packages/agent-service/src/worker/settings-ui.ts': placements,
    'packages/ui/src/components/RowControl.tsx': ROW_CONTROL,
    'packages/ui/src/lib/settings/search.ts': SEARCH_ITEMS.replace(
      "  { id: 'omp.bash.enabled', page: 'omp' },",
      [
        "  { id: 'omp.bash.enabled', page: 'omp' },",
        "  { id: 'omp.bash.approval', page: 'omp' },",
        "  { id: 'omp.bash.missing', page: 'omp' },",
        "  { id: 'omp.bash.configOnly', page: 'omp' },",
        "  { id: 'omp.bash.terminalOnly', page: 'omp' },",
      ].join('\n'),
    ),
  });
  const result = runGuardrail(fixture);
  assert.equal(result.status, 1, result.output);
  // A GUI page placement and an engine row are live anchors.
  assert.doesNotMatch(result.output, /omp\.bash\.approval/);
  assert.doesNotMatch(result.output, /omp\.bash\.enabled/);
  // Everything the route omits is a gap.
  for (const id of ['omp.bash.missing', 'omp.bash.configOnly', 'omp.bash.terminalOnly']) {
    assert.match(result.output, new RegExp(`\\[settings-search\\] ${id.replaceAll('.', '\\.')}`));
  }
});
