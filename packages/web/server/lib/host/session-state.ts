import type nodeFsPromises from 'node:fs/promises';
import nodePath from 'node:path';
import { openHostMetadataDatabase, type OpenHostMetadataDatabaseOptions } from './metadata-sqlite.js';
import { createSessionMetadataStore, type SessionMetadataStoreOptions } from '../openchamber-sessions/session-metadata-store.js';
import { createArchiveStore, type ArchiveStoreOptions } from '../openchamber-sessions/archive-store.js';
import { createSessionFoldersStore } from '../session-folders/routes.js';
import type { SessionFoldersDependencies } from '../session-folders/contracts.js';
import { createAgentScopeStore } from './agent-scope-store.js';
import { createAttachmentStore } from './attachment-store.js';
import { createDirectCommandAdmissionStore } from './direct-command-admission-store.js';

export interface HostSessionStateOptions {
  dataDir: string;
  fsPromises?: typeof nodeFsPromises | undefined;
  path?: typeof nodePath | undefined;
  now?: (() => number) | undefined;
}

export interface LegacyConversionInput {
  status: string;
  errors: Record<string, string>;
  error?: { code: string } | undefined;
}

export interface ConversionOutcome {
  status: string;
  errors: Record<string, string>;
  code?: string;
}

export const createHostSessionState = ({ dataDir, fsPromises, path, now }: HostSessionStateOptions) => {
  const dbOptions: OpenHostMetadataDatabaseOptions = { dataDir };
  if (path !== undefined) dbOptions.path = path;
  const { db, filePath } = openHostMetadataDatabase(dbOptions);

  const metadataOptions: SessionMetadataStoreOptions = { dataDir, database: db };
  if (fsPromises !== undefined) metadataOptions.fsPromises = fsPromises;
  if (path !== undefined) metadataOptions.path = path;
  const sessionMetadataStore = createSessionMetadataStore(metadataOptions);

  const agentScopeStore = createAgentScopeStore({ database: db, fsPromises });

  const archiveOptions: ArchiveStoreOptions = {
    dataDir,
    database: db,
    assertSessionWritable: agentScopeStore.assertSessionWritable,
  };
  if (fsPromises !== undefined) archiveOptions.fsPromises = fsPromises;
  if (path !== undefined) archiveOptions.path = path;
  if (now !== undefined) archiveOptions.now = now;
  const archiveStore = createArchiveStore(archiveOptions);

  const foldersOptions: SessionFoldersDependencies = { openchamberDataDir: dataDir, database: db };
  if (fsPromises !== undefined) foldersOptions.fsPromises = fsPromises;
  if (path !== undefined) foldersOptions.path = path;
  if (now !== undefined) foldersOptions.now = now;
  const sessionFoldersStore = createSessionFoldersStore(foldersOptions);

  const attachmentStore = createAttachmentStore({
    database: db,
    storageDirectory: (path ?? nodePath).join(dataDir, 'attachments'),
    fsPromises,
    now,
  });
  const directCommandAdmissionStore = createDirectCommandAdmissionStore({ database: db });
  let closePromise: Promise<void> | undefined;

  const outcome = (result: LegacyConversionInput): ConversionOutcome => {
    const status: ConversionOutcome = { status: result.status, errors: result.errors };
    if (result.error) status.code = result.error.code;
    return status;
  };

  const initialize = async () => {
    const [metadata, archive, folders] = await Promise.all([
      sessionMetadataStore.convertLegacy(),
      archiveStore.convertLegacy(),
      sessionFoldersStore.convertLegacy(),
    ]);
    return {
      metadata: outcome(metadata),
      archive: outcome(archive),
      folders: outcome(folders),
    };
  };

  const flush = async () => {
    await Promise.all([
      sessionMetadataStore.flush(),
      archiveStore.flush(),
      sessionFoldersStore.flush(),
      agentScopeStore.flush(),
      attachmentStore.flush(),
      directCommandAdmissionStore.flush(),
    ]);
  };

  const close = () => {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      await Promise.all([
        sessionMetadataStore.close(),
        archiveStore.close(),
        sessionFoldersStore.close(),
        agentScopeStore.close(),
        attachmentStore.close(),
        directCommandAdmissionStore.close(),
      ]);
      db.close();
    })();
    return closePromise;
  };

  return {
    sessionMetadataStore,
    archiveStore,
    sessionFoldersStore,
    agentScopeStore,
    attachmentStore,
    directCommandAdmissionStore,
    initialize,
    flush,
    close,
    databasePath: filePath,
  };
};
