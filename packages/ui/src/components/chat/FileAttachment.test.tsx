import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { AttachmentPart, Part } from '@openchamber/agent-contract';
import type { ToolPopupContent } from './message/types';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement, HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event, FocusEvent: browser.FocusEvent, CustomEvent: browser.CustomEvent, MouseEvent: browser.MouseEvent,
  MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// Browser-dependent modules must initialize after this test installs its DOM.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { TooltipProvider } = await import('@/components/ui/tooltip');
const { canonicalClient } = await import('@/api/canonicalClient');
const { toast } = await import('@/components/ui');
const { MessageFilesDisplay } = await import('./FileAttachment');

const blobs = new Map<string, Blob>();
const readAttachment = spyOn(canonicalClient, 'readAttachment').mockImplementation(async (_workspaceId, attachmentId) => {
  const blob = blobs.get(attachmentId);
  if (!blob) throw new Error('Attachment unavailable');
  return blob;
});
let urlSequence = 0;
const createObjectURL = spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:attachment-test-${++urlSequence}`);
const revokeObjectURL = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

let fileSequence = 0;
const file = (overrides: Partial<AttachmentPart> = {}, content = 'hello pasted world'): AttachmentPart => {
  fileSequence += 1;
  const attachmentId = `upload-${fileSequence}`;
  const part: AttachmentPart = {
    partId: `part-${fileSequence}`, type: 'attachment', attachmentId,
    name: 'pasted-context-1.txt', mediaType: 'text/plain', size: new TextEncoder().encode(content).length,
    uri: `attachment://${attachmentId}`, ...overrides,
  };
  blobs.set(part.attachmentId, new Blob([content], { type: part.mediaType }));
  return part;
};

