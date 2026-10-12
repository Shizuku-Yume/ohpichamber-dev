import { openHostMetadataDatabase } from './metadata-sqlite.js';
import { createSessionMetadataStore } from '../openchamber-sessions/session-metadata-store.js';
import { createArchiveStore } from '../openchamber-sessions/archive-store.js';
import { createSessionFoldersStore } from '../session-folders/routes.js';

/** One explicit Host connection and lifecycle for metadata, archive, and folders. */
export const createHostSessionState = ({ dataDir, fsPromises, path, now } = {}) => {
  const { db, filePath } = openHostMetadataDatabase({ dataDir, path });
  const sessionMetadataStore = createSessionMetadataStore({ dataDir, fsPromises, path, database: db });
  const archiveStore = createArchiveStore({ dataDir, fsPromises, path, now, database: db });
  const sessionFoldersStore = createSessionFoldersStore({ openchamberDataDir: dataDir, fsPromises, path, now, database: db });
  let closePromise;
  const initialize = async () => {
    const [metadata, archive, folders] = await Promise.all([
      sessionMetadataStore.convertLegacy(), archiveStore.convertLegacy(), sessionFoldersStore.convertLegacy(),
    ]);
    const outcome = (result) => {
      const status = { status: result.status, errors: result.errors };
      if (result.error) status.code = result.error.code;
      return status;
    };
    return { metadata: outcome(metadata), archive: outcome(archive), folders: outcome(folders) };
  };
  const flush = async () => { await Promise.all([sessionMetadataStore.flush(), archiveStore.flush(), sessionFoldersStore.flush()]); };
  const close = () => {
    if (closePromise) return closePromise;
    // Store close fences new admissions immediately, then drains already
    // admitted work before the sole connection owner closes SQLite.
    closePromise = (async () => {
      await Promise.all([sessionMetadataStore.close(), archiveStore.close(), sessionFoldersStore.close()]);
      db.close();
    })();
    return closePromise;
  };
  return { sessionMetadataStore, archiveStore, sessionFoldersStore, initialize, flush, close, databasePath: filePath };
};
