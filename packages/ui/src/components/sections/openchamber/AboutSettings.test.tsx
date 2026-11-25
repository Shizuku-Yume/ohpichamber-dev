import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  sessionStorage: browser.sessionStorage,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event,
  MouseEvent: browser.MouseEvent,
  FocusEvent: browser.FocusEvent,
  CustomEvent: browser.CustomEvent,
  KeyboardEvent: browser.KeyboardEvent,
  PointerEvent: browser.PointerEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  IntersectionObserver: class { observe() { } unobserve() { } disconnect() { } },
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// React DOM must evaluate after happy-dom installs browser globals into globalThis.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const runtimeFetchModule = await import('@/lib/runtime-fetch');
const desktopModule = await import('@/lib/desktop');
const releaseNotesModule = await import('@/components/update/releaseNotes');
const { AboutSettings } = await import('./AboutSettings');
const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');

type SystemInfoBody = {
  openchamberVersion?: string;
  ompVersion?: string | null;
  runtime?: string;
  pid?: number;
  startedAt?: string;
};

const systemInfoResponse = (body: SystemInfoBody) =>
  new Response(JSON.stringify({ runtime: 'web', pid: 1, startedAt: '2026-01-01T00:00:00.000Z', ...body }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const settle = async () => {
  await act(async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 20);
    await promise;
  });
};

describe('AboutSettings', () => {
  let host: HTMLDivElement;
  let root: Root;
  let fetchSpy: ReturnType<typeof spyOn>;
  let electronSpy: ReturnType<typeof spyOn>;
  let releaseNotesSpy: ReturnType<typeof spyOn>;
  let systemInfo: SystemInfoBody;
  let electronShellActive: boolean;

  const render = async () => {
    await act(async () => {
      root.render(
        <ThemeSystemProvider>
          <I18nProvider>
            <AboutSettings />
          </I18nProvider>
        </ThemeSystemProvider>,
      );
    });
    await settle();
  };

  beforeEach(() => {
    systemInfo = { openchamberVersion: '1.4.2', ompVersion: '19.1.0' };
    electronShellActive = false;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    fetchSpy = spyOn(runtimeFetchModule, 'runtimeFetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/system/info')) {
        return systemInfoResponse(systemInfo);
      }
      return new Response('not found', { status: 404 });
    });
    electronSpy = spyOn(desktopModule, 'isElectronShell').mockImplementation(() => electronShellActive);
    releaseNotesSpy = spyOn(releaseNotesModule, 'fetchReleaseNotes').mockResolvedValue(null);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    fetchSpy.mockRestore();
    electronSpy.mockRestore();
    releaseNotesSpy.mockRestore();
  });

  test('shows the server version and the OMP runtime version from /api/system/info', async () => {
    await render();
    const text = host.textContent ?? '';
    expect(text).toContain('1.4.2');
    expect(text).toContain('19.1.0');
  });

  test('names OpenChamber and ShizukuYume in the attribution and never OhPiChamber-as-upstream', async () => {
    await render();
    const text = host.textContent ?? '';
    expect(text).toContain('Based on OpenChamber');
    expect(text).toContain('ShizukuYume');
    expect(text).not.toContain('Based on OhPiChamber');
  });

  test('links GitHub to the fork and OpenChamber to upstream', async () => {
    await render();
    const anchors = Array.from(host.querySelectorAll('a'));
    const hrefs = anchors.map((anchor) => anchor.getAttribute('href'));
    expect(hrefs.some((href) => href !== null && href.startsWith('https://github.com/Shizuku-Yume/ohpichamber'))).toBe(true);
    expect(hrefs.some((href) => href === 'https://github.com/openchamber/openchamber')).toBe(true);
    // The upstream repo must never be presented as the fork's own home.
    const githubLink = anchors.find((anchor) => anchor.textContent?.includes('GitHub'));
    expect(githubLink?.getAttribute('href')).toBe('https://github.com/Shizuku-Yume/ohpichamber');
  });

  test('aligns every fact row on the left of the control column (alignEnd off)', async () => {
    await render();
    // SettingsFieldRow with alignEnd={false} must not justify the control to
    // the trailing edge; upstream alignment keeps version facts in one column.
    const offenders = Array.from(host.querySelectorAll('[class]')).filter((element) =>
      (element.getAttribute('class') ?? '').split(/\s+/).some((cls) => cls === '@xl:justify-end' || cls.endsWith(':justify-end')),
    );
    expect(offenders).toHaveLength(0);
  });

  test('hides the OMP version row when the runtime reports none', async () => {
    systemInfo = { openchamberVersion: '1.4.2', ompVersion: null };
    await render();
    const text = host.textContent ?? '';
    expect(text).toContain('1.4.2');
    expect(text).not.toContain('OMP version');
  });

  test('shows the copyright license credit without a redundant upstream block', async () => {
    await render();
    const text = host.textContent ?? '';
    expect(text).toContain('Copyright (c) 2025 Bohdan Triapitsyn');
  });

  test('renders no update-check control or channel switch even on the Electron shell', async () => {
    electronShellActive = true;
    await render();
    const text = host.textContent ?? '';
    const buttons = Array.from(host.querySelectorAll('button'));
    const labels = buttons.map((button) => button.textContent ?? '');
    expect(labels.some((label) => label.includes('Check updates'))).toBe(false);
    expect(text).not.toContain('Check updates');
    expect(text).not.toContain('Canary');
    expect(text).not.toContain('is available');
  });
});

describe('AboutReleaseNotes releases link', () => {
  test('the releases URL points at the fork repository, never upstream', async () => {
    const { ABOUT_GITHUB_RELEASES_URL } = await import('./AboutReleaseNotes');
    expect(ABOUT_GITHUB_RELEASES_URL).toBe('https://github.com/Shizuku-Yume/ohpichamber/releases');
    expect(ABOUT_GITHUB_RELEASES_URL).not.toContain('openchamber/openchamber');
  });
});
