import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import type * as nodeSqlite from 'node:sqlite';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { isString } from '../shared/guards.js';

const require = createRequire(import.meta.url);
const loadDatabaseSync = (): typeof DatabaseSync => {
  const builtin = process.getBuiltinModule?.('node:sqlite');
  if (builtin) return builtin.DatabaseSync;
  const loaded: typeof nodeSqlite = require('node:sqlite');
  return loaded.DatabaseSync;
};

const ensurePrivateSqliteFile = (fsImpl: ApprovalPolicyFs, filePath: string): void => {
  if (!fsImpl.existsSync(filePath)) fsImpl.closeSync(fsImpl.openSync(filePath, 'a', 0o600));
  fsImpl.chmodSync(filePath, 0o600);
};

const NonEmptyStringSchema = z.string().min(1);
const SqliteIntegerSchema = z.union([z.number(), z.bigint()]);
const UserVersionRowSchema = z.object({ user_version: SqliteIntegerSchema });
const RevisionRowSchema = z.object({ revision: SqliteIntegerSchema });
const PolicyIdRowSchema = z.object({ policy_id: z.string() });
const PolicyScopeSchema = z.enum(['session', 'workspace']);
const PolicyDecisionSchema = z.enum(['allow', 'deny']);
const ListedPolicyRowSchema = z.object({
  policyId: z.string(),
  revision: SqliteIntegerSchema,
  scope: PolicyScopeSchema,
  decision: PolicyDecisionSchema,
  toolName: z.string(),
  pattern: z.string(),
});

export type ApprovalPolicyScope = z.infer<typeof PolicyScopeSchema>;
export type ApprovalPolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export interface ApprovalPolicyTarget {
  toolName: string;
  pattern: string;
}

export interface ApprovalPolicyCommitInput {
  scope: ApprovalPolicyScope;
  sessionId?: string | null | undefined;
  rootSessionId?: string | null | undefined;
  projectId: string;
  workspaceId: string;
  decision: ApprovalPolicyDecision;
  target: ApprovalPolicyTarget;
}

export interface ApprovalPolicyRecord {
  policyId: string;
  revision: string;
  scope: ApprovalPolicyScope;
  decision: ApprovalPolicyDecision;
  target: ApprovalPolicyTarget;
}

export interface ApprovalPolicyListInput {
  sessionId: string;
  projectId: string;
  workspaceId: string;
}

export interface ApprovalPolicyFs {
  existsSync: typeof fs.existsSync;
  openSync: typeof fs.openSync;
  closeSync: typeof fs.closeSync;
  chmodSync: typeof fs.chmodSync;
  mkdirSync: typeof fs.mkdirSync;
}

export interface OpenApprovalPolicyStoreOptions {
  dataDir?: string | undefined;
  databasePath?: string | undefined;
  fsImpl?: ApprovalPolicyFs | undefined;
  path?: typeof path | undefined;
}

export interface ApprovalPolicyStore {
  commit(input: ApprovalPolicyCommitInput): ApprovalPolicyRecord;
  list(input: ApprovalPolicyListInput): ApprovalPolicyRecord[];
  close(): void;
}

const normalize = (value: string | null | undefined): string | null =>
  NonEmptyStringSchema.safeParse(value).data ?? null;

const validatePolicy = ({
  scope,
  decision,
  target,
}: {
  scope: ApprovalPolicyScope;
  decision: ApprovalPolicyDecision;
  target: ApprovalPolicyTarget;
}): { scope: ApprovalPolicyScope; decision: ApprovalPolicyDecision; target: ApprovalPolicyTarget } | null => {
  if (!['session', 'workspace'].includes(scope) || (scope === 'session' ? decision !== 'allow' : decision !== 'deny')) return null;
  const toolName = normalize(target?.toolName);
  const pattern = normalize(target?.pattern);
  if (!toolName || !pattern) return null;
  return { scope, decision, target: { toolName, pattern } };
};

