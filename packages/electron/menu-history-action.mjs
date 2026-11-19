import { menuLabel } from './menu-locales.mjs';

export const createHistoryMenuAction = ({ getFocusedWebContents, getAppWindows }) => async (action) => {
  const focused = getFocusedWebContents();
  if (!focused) return;
  const appWindow = getAppWindows().find((window) => window.webContents === focused);
  if (appWindow) {
    try {
      const handled = await focused.executeJavaScript(
        `!window.dispatchEvent(new CustomEvent('openchamber:history-action', { detail: ${JSON.stringify(action)}, cancelable: true }))`,
        true,
      );
      if (handled !== false) return;
    } catch {
      // A failed renderer handoff must not undo a different native history.
      return;
    }
    if (focused.isDestroyed() || getFocusedWebContents() !== focused) return;
  }
  focused[action]();
};

export const createHistoryMenuItems = (locale, platform, onAction) => [
  {
    label: menuLabel(locale, 'undo'),
    accelerator: 'CommandOrControl+Z',
    click: () => { void onAction('undo'); },
  },
  {
    label: menuLabel(locale, 'redo'),
    accelerator: platform === 'win32' ? 'Control+Y' : 'Shift+CommandOrControl+Z',
    click: () => { void onAction('redo'); },
  },
];
