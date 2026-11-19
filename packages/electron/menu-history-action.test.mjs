import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createHistoryMenuAction, createHistoryMenuItems, createHistoryContextMenuItems } from './menu-history-action.mjs';
import { menuLabel, MENU_LOCALE_DICTIONARIES } from './menu-locales.mjs';

const pageContents = (hostWebContents = null) => {
  const calls = [];
  return {
    calls,
    hostWebContents,
    isDestroyed: () => false,
    undo: () => calls.push('undo'),
    redo: () => calls.push('redo'),
  };
};

for (const action of ['undo', 'redo']) {
  test(`${action} is acknowledged by the exact focused app document`, async () => {
    const main = { webContents: pageContents() };
    const mini = { webContents: pageContents() };
    const received = [];
    for (const appWindow of [main, mini]) {
      const renderer = new EventTarget();
      renderer.addEventListener('openchamber:history-action', (event) => {
        received.push([appWindow, event.detail]);
        event.preventDefault();
      });
      appWindow.webContents.executeJavaScript = (script, userGesture) => {
        assert.equal(userGesture, true);
        return Promise.resolve(runInNewContext(script, { window: renderer, CustomEvent }));
      };
    }
    let focused = main.webContents;
    const handle = createHistoryMenuAction({ getFocusedWebContents: () => focused, getAppWindows: () => [main, mini] });
    await handle(action);
    focused = mini.webContents;
    await handle(action);
    assert.deepEqual(received, [[main, action], [mini, action]]);
    assert.deepEqual(main.webContents.calls, []);
    assert.deepEqual(mini.webContents.calls, []);
  });

  test(`${action} falls back to native for an app document that declines`, async () => {
    const focused = pageContents();
    focused.executeJavaScript = (script) => Promise.resolve(runInNewContext(script, { window: new EventTarget(), CustomEvent }));
    await createHistoryMenuAction({ getFocusedWebContents: () => focused, getAppWindows: () => [{ webContents: focused }] })(action);
    assert.deepEqual(focused.calls, [action]);
  });

  for (const host of [null, pageContents()]) {
    test(`${action} stays native for DevTools/guests with ${host ? 'a host' : 'no host'}`, async () => {
      const app = { webContents: pageContents() };
      const focused = pageContents(host);
      await createHistoryMenuAction({ getFocusedWebContents: () => focused, getAppWindows: () => [app] })(action);
      assert.deepEqual(focused.calls, [action]);
      assert.deepEqual(app.webContents.calls, []);
    });
  }

  test(`${action} does nothing with no focused webContents`, async () => {
    await createHistoryMenuAction({ getFocusedWebContents: () => null, getAppWindows: () => { throw new Error('unexpected lookup'); } })(action);
  });

  test(`${action} does not fall back after a failed renderer handoff`, async () => {
    const focused = pageContents();
    focused.executeJavaScript = () => Promise.reject(new Error('renderer gone'));
    await createHistoryMenuAction({ getFocusedWebContents: () => focused, getAppWindows: () => [{ webContents: focused }] })(action);
    assert.deepEqual(focused.calls, []);
  });

  for (const changed of ['focus', 'destroyed']) {
    test(`${action} does not apply native fallback after ${changed} changes`, async () => {
      const focused = pageContents();
      let current = focused;
      focused.executeJavaScript = async () => {
        if (changed === 'focus') current = pageContents();
        else focused.isDestroyed = () => true;
        return false;
      };
      await createHistoryMenuAction({ getFocusedWebContents: () => current, getAppWindows: () => [{ webContents: focused }] })(action);
      assert.deepEqual(focused.calls, []);
    });
  }
}

test('history menu items preserve localized labels and platform accelerators without native roles', () => {
  for (const locale of Object.keys(MENU_LOCALE_DICTIONARIES)) {
    for (const platform of ['darwin', 'win32', 'linux']) {
      const calls = [];
      const items = createHistoryMenuItems(locale, platform, (action) => calls.push(action));
      assert.deepEqual(items.map((item) => item.label), [menuLabel(locale, 'undo'), menuLabel(locale, 'redo')]);
      assert.deepEqual(items.map((item) => item.accelerator), ['CommandOrControl+Z', platform === 'win32' ? 'Control+Y' : 'Shift+CommandOrControl+Z']);
      for (const item of items) {
        assert.equal(item.role, undefined);
        item.click();
      }
      assert.deepEqual(calls, ['undo', 'redo']);
    }
  }
});

test('editable context menus offer localized history even when native history is empty', () => {
  for (const locale of Object.keys(MENU_LOCALE_DICTIONARIES)) {
    for (const platform of ['darwin', 'win32', 'linux']) {
      const calls = [];
      const items = createHistoryContextMenuItems({ isEditable: true, editFlags: { canUndo: false, canRedo: false } }, locale, platform, action => calls.push(action));
      assert.deepEqual(items.slice(0, 2).map(item => item.label), [menuLabel(locale, 'undo'), menuLabel(locale, 'redo')]);
      assert.deepEqual(items[2], { type: 'separator' });
      for (const item of items.slice(0, 2)) {
        assert.equal(item.role, undefined);
        assert.notEqual(item.enabled, false);
        item.click();
      }
      assert.deepEqual(calls, ['undo', 'redo']);
    }
  }
});

test('non-editable context menus do not add history commands', () => {
  for (const properties of [{}, { isEditable: false }]) {
    assert.deepEqual(createHistoryContextMenuItems(properties, 'en', 'win32', () => assert.fail('unexpected action')), []);
  }
});

test('Mini Chat context Undo/Redo reaches only its focused composer document', async () => {
  const main = { webContents: pageContents() };
  const mini = { webContents: pageContents() };
  const received = [];
  const renderer = new EventTarget();
  renderer.addEventListener('openchamber:history-action', event => {
    received.push(event.detail);
    event.preventDefault();
  });
  main.webContents.executeJavaScript = () => assert.fail('must not change the main editor');
  mini.webContents.executeJavaScript = script => Promise.resolve(runInNewContext(script, { window: renderer, CustomEvent }));
  const handle = createHistoryMenuAction({ getFocusedWebContents: () => mini.webContents, getAppWindows: () => [main, mini] });
  const pending = [];
  const items = createHistoryContextMenuItems({ isEditable: true }, 'en', 'win32', action => pending.push(handle(action)));
  items[0].click();
  items[1].click();
  await Promise.all(pending);
  assert.deepEqual(received, ['undo', 'redo']);
  assert.deepEqual(main.webContents.calls, []);
  assert.deepEqual(mini.webContents.calls, []);
});

test('ordinary settings inputs keep native history through the shared context menu', async () => {
  const focused = pageContents();
  focused.executeJavaScript = script => Promise.resolve(runInNewContext(script, { window: new EventTarget(), CustomEvent }));
  const handle = createHistoryMenuAction({ getFocusedWebContents: () => focused, getAppWindows: () => [{ webContents: focused }] });
  const pending = [];
  const items = createHistoryContextMenuItems({ isEditable: true }, 'en', 'darwin', action => pending.push(handle(action)));
  items[0].click();
  items[1].click();
  await Promise.all(pending);
  assert.deepEqual(focused.calls, ['undo', 'redo']);
});
