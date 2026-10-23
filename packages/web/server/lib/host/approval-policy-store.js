import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const require = createRequire(import.meta.url);
const loadDatabaseSync = () => {
  const { DatabaseSync } = process.getBuiltinModule?.('node:sqlite') ?? require('node:sqlite');
  return DatabaseSync;
};

const normalize = (value) => typeof value === 'string' && value.length > 0 ? value : null;
const validatePolicy = (policy) => {
  if (!policy || !['session', 'workspace'].includes(policy.scope) || (policy.scope === 'session' ? policy.decision !== 'allow' : policy.decision !== 'deny')) return null;
  const toolName = normalize(policy.target?.toolName);
  const pattern = normalize(policy.target?.pattern);
  if (!toolName || !pattern) return null;
  return { ...policy, target: { toolName, pattern } };
};

export class ApprovalPolicyWriteError extends Error {
  constructor(message, cause) { super(message, cause ? { cause } : undefined); this.name = 'ApprovalPolicyWriteError'; this.code = 'APPROVAL_POLICY_WRITE_FAILED'; }
}

export class ApprovalPolicySchemaTooNewError extends ApprovalPolicyWriteError {
  constructor(message, cause) { super(message, cause); this.name = 'ApprovalPolicySchemaTooNewError'; this.code = 'APPROVAL_POLICY_SCHEMA_TOO_NEW'; }
}

export const CURRENT_APPROVAL_POLICY_SCHEMA_VERSION = 1;

export const APPROVAL_POLICY_MIGRATIONS = [
  // Migration 1: baseline approval_policies table and indexes
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS approval_policies (
        policy_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, session_id TEXT, root_session_id TEXT, project_id TEXT, workspace_id TEXT,
        scope TEXT NOT NULL, decision TEXT NOT NULL, tool_name TEXT NOT NULL, pattern TEXT NOT NULL,
        UNIQUE(scope, session_id, workspace_id, project_id, tool_name, pattern)
      );
      CREATE INDEX IF NOT EXISTS approval_policies_session ON approval_policies(session_id);
      CREATE INDEX IF NOT EXISTS approval_policies_workspace ON approval_policies(workspace_id);
    `);
  },
];

export const ensureApprovalPolicySchema = (db) => {
  const versionRow = db.prepare('PRAGMA user_version').get();
  const currentVersion = Number(versionRow?.user_version ?? 0);
  if (currentVersion > CURRENT_APPROVAL_POLICY_SCHEMA_VERSION) {
    throw new ApprovalPolicySchemaTooNewError(
      `Approval policy database schema version ${currentVersion} is newer than supported version ${CURRENT_APPROVAL_POLICY_SCHEMA_VERSION}`
    );
  }
  if (currentVersion === CURRENT_APPROVAL_POLICY_SCHEMA_VERSION) {
    return currentVersion;
  }
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (let v = currentVersion; v < CURRENT_APPROVAL_POLICY_SCHEMA_VERSION; v++) {
      APPROVAL_POLICY_MIGRATIONS[v](db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw new ApprovalPolicyWriteError('Could not migrate approval policy schema', error);
  }
  return CURRENT_APPROVAL_POLICY_SCHEMA_VERSION;
};

export const openApprovalPolicyStore = ({ dataDir, databasePath } = {}) => {
  const filePath = databasePath ?? path.join(dataDir, 'host-approval-policies.sqlite');
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(filePath)) fs.closeSync(fs.openSync(filePath, 'a', 0o600));
    fs.chmodSync(filePath, 0o600);
    const db = new (loadDatabaseSync())(filePath, { timeout: 5000 });
    try {
      ensureApprovalPolicySchema(db);
    } catch (error) {
      try { db.close(); } catch {}
      throw error;
    }
    return {
      commit({ scope, sessionId, rootSessionId, projectId, workspaceId, decision, target }) {
        const policy = validatePolicy({ scope, decision, target });
        if (!policy || !normalize(workspaceId) || !normalize(projectId) || (scope === 'session' && !normalize(sessionId))) throw new ApprovalPolicyWriteError('Invalid approval policy');
        try {
          db.exec('BEGIN IMMEDIATE');
          const revisionQuery = db.prepare('SELECT revision FROM approval_policies ORDER BY revision DESC LIMIT 1');
          revisionQuery.setReadBigInts(true);
          const revision = (revisionQuery.get()?.revision ?? 0n) + 1n;
          const existing = db.prepare('SELECT policy_id FROM approval_policies WHERE scope=? AND session_id IS ? AND workspace_id=? AND project_id=? AND tool_name=? AND pattern=?').get(scope, scope === 'session' ? sessionId : null, workspaceId, projectId, target.toolName, target.pattern);
          const policyId = existing?.policy_id ?? crypto.randomUUID();
          db.prepare(`INSERT INTO approval_policies(policy_id,revision,session_id,root_session_id,project_id,workspace_id,scope,decision,tool_name,pattern) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(policy_id) DO UPDATE SET revision=excluded.revision,decision=excluded.decision`).run(policyId, revision, scope === 'session' ? sessionId : null, rootSessionId ?? null, projectId, workspaceId, scope, decision, target.toolName, target.pattern);
          db.exec('COMMIT');
          return { policyId, revision: String(revision), scope, decision, target: { toolName: target.toolName, pattern: target.pattern } };
        } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw new ApprovalPolicyWriteError('Could not write approval policy', error); }
      },
      list({ sessionId, projectId, workspaceId }) {
        if (!normalize(sessionId) || !normalize(projectId) || !normalize(workspaceId)) throw new ApprovalPolicyWriteError('Invalid approval policy scope');
        try {
          const query = db.prepare(`SELECT policy_id AS policyId, revision, scope, decision, tool_name AS toolName, pattern FROM approval_policies WHERE workspace_id=? AND project_id=? AND (scope='workspace' OR (scope='session' AND session_id=?)) ORDER BY revision ASC`);
          query.setReadBigInts(true);
          return query.all(workspaceId, projectId, sessionId).map((row) => ({ policyId: row.policyId, revision: String(row.revision), scope: row.scope, decision: row.decision, target: { toolName: row.toolName, pattern: row.pattern } }));
        } catch (error) { throw new ApprovalPolicyWriteError('Could not read approval policies', error); }
      },
      close() { db.close(); },
    };
  } catch (error) { if (error instanceof ApprovalPolicyWriteError) throw error; throw new ApprovalPolicyWriteError('Could not open approval policy store', error); }
};
