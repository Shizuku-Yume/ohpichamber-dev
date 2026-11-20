export const showNotificationAndWait = (notification, timeoutMs = 5000) => new Promise((resolve) => {
  const finish = (shown) => {
    clearTimeout(timer);
    notification.removeListener('show', onShow);
    notification.removeListener('failed', onFailed);
    notification.removeListener('close', onFailed);
    resolve(shown);
  };
  const onShow = () => finish(true);
  const onFailed = () => finish(false);
  const timer = setTimeout(onFailed, timeoutMs);
  notification.once('show', onShow);
  notification.once('failed', onFailed);
  notification.once('close', onFailed);
  try { notification.show(); }
  catch { finish(false); }
});