class ApprovalPolicyWriteError extends Error {
  code: string;
  constructor(message: string, cause?: Error | string | number) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'ApprovalPolicyWriteError';
    this.code = 'APPROVAL_POLICY_WRITE_FAILED';
  }
}

export class ApprovalPolicySchemaTooNewError extends ApprovalPolicyWriteError {
  constructor(message: string, cause?: Error | string | number) {
    super(message, cause);
    this.name = 'ApprovalPolicySchemaTooNewError';
    this.code = 'APPROVAL_POLICY_SCHEMA_TOO_NEW';
  }
}

export const CURRENT_APPROVAL_POLICY_SCHEMA_VERSION = 2;

const APPROVAL_POLICY_MIGRATIONS: Array<(db: DatabaseSync) => void> = [
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
  (db) => {
    db.exec("DELETE FROM approval_policies WHERE scope = 'session' AND decision = 'allow'");
  },
];

export const ensureApprovalPolicySchema = (db: DatabaseSync): number => {
  const versionRow = UserVersionRowSchema.safeParse(db.prepare('PRAGMA user_version').get());
  const currentVersion = Number(versionRow.success ? versionRow.data.user_version : 0);
  if (currentVersion > CURRENT_APPROVAL_POLICY_SCHEMA_VERSION) {
    throw new ApprovalPolicySchemaTooNewError(
      `Approval policy database schema version ${currentVersion} is newer than supported version ${CURRENT_APPROVAL_POLICY_SCHEMA_VERSION}`,
    );
  }
  db.exec('PRAGMA journal_mode = WAL;');
  if (currentVersion === CURRENT_APPROVAL_POLICY_SCHEMA_VERSION) {
    return currentVersion;
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const lockedVersionRow = UserVersionRowSchema.safeParse(db.prepare('PRAGMA user_version').get());
    const lockedVersion = Number(lockedVersionRow.success ? lockedVersionRow.data.user_version : 0);
    if (lockedVersion > CURRENT_APPROVAL_POLICY_SCHEMA_VERSION) {
      throw new ApprovalPolicySchemaTooNewError(
        `Approval policy database schema version ${lockedVersion} is newer than supported version ${CURRENT_APPROVAL_POLICY_SCHEMA_VERSION}`,
      );
    }
    for (let v = lockedVersion; v < CURRENT_APPROVAL_POLICY_SCHEMA_VERSION; v++) {
      const migration = APPROVAL_POLICY_MIGRATIONS[v];
      if (!migration) throw new ApprovalPolicyWriteError(`Missing approval policy migration ${v + 1}`);
      migration(db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { void 0; }
    if (error instanceof ApprovalPolicyWriteError) throw error;
    throw new ApprovalPolicyWriteError('Could not migrate approval policy schema', error instanceof Error ? error : String(error));
  }
  return CURRENT_APPROVAL_POLICY_SCHEMA_VERSION;
};

export const openApprovalPolicyStore = ({
  dataDir,
  databasePath,
  fsImpl = fs,
  path: nodePath = path,
}: OpenApprovalPolicyStoreOptions = {}): ApprovalPolicyStore => {
  const filePath = databasePath ?? (isString(dataDir) ? nodePath.join(dataDir, 'host-approval-policies.sqlite') : '');
  if (!filePath) throw new ApprovalPolicyWriteError('Could not open approval policy store');
  const directoryPath = nodePath.dirname(filePath);
  const sidecarPaths = [`${filePath}-wal`, `${filePath}-shm`];
  try {
    fsImpl.mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
    ensurePrivateSqliteFile(fsImpl, filePath);
    for (const sidecarPath of sidecarPaths) ensurePrivateSqliteFile(fsImpl, sidecarPath);
    const DatabaseSyncCtor = loadDatabaseSync();
    const db = new DatabaseSyncCtor(filePath, { timeout: 5000 });
    try {
      ensureApprovalPolicySchema(db);
      for (const sidecarPath of sidecarPaths) {
        if (fsImpl.existsSync(sidecarPath)) fsImpl.chmodSync(sidecarPath, 0o600);
      }
    } catch (error) {
      try { db.close(); } catch { void 0; }
      throw error;
    }
    return {
      commit({ scope, sessionId, rootSessionId, projectId, workspaceId, decision, target }) {
        const policy = validatePolicy({ scope, decision, target });
        if (!policy || !normalize(workspaceId) || !normalize(projectId) || (scope === 'session' && !normalize(sessionId))) {
          throw new ApprovalPolicyWriteError('Invalid approval policy');
        }
        const scopedSessionId = scope === 'session' ? (sessionId ?? null) : null;
        let revision: bigint;
        let policyId: string;
        try {
          db.exec('BEGIN IMMEDIATE');
          const revisionQuery = db.prepare('SELECT revision FROM approval_policies ORDER BY revision DESC LIMIT 1');
          revisionQuery.setReadBigInts(true);
          const revisionRow = RevisionRowSchema.safeParse(revisionQuery.get());
          revision = (revisionRow.success ? BigInt(revisionRow.data.revision) : 0n) + 1n;
          const existingRow = PolicyIdRowSchema.safeParse(
            db.prepare('SELECT policy_id FROM approval_policies WHERE scope=? AND session_id IS ? AND workspace_id=? AND project_id=? AND tool_name=? AND pattern=?')
              .get(scope, scopedSessionId, workspaceId, projectId, target.toolName, target.pattern),
          );
          policyId = existingRow.success ? existingRow.data.policy_id : crypto.randomUUID();
          db.prepare('INSERT INTO approval_policies(policy_id,revision,session_id,root_session_id,project_id,workspace_id,scope,decision,tool_name,pattern) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(policy_id) DO UPDATE SET revision=excluded.revision,decision=excluded.decision')
            .run(policyId, revision, scopedSessionId, rootSessionId ?? null, projectId, workspaceId, scope, decision, target.toolName, target.pattern);
          db.exec('COMMIT');
        } catch (error) {
          try { db.exec('ROLLBACK'); } catch { void 0; }
          throw new ApprovalPolicyWriteError('Could not write approval policy', error instanceof Error ? error : String(error));
        }
        for (const sidecarPath of sidecarPaths) {
          try {
            if (fsImpl.existsSync(sidecarPath)) fsImpl.chmodSync(sidecarPath, 0o600);
          } catch { void 0; }
        }
        return { policyId, revision: String(revision), scope, decision, target: { toolName: target.toolName, pattern: target.pattern } };
      },
      list({ sessionId, projectId, workspaceId }) {
        if (!normalize(sessionId) || !normalize(projectId) || !normalize(workspaceId)) {
          throw new ApprovalPolicyWriteError('Invalid approval policy scope');
        }
        try {
          const query = db.prepare("SELECT policy_id AS policyId, revision, scope, decision, tool_name AS toolName, pattern FROM approval_policies WHERE workspace_id=? AND project_id=? AND (scope='workspace' OR (scope='session' AND session_id=?)) ORDER BY revision ASC");
          query.setReadBigInts(true);
          return query.all(workspaceId, projectId, sessionId).map((raw) => {
            const row = ListedPolicyRowSchema.parse(raw);
            return {
              policyId: row.policyId,
              revision: String(row.revision),
              scope: row.scope,
              decision: row.decision,
              target: { toolName: row.toolName, pattern: row.pattern },
            };
          });
        } catch (error) {
          throw new ApprovalPolicyWriteError('Could not read approval policies', error instanceof Error ? error : String(error));
        }
      },
      close() { db.close(); },
    };
  } catch (error) {
    if (error instanceof ApprovalPolicyWriteError) throw error;
    throw new ApprovalPolicyWriteError('Could not open approval policy store', error instanceof Error ? error : String(error));
  }
};