const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);
let popups: ToolPopupContent[] = [];
const renderFiles = async (files: Part[], compact: boolean, workspaceId = 'workspace-native') => {
  popups = [];
  await act(async () => {
    root.render(
      <I18nProvider>
        <TooltipProvider>
          <MessageFilesDisplay files={files} workspaceId={workspaceId} onShowPopup={(popup) => { popups.push(popup); }} compact={compact} />
        </TooltipProvider>
      </I18nProvider>,
    );
  });
};
const clickChip = async (chip: Element) => {
  await act(async () => { chip.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const namedChip = (name: string) => [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes(name));

beforeEach(async () => {
  await act(async () => root.render(null));
  blobs.clear();
  readAttachment.mockClear();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  popups = [];
});
afterAll(async () => {
  await act(async () => root.unmount());
  readAttachment.mockRestore();
  createObjectURL.mockRestore();
  revokeObjectURL.mockRestore();
  browser.close();
});

describe('canonical MessageFilesDisplay attachments', () => {
  for (const compact of [false, true]) {
    test(`text attachment reads native bytes in ${compact ? 'compact' : 'full'} mode`, async () => {
      const part = file();
      await renderFiles([part], compact);
      const chip = namedChip(part.name);
      expect(chip).toBeDefined();
      await clickChip(chip!);
      expect(readAttachment.mock.calls).toEqual([['workspace-native', part.attachmentId]]);
      expect(popups).toEqual([{ open: true, title: part.name, content: 'hello pasted world', language: 'text' }]);
      expect(createObjectURL).not.toHaveBeenCalled();
    });
  }
  test('multibyte native content survives the Blob decode', async () => {
    const content = 'héllo 模板 — second line';
    const part = file({}, content);
    await renderFiles([part], false);
    await clickChip(namedChip(part.name)!);
    expect(popups[0].content).toBe(content);
  });
  test('image thumbnails retain gallery metadata without a legacy part URL', async () => {
    const first = file({ mediaType: 'image/png', name: 'shot.png' });
    const second = file({ mediaType: 'image/jpeg', name: 'second.jpg' });
    await renderFiles([first, second], true);
    const chip = container.querySelector('[aria-label="shot.png"]');
    expect(chip).not.toBeNull();
    await clickChip(chip!);
    expect(popups).toHaveLength(1);
    expect(popups[0].image).toMatchObject({ mimeType: 'image/png', filename: 'shot.png', index: 0 });
    expect(popups[0].image?.url.startsWith('blob:attachment-test-')).toBe(true);
    expect(popups[0].image?.gallery).toHaveLength(2);
    expect('metadata' in popups[0]).toBe(false);
    const urls = popups[0].image!.gallery!.map((image) => image.url);
    await renderFiles([], true);
    for (const url of urls) expect(revokeObjectURL).toHaveBeenCalledWith(url);
  });
  test('full PDF preview reads authenticated native bytes and revokes replaced object URLs', async () => {
    const pdf = file({ mediaType: 'application/pdf', name: 'doc.pdf' });
    const text = file();
    await renderFiles([pdf, text], false);
    await clickChip(namedChip(pdf.name)!);
    const url = popups[0].image!.url;
    expect(popups[0].image).toMatchObject({ filename: 'doc.pdf', mimeType: 'application/pdf' });
    await clickChip(namedChip(text.name)!);
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
    expect(popups[1].content).toBe('hello pasted world');
  });
  test('compact PDFs remain display-only chips', async () => {
    await renderFiles([file({ mediaType: 'application/pdf', name: 'doc.pdf' })], true);
    expect(namedChip('doc.pdf')).toBeUndefined();
    expect(container.textContent).toContain('doc.pdf');
    expect(readAttachment).not.toHaveBeenCalled();
  });
  test('does not interpret native text or tool results as attachments', async () => {
    await renderFiles([
      { type: 'text', partId: 'text', content: 'not a file' },
      { type: 'tool_result', partId: 'result', toolCallId: 'call', toolName: 'read', isError: false, output: 'bytes' },
    ], false);
    expect(container.textContent).toBe('');
    expect(readAttachment).not.toHaveBeenCalled();
  });
  test('read failure reports an error without opening an empty success popup', async () => {
    const part = file();
    const errorToast = spyOn(toast, 'error');
    try {
      readAttachment.mockRejectedValueOnce(new Error('denied'));
      await renderFiles([part], false);
      await clickChip(namedChip(part.name)!);
      expect(popups).toHaveLength(0);
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(errorToast).toHaveBeenCalled();
    } finally {
      errorToast.mockRestore();
    }
  });
  test('a previous workspace read cannot open a popup after the addressed workspace changes', async () => {
    const part = file();
    let resolveRead: ((blob: Blob) => void) | undefined;
    readAttachment.mockImplementationOnce(() => new Promise<Blob>((resolve) => { resolveRead = resolve; }));
    await renderFiles([part], false, 'workspace-before');
    await clickChip(namedChip(part.name)!);
    await renderFiles([part], false, 'workspace-after');
    await act(async () => { resolveRead!(new Blob(['stale'])); });
    expect(popups).toHaveLength(0);
    expect(createObjectURL).not.toHaveBeenCalled();
    await clickChip(namedChip(part.name)!);
    expect(readAttachment.mock.calls.at(-1)).toEqual(['workspace-after', part.attachmentId]);
    expect(popups[0].content).toBe('hello pasted world');
  });
});

test('a failed native image read is visibly failed without allocating an empty preview', async () => {
  const part = file({ mediaType: 'image/png', name: 'failed.png' });
  readAttachment.mockRejectedValueOnce(new Error('denied'));
  await renderFiles([part], true);
  const thumbnail = container.querySelector<HTMLButtonElement>('[aria-label="failed.png"]');
  expect(thumbnail?.disabled).toBe(true);
  expect(thumbnail?.title).toBe('Failed to read file');
  expect(createObjectURL).not.toHaveBeenCalled();
  expect(popups).toHaveLength(0);
});

test('an image read completed after removal never creates a resource or popup', async () => {
  const part = file({ mediaType: 'image/png', name: 'removed.png' });
  let resolveRead: ((blob: Blob) => void) | undefined;
  readAttachment.mockImplementationOnce(() => new Promise<Blob>((resolve) => { resolveRead = resolve; }));
  await renderFiles([part], true);
  await renderFiles([], true);
  await act(async () => { resolveRead!(new Blob(['old image'])); });
  expect(createObjectURL).not.toHaveBeenCalled();
  expect(popups).toHaveLength(0);
});
