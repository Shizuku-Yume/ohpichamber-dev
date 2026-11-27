import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  openApprovalPolicyStore,
  ensureApprovalPolicySchema,
  ApprovalPolicySchemaTooNewError,
  CURRENT_APPROVAL_POLICY_SCHEMA_VERSION,
} from './approval-policy-store.js';

const roots = [];
const makeRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-policy-test-'));
  roots.push(root);
  return root;
};
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});
const posixTest = process.platform === 'win32' ? it.skip : it;
const mode = (file) => fs.statSync(file).mode & 0o777;
const approvalStoreModuleUrl = new URL('./approval-policy-store.js', import.meta.url).href;

const runConcurrentOpenWorker = ({ root, workerId }) => new Promise((resolve, reject) => {
  const script = `
import fs from 'node:fs';
import path from 'node:path';
import { openApprovalPolicyStore } from ${JSON.stringify(approvalStoreModuleUrl)};
process.umask(0o022);
const root = process.argv[1];
const dbPath = path.join(root, 'host-approval-policies.sqlite');
const mode = (file) => fs.statSync(file).mode & 0o777;
const assertPrivate = (file, expected) => {
  if (!fs.existsSync(file)) throw new Error('missing ' + file);
  const actual = mode(file);
  if (actual !== expected) throw new Error(file + ' mode ' + actual.toString(8) + ', expected ' + expected.toString(8));
};
for (let i = 0; i < 8; i++) {
  const store = openApprovalPolicyStore({ dataDir: root });
  try {
    store.commit({
      scope: 'workspace', sessionId: 'sess-concurrent', projectId: 'proj-concurrent', workspaceId: 'ws-concurrent',
      decision: 'deny', target: { toolName: 'bash', pattern: 'concurrent-' + process.pid + '-' + i },
    });
    assertPrivate(root, 0o700);
    assertPrivate(dbPath, 0o600);
    assertPrivate(dbPath + '-wal', 0o600);
    assertPrivate(dbPath + '-shm', 0o600);
  } finally {
    store.close();
  }
}
`;
  const child = spawn(process.execPath, [
    '--import',
    new URL('../../../scripts/register-server-sources.mjs', import.meta.url).href,
    '--input-type=module',
    '--eval',
    script,
    root,
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('exit', (code) => {
    if (code === 0) { resolve(); return; }
    reject(new Error(`concurrent approval store worker ${workerId} exited ${code}: ${stderr.trim()}`));
  });
});

describe('approval policy database permissions and sidecars', () => {
  posixTest('creates private database and WAL sidecars under umask 022', () => {
    const parent = makeRoot();
    const root = path.join(parent, 'data');
    const previous = process.umask(0o022);
    let store;
    try {
      store = openApprovalPolicyStore({ dataDir: root });
      const dbPath = path.join(root, 'host-approval-policies.sqlite');
      expect(mode(root)).toBe(0o700);
      expect(mode(dbPath)).toBe(0o600);

      store.commit({
        scope: 'workspace',
        sessionId: 'sess-1',
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        decision: 'deny',
        target: { toolName: 'bash', pattern: 'rm -rf *' },
      });
      for (const suffix of ['-wal', '-shm']) {
        if (fs.existsSync(`${dbPath}${suffix}`)) {
          expect(mode(`${dbPath}${suffix}`)).toBe(0o600);
        }
      }
    } finally {
      if (store) store.close();
      process.umask(previous);
    }
  });

  posixTest('tightens pre-existing database and sidecars without changing existing root mode', () => {
    const root = makeRoot();
    fs.chmodSync(root, 0o755);
    const filePath = path.join(root, 'host-approval-policies.sqlite');
    let seed = new DatabaseSync(filePath);
    try {
      seed.exec("PRAGMA journal_mode = WAL; CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO records(value) VALUES ('durable');");
      fs.chmodSync(filePath, 0o644);
      expect(fs.existsSync(`${filePath}-wal`)).toBe(true);
      expect(fs.existsSync(`${filePath}-shm`)).toBe(true);
      fs.chmodSync(`${filePath}-wal`, 0o644);
      fs.chmodSync(`${filePath}-shm`, 0o644);

      const store = openApprovalPolicyStore({ dataDir: root, databasePath: filePath });
      try {
        expect(mode(root)).toBe(0o755);
        expect(mode(filePath)).toBe(0o600);
        expect(mode(`${filePath}-wal`)).toBe(0o600);
        expect(mode(`${filePath}-shm`)).toBe(0o600);

        store.commit({
          scope: 'workspace',
          sessionId: 'sess-1',
          projectId: 'proj-1',
          workspaceId: 'ws-1',
          decision: 'deny',
          target: { toolName: 'bash', pattern: 'rm -rf *' },
        });
        expect(mode(`${filePath}-wal`)).toBe(0o600);
        expect(mode(`${filePath}-shm`)).toBe(0o600);
      } finally {
        store.close();
      }
    } finally {
      seed.close();
    }
  });

  posixTest('recreates private sidecars across concurrent opens and reopen under umask 022', async () => {
    const parent = makeRoot();
    const root = path.join(parent, 'data');
    const dbPath = path.join(root, 'host-approval-policies.sqlite');
    const previous = process.umask(0o022);
    const assertLivePermissions = () => {
      expect(mode(root)).toBe(0o700);
      for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
        expect(fs.existsSync(file)).toBe(true);
        expect(mode(file)).toBe(0o600);
      }
    };
    const policy = (pattern) => ({
      scope: 'workspace', sessionId: 'sess-recreation', projectId: 'proj-recreation', workspaceId: 'ws-recreation',
      decision: 'deny', target: { toolName: 'bash', pattern },
    });
    try {
      // Create and migrate the database once, then exercise concurrent reopeners.
      // A first-open migration itself intentionally serializes on BEGIN IMMEDIATE;
      // the sidecar permission guarantee under test starts at every open.
      const seed = openApprovalPolicyStore({ dataDir: root });
      seed.close();

      await Promise.all(Array.from({ length: 4 }, (_, workerId) => runConcurrentOpenWorker({ root, workerId })));
      expect(mode(root)).toBe(0o700);
      expect(mode(dbPath)).toBe(0o600);

      const reopened = openApprovalPolicyStore({ dataDir: root });
      try {
        assertLivePermissions();
        reopened.commit(policy('reopened'));
        assertLivePermissions();
      } finally {
        reopened.close();
      }

      // Simulate a crash/recovery state where the sidecars are gone: the next
      // open must create both sidecars private before SQLite touches them.
      for (const suffix of ['-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
      const recreated = openApprovalPolicyStore({ dataDir: root });
      try {
        assertLivePermissions();
        recreated.commit(policy('recreated'));
        assertLivePermissions();
      } finally {
        recreated.close();
      }
    } finally {
      process.umask(previous);
    }
  }, 30_000);
});

describe('approval policy database schema versioning and migrations', () => {
  it('fresh database gets current schema version and creates table and indexes', () => {
    const root = makeRoot();
    const store = openApprovalPolicyStore({ dataDir: root });
    try {
      const dbPath = path.join(root, 'host-approval-policies.sqlite');
      expect(fs.existsSync(dbPath)).toBe(true);

      const db = new DatabaseSync(dbPath);
      try {
        const version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
        expect(version).toBe(CURRENT_APPROVAL_POLICY_SCHEMA_VERSION);

        const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='approval_policies'").get();
        expect(table).toBeDefined();

        const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name);
        expect(indexes).toContain('approval_policies_session');
        expect(indexes).toContain('approval_policies_workspace');
      } finally {
        db.close();
      }
    } finally {
      store.close();
    }
  });

  it('old-version fixture drops legacy exact-input session allowances and preserves other policies', () => {
    const root = makeRoot();
    const filePath = path.join(root, 'host-approval-policies.sqlite');

    // Create legacy v0 database
    const seed = new DatabaseSync(filePath);
    seed.exec(`
      CREATE TABLE approval_policies (
        policy_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, session_id TEXT, root_session_id TEXT, project_id TEXT, workspace_id TEXT,
        scope TEXT NOT NULL, decision TEXT NOT NULL, tool_name TEXT NOT NULL, pattern TEXT NOT NULL,
        UNIQUE(scope, session_id, workspace_id, project_id, tool_name, pattern)
      );
      INSERT INTO approval_policies VALUES ('pol-1', 1, 'sess-1', 'root-1', 'proj-1', 'ws-1', 'session', 'allow', 'bash', '{"command":"npm test"}');
      INSERT INTO approval_policies VALUES ('pol-3', 3, 'sess-1', 'root-1', 'proj-1', 'ws-1', 'session', 'allow', 'bash', '*');
      INSERT INTO approval_policies VALUES ('pol-2', 2, NULL, NULL, 'proj-1', 'ws-1', 'workspace', 'deny', 'bash', 'rm -rf');
      PRAGMA user_version = 0;
    `);
    seed.close();

    const store = openApprovalPolicyStore({ dataDir: root });
    try {
      // The exact-input and interim wildcard session allowances are both retired.
      const listed = store.list({ sessionId: 'sess-1', projectId: 'proj-1', workspaceId: 'ws-1' });
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ policyId: 'pol-2', decision: 'deny', target: { toolName: 'bash', pattern: 'rm -rf' } });

      // Version bumped to current
      const db = new DatabaseSync(filePath);
      try {
        expect(Number(db.prepare('PRAGMA user_version').get()?.user_version)).toBe(CURRENT_APPROVAL_POLICY_SCHEMA_VERSION);
      } finally {
        db.close();
      }
    } finally {
      store.close();
    }
  });

  it('reopening an already-migrated database is idempotent', () => {
    const root = makeRoot();
    const first = openApprovalPolicyStore({ dataDir: root });
    first.commit({
      scope: 'workspace',
      sessionId: 'sess-1',
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      decision: 'deny',
      target: { toolName: 'write', pattern: '*.secret' },
    });
    first.close();

    const second = openApprovalPolicyStore({ dataDir: root });
    try {
      const listed = second.list({ sessionId: 'sess-1', projectId: 'proj-1', workspaceId: 'ws-1' });
      expect(listed.length).toBe(1);
      expect(listed[0].decision).toBe('deny');
      expect(listed[0].target.pattern).toBe('*.secret');
    } finally {
      second.close();
    }
  });

  it('newer schema version is refused with an explicit error and no write', () => {
    const root = makeRoot();
    const filePath = path.join(root, 'host-approval-policies.sqlite');

    // Create a database with user_version higher than current
    const seed = new DatabaseSync(filePath);
    seed.exec(`
      PRAGMA user_version = 999;
      CREATE TABLE future_approval (id TEXT PRIMARY KEY, test TEXT);
      INSERT INTO future_approval VALUES ('f1', 'future');
    `);
    seed.close();

    expect(() => openApprovalPolicyStore({ dataDir: root })).toThrow(ApprovalPolicySchemaTooNewError);

    // Verify database was untouched: no approval_policies table created, user_version unchanged
    const verify = new DatabaseSync(filePath);
    try {
      expect(Number(verify.prepare('PRAGMA user_version').get()?.user_version)).toBe(999);
      expect(verify.prepare("SELECT test FROM future_approval WHERE id='f1'").get()?.test).toBe('future');
      const table = verify.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='approval_policies'").get();
      expect(table).toBeUndefined();
    } finally {
      verify.close();
    }
  });
});
