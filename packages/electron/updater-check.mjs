const MISSING_UPDATE_FEED_RE =
  /404|ENOTFOUND|No published versions on GitHub|Cannot find (?:channel|latest)|latest-linux(?:-arm64)?\.yml|HttpError:\s*404|status code 404/i;

const isMissingUpdateFeedError = (error) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return MISSING_UPDATE_FEED_RE.test(message);
};

const NETWORK_ERROR_RE = /net::(ERR_[A-Z_]+)|\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH)\b/;

export const describeCheckFailure = (error) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const status = Number(error?.statusCode ?? /^(?:HttpError:\s*)?(\d{3})\b/.exec(message)?.[1]);
  if (Number.isInteger(status) && status >= 400) return `HTTP ${status}`;
  const network = NETWORK_ERROR_RE.exec(message);
  if (network) return network[1] ?? network[2];
  return message.split('\n')[0].trim().slice(0, 200) || 'unknown error';
};

<<<<<<< HEAD
/**
 * Asks the updater for the newest release on the GitHub feed. A 404 before
 * any release exists means no update; any other failure is reported.
 */
export const checkForDesktopUpdate = async ({ autoUpdater, currentVersion, pendingUpdate }) => {
||||||| bc50ba56aa
const releaseNumbers = (version) => String(version ?? '').replace(/^v/, '').split('-')[0].split('.')
  .map((part) => Number.parseInt(part, 10) || 0);

/**
 * Whether installing `nextVersion` over `currentVersion` goes back to an
 * older release. Only Stable after Canary does: the release before the one
 * the Canary build leads to (2.5.3 over 2.5.4-canary.20261030.1). The
 * release with the build's own number (2.5.4) is newer than the build.
 */
export const isDowngrade = (nextVersion, currentVersion) => {
  const next = releaseNumbers(nextVersion);
  const current = releaseNumbers(currentVersion);
  for (let index = 0; index < 3; index += 1) {
    if ((next[index] || 0) !== (current[index] || 0)) return (next[index] || 0) < (current[index] || 0);
  }
  return false;
};

/**
 * `missingFeedIsError`: the Stable mirror always carries the manifests, so a
 * 404 there means the mirror is broken and GitHub should be asked instead.
 */
export const checkForDesktopUpdate = async ({ autoUpdater, currentVersion, pendingUpdate, missingFeedIsError = false }) => {
=======
const releaseNumbers = (version) => String(version ?? '').replace(/^v/, '').split('-')[0].split('.')
  .map((part) => Number.parseInt(part, 10) || 0);

export const isDowngrade = (nextVersion, currentVersion) => {
  const next = releaseNumbers(nextVersion);
  const current = releaseNumbers(currentVersion);
  for (let index = 0; index < 3; index += 1) {
    if ((next[index] || 0) !== (current[index] || 0)) return (next[index] || 0) < (current[index] || 0);
  }
  return false;
};

export const checkForDesktopUpdate = async ({ autoUpdater, currentVersion, pendingUpdate, missingFeedIsError = false }) => {
>>>>>>> upstream/main
  let updateResult;
  try {
    updateResult = await autoUpdater.checkForUpdates();
  } catch (error) {
<<<<<<< HEAD
    // Before the first Linux (or platform) release publishes its feed, electron-updater
    // returns 404 for latest-*.yml. With no pending package, keep the first-release
    // "no update" behavior. A failed feed must preserve an existing package.
    if (isMissingUpdateFeedError(error) && !pendingUpdate) {
||||||| bc50ba56aa
    // Before the first Linux (or platform) release publishes its feed, electron-updater
    // returns 404 for latest-*.yml. With no pending package, keep the first-release
    // "no update" behavior. A failed feed must preserve an existing package.
    if (isMissingUpdateFeedError(error) && !pendingUpdate && !missingFeedIsError) {
=======
    if (isMissingUpdateFeedError(error) && !pendingUpdate && !missingFeedIsError) {
>>>>>>> upstream/main
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
<<<<<<< HEAD
  // electron-updater's own verdict: it compares versions and honours
  // `allowPrerelease`/`allowDowngrade`.
||||||| bc50ba56aa
  // electron-updater's own verdict. It compares semver and honours
  // `allowDowngrade`, which is how Stable after Canary offers the latest
  // release even though that release is older than the Canary build.
=======
>>>>>>> upstream/main
  const available = updateResult?.isUpdateAvailable === true
    && typeof updateInfo?.version === 'string'
    && updateInfo.version.length > 0;
  const nextVersion = available ? updateInfo.version : currentVersion;
<<<<<<< HEAD
  // A check must not drop the payload state of the version already on disk:
  // desktop_restart installs only while `downloaded` is set, so replacing this
  // object after a download turns "Restart to Update" into a plain restart.
||||||| bc50ba56aa
  // Linux package managers refuse an older package unless told it is wanted.
  const downgrade = available && isDowngrade(nextVersion, currentVersion);
  // A check must not drop the payload state of the version already on disk:
  // desktop_restart installs only while `downloaded` is set, so replacing this
  // object after a download turns "Restart to Update" into a plain restart.
=======
  const downgrade = available && isDowngrade(nextVersion, currentVersion);
>>>>>>> upstream/main
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
