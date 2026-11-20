const MISSING_UPDATE_FEED_RE =
  /404|ENOTFOUND|No published versions on GitHub|Cannot find (?:channel|latest)|latest-linux(?:-arm64)?\.yml|HttpError:\s*404|status code 404/i;

const isMissingUpdateFeedError = (error) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return MISSING_UPDATE_FEED_RE.test(message);
};

const NETWORK_ERROR_RE = /net::(ERR_[A-Z_]+)|\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH)\b/;

/**
 * The cause of a failed check in a few words: `HTTP 504`, a network code
 * such as `ENOTFOUND`, or the first line of anything else. electron-updater's
 * HttpError carries the response headers and HTML body in its message; the UI
 * turns these words into advice (`lib/updateCheckError.ts`).
 */
export const describeCheckFailure = (error) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const status = Number(error?.statusCode ?? /^(?:HttpError:\s*)?(\d{3})\b/.exec(message)?.[1]);
  if (Number.isInteger(status) && status >= 400) return `HTTP ${status}`;
  const network = NETWORK_ERROR_RE.exec(message);
  if (network) return network[1] ?? network[2];
  return message.split('\n')[0].trim().slice(0, 200) || 'unknown error';
};

/**
 * Asks the updater for the newest release on the GitHub feed. A 404 before
 * any release exists means no update; any other failure is reported.
 */
export const checkForDesktopUpdate = async ({ autoUpdater, currentVersion, pendingUpdate }) => {
  let updateResult;
  try {
    updateResult = await autoUpdater.checkForUpdates();
  } catch (error) {
    // Before the first Linux (or platform) release publishes its feed, electron-updater
    // returns 404 for latest-*.yml. With no pending package, keep the first-release
    // "no update" behavior. A failed feed must preserve an existing package.
    if (isMissingUpdateFeedError(error) && !pendingUpdate) {
      return {
        available: false,
        updateInfo: null,
        updateResult: null,
        nextVersion: currentVersion,
        pendingUpdate: null,
      };
    }
    throw new Error(`Unable to check for updates (${describeCheckFailure(error)})`, { cause: error });
  }

  const updateInfo = updateResult?.updateInfo;
  // electron-updater's own verdict: it compares versions and honours
  // `allowPrerelease`/`allowDowngrade`.
  const available = updateResult?.isUpdateAvailable === true
    && typeof updateInfo?.version === 'string'
    && updateInfo.version.length > 0;
  const nextVersion = available ? updateInfo.version : currentVersion;
  // A check must not drop the payload state of the version already on disk:
  // desktop_restart installs only while `downloaded` is set, so replacing this
  // object after a download turns "Restart to Update" into a plain restart.
  const sameVersion = pendingUpdate?.version === nextVersion;
  return {
    available,
    updateInfo,
    updateResult,
    nextVersion,
    pendingUpdate: available
      ? {
          ...(sameVersion ? pendingUpdate : {}),
          version: nextVersion,
          electronUpdate: updateResult,
        }
      : null,
  };
};

export const markDesktopUpdateDownloaded = (pendingUpdate, info) => {
  if (!pendingUpdate || pendingUpdate.version !== info?.version) return;
  pendingUpdate.downloaded = true;
  if (info.downloadedFile) pendingUpdate.downloadedFile = info.downloadedFile;
};

export const refreshPendingDesktopUpdate = ({ autoUpdater, currentVersion, state }) => {
  if (state.updateCheckPromise) return state.updateCheckPromise;
  state.updateCheckPromise = checkForDesktopUpdate({ autoUpdater, currentVersion, pendingUpdate: state.pendingUpdate })
    .then((result) => {
      // Download completion may have marked the old record during the check.
      if (state.pendingUpdate?.version === result.pendingUpdate?.version && state.pendingUpdate?.downloaded) {
        markDesktopUpdateDownloaded(result.pendingUpdate, state.pendingUpdate);
      }
      state.pendingUpdate = result.pendingUpdate;
      return result;
    })
    .finally(() => {
      state.updateCheckPromise = null;
    });
  return state.updateCheckPromise;
};

export const stageAutomaticDesktopUpdate = async ({ enabled, check, download }) => {
  if (!enabled()) return;
  const { available } = await check();
  if (available && enabled()) await download();
};

export const downloadPendingDesktopUpdate = async ({ autoUpdater, state }) => {
  const pendingUpdate = state.pendingUpdate;
  if (!pendingUpdate) throw new Error('No pending update');
  if (state.updateDownloadPromise) {
    if (state.updateDownloadVersion !== pendingUpdate.version) {
      throw new Error('Another update download is already in progress. Try again when it finishes.');
    }
    return state.updateDownloadPromise;
  }
  if (!pendingUpdate.electronUpdate) {
    throw new Error('Electron updater metadata is not available for this build');
  }
  if (pendingUpdate.downloaded) return;

  // The promise also resolves for cached payloads, which may emit no event.
  state.updateDownloadPromise = Promise.resolve(autoUpdater.downloadUpdate()).then((files) => {
    markDesktopUpdateDownloaded(state.pendingUpdate, {
      version: pendingUpdate.version,
      downloadedFile: files?.[0],
    });
  });
  state.updateDownloadVersion = pendingUpdate.version;
  try {
    await state.updateDownloadPromise;
  } finally {
    state.updateDownloadPromise = null;
    state.updateDownloadVersion = null;
  }
};
