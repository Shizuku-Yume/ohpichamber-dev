// The Node Host owns PTYs and the supervised Bun Agent Service. Allow the
// terminal runtime's 20s grace plus remaining service and HTTP teardown.
export async function stopEmbeddedServer(handle, { warn, timeoutMs = 35_000 }) {
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
