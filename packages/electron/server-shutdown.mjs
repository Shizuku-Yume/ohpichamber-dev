<<<<<<< HEAD
// The Node Host owns PTYs and the supervised Bun Agent Service. Allow the
// terminal runtime's 20s grace plus remaining service and HTTP teardown.
export async function stopEmbeddedServer(handle, { warn, timeoutMs = 35_000 }) {
||||||| bc50ba56aa
// The backend owns PTYs and services as well as OpenCode. Give it a chance to
// release all of them before Electron exits; the detached killer is a fallback.
// Includes the terminal runtime's 20s grace plus OpenCode and HTTP teardown.
export async function stopEmbeddedServer(handle, { launchFallback, warn, timeoutMs = 35_000 }) {
=======
export async function stopEmbeddedServer(handle, { launchFallback, warn, timeoutMs = 35_000 }) {
>>>>>>> upstream/main
  if (!handle) return;
  let timer;
  try {
    await Promise.race([
      handle.stop({ exitProcess: false }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Embedded server shutdown timed out')), timeoutMs);
      }),
    ]);
  } catch (error) {
    warn(error);
  } finally {
    clearTimeout(timer);
  }
}
