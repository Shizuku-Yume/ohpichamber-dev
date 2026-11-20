import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { showNotificationAndWait } from './notification-delivery.mjs';

const notificationFixture = (show) => {
  const notification = new EventEmitter();
  notification.show = () => show(notification);
  return notification;
};

test('confirms success only after the native show event', async () => {
  const notification = notificationFixture(() => {});
  const shown = showNotificationAndWait(notification);
  let settled = false;
  void shown.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  notification.emit('show');
  assert.equal(await shown, true);
  assert.equal(notification.listenerCount('failed'), 0);
  assert.equal(notification.listenerCount('close'), 0);
});

test('reports native permission/delivery failure without success', async () => {
  const notification = notificationFixture(value => value.emit('failed', {}, 'Notifications are not allowed'));
  assert.equal(await showNotificationAndWait(notification), false);
  assert.equal(notification.listenerCount('show'), 0);
});

test('reports failure when showing throws', async () => {
  const notification = notificationFixture(() => { throw new Error('Unsupported'); });
  assert.equal(await showNotificationAndWait(notification), false);
  assert.equal(notification.listenerCount('show'), 0);
});

test('reports unconfirmed delivery when no native event arrives', async () => {
  const notification = notificationFixture(() => {});
  assert.equal(await showNotificationAndWait(notification, 1), false);
  assert.equal(notification.listenerCount('show'), 0);
  assert.equal(notification.listenerCount('failed'), 0);
});

test('does not treat closing before showing as delivery', async () => {
  const notification = notificationFixture(value => value.emit('close'));
  assert.equal(await showNotificationAndWait(notification), false);
});
