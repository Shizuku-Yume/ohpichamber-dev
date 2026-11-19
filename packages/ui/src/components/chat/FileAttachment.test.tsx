import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { FormEvent } from 'react';
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
const { AttachedFilesList, MessageFilesDisplay } = await import('./FileAttachment');
const { useInputStore } = await import('@/sync/input-store');

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

test('removing a draft image does not submit the composer form', async () => {
  const image = new File(['fixture'], 'draft.png', { type: 'image/png' });
  const submit = mock((event: FormEvent<HTMLFormElement>) => event.preventDefault());
  useInputStore.getState().setAttachedFiles([{
    id: 'draft-image',
    file: image,
    dataUrl: 'data:image/png;base64,Zml4dHVyZQ==',
    mimeType: image.type,
    filename: image.name,
    size: image.size,
    source: 'local',
  }]);
  try {
    await act(async () => {
      root.render(<I18nProvider><form onSubmit={submit}><AttachedFilesList /></form></I18nProvider>);
    });
    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Remove draft.png"]');
    expect(remove?.type).toBe('button');
    await act(async () => remove?.click());
    expect(useInputStore.getState().attachedFiles).toEqual([]);
    expect(submit).not.toHaveBeenCalled();
  } finally {
    useInputStore.getState().clearAttachedFiles();
  }
});

<<<<<<< HEAD
describe('canonical MessageFilesDisplay attachments', () => {
  for (const compact of [false, true]) {
    test(`text attachment reads native bytes in ${compact ? 'compact' : 'full'} mode`, async () => {
      const part = file();
      await renderFiles([part], compact);
      const chip = namedChip(part.name);
||||||| bc50ba56aa
    const chip = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes('pasted-context-1.txt'));
    expect(chip).toBeDefined();
    await clickChip(chip!);

    expect(popups).toHaveLength(1);
    expect(popups[0].open).toBe(true);
    expect(popups[0].title).toBe('pasted-context-1.txt');
    expect(popups[0].content).toBe('hello pasted world');
    expect(popups[0].image).toBeUndefined();
  });

  test('a compact text chip is clickable and opens the same popup', async () => {
    await renderFiles([file()], true);

    const chip = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes('pasted-context-1.txt'));
    expect(chip).toBeDefined();
    await clickChip(chip!);

    expect(popups).toHaveLength(1);
    expect(popups[0].content).toBe('hello pasted world');
    expect(popups[0].image).toBeUndefined();
  });

  test('multibyte content survives the data URL decode', async () => {
    const content = 'héllo 模板 — second line';
    await renderFiles([file({ url: textDataUrl(content) })], false);

    const chip = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes('pasted-context-1.txt'));
    await clickChip(chip!);

    expect(popups[0].content).toBe(content);
  });

  test('a compact image thumbnail keeps the image popup payload', async () => {
    await renderFiles([file({ mime: 'image/png', filename: 'shot.png', url: 'data:image/png;base64,aGVsbG8=' })], true);

    const chip = [...container.querySelectorAll('button')].find((entry) => entry.getAttribute('aria-label') === 'shot.png');
    expect(chip).toBeDefined();
    await clickChip(chip!);

    expect(popups).toHaveLength(1);
    expect(popups[0].content).toBe('');
    expect(popups[0].image?.url).toBe('data:image/png;base64,aGVsbG8=');
    expect(popups[0].image?.mimeType).toBe('image/png');
  });

  test('a pdf chip keeps today\'s behavior', async () => {
    await renderFiles([file({ mime: 'application/pdf', filename: 'doc.pdf', url: 'data:application/pdf;base64,aGVsbG8=' })], false);

    const chip = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes('doc.pdf'));
    expect(chip).toBeDefined();
    await clickChip(chip!);

    expect(popups).toHaveLength(1);
    expect(popups[0].content).toBe('');
    expect(popups[0].image?.filename).toBe('doc.pdf');
  });

  test('a compact pdf chip stays a non-clickable chip', async () => {
    await renderFiles([file({ mime: 'application/pdf', filename: 'doc.pdf', url: 'data:application/pdf;base64,aGVsbG8=' })], true);

    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.find((entry) => entry.textContent?.includes('doc.pdf'))).toBeUndefined();
    expect(container.textContent).toContain('doc.pdf');
  });

  test('a compact chip of a file attached by path opens that file instead of an image preview', async () => {
    const opened: Array<{ directory: string; path: string }> = [];
    const original = useUIStore.getState().openContextFile;
    useUIStore.setState({ openContextFile: (directory, path) => { opened.push({ directory, path }); } });
    try {
      await renderFiles([file({ filename: 'notes.md', url: 'file:///repo/docs/notes.md' })], true);

      const chip = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes('notes.md'));
=======
    const chip = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes('pasted-context-1.txt'));
    expect(chip).toBeDefined();
    await clickChip(chip!);

    expect(popups).toHaveLength(1);
    expect(popups[0].open).toBe(true);
    expect(popups[0].title).toBe('pasted-context-1.txt');
    expect(popups[0].content).toBe('hello pasted world');
    expect(popups[0].image).toBeUndefined();
  });

  test('a compact text chip is clickable and opens the same popup', async () => {
    await renderFiles([file()], true);

    const chip = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes('pasted-context-1.txt'));
    expect(chip).toBeDefined();
    await clickChip(chip!);

    expect(popups).toHaveLength(1);
    expect(popups[0].content).toBe('hello pasted world');
    expect(popups[0].image).toBeUndefined();
  });

  test('multibyte content survives the data URL decode', async () => {
    const content = 'héllo 模板 — second line';
    await renderFiles([file({ url: textDataUrl(content) })], false);

    const chip = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes('pasted-context-1.txt'));
    await clickChip(chip!);

    expect(popups[0].content).toBe(content);
  });

  test('a compact image thumbnail keeps the image popup payload', async () => {
    await renderFiles([file({ mime: 'image/png', filename: 'shot.png', url: 'data:image/png;base64,aGVsbG8=' })], true);

    const chip = [...container.querySelectorAll('button')].find((entry) => entry.getAttribute('aria-label') === 'shot.png');
    expect(chip).toBeDefined();
    await clickChip(chip!);

    expect(popups).toHaveLength(1);
    expect(popups[0].content).toBe('');
    expect(popups[0].image?.url).toBe('data:image/png;base64,aGVsbG8=');
    expect(popups[0].image?.mimeType).toBe('image/png');
  });

  for (const compact of [false, true]) {
    test(`a ${compact ? 'compact ' : ''}pdf sent inline opens the document dialog`, async () => {
      await renderFiles([file({ mime: 'application/pdf', filename: 'doc.pdf', url: 'data:application/pdf;base64,aGVsbG8=' })], compact);

      const chip = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes('doc.pdf'));
      expect(chip?.hasAttribute('disabled')).toBe(false);
      await clickChip(chip!);

      expect(popups).toHaveLength(1);
      expect(popups[0].image).toBeUndefined();
      expect(popups[0].document).toEqual({ url: 'data:application/pdf;base64,aGVsbG8=', filename: 'doc.pdf' });
    });
  }

  test('a compact chip of a file attached by path opens that file instead of an image preview', async () => {
    const opened: Array<{ directory: string; path: string }> = [];
    const original = useUIStore.getState().openContextFile;
    useUIStore.setState({ openContextFile: (directory, path) => { opened.push({ directory, path }); } });
    try {
      await renderFiles([file({ filename: 'notes.md', url: 'file:///repo/docs/notes.md' })], true);

      const chip = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes('notes.md'));
>>>>>>> upstream/main
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
  test('leaving the attachment view revokes an open file preview object URL', async () => {
    const pdf = file({ mediaType: 'application/pdf', name: 'doc.pdf' });
    await renderFiles([pdf], false);
    await clickChip(namedChip(pdf.name)!);
    const url = popups[0].image!.url;
    await renderFiles([], false);
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
  });
  test('full image cards open the authenticated gallery with image metadata', async () => {
    const first = file({ mediaType: 'image/png', name: 'shot.png' });
    const second = file({ mediaType: 'image/jpeg', name: 'second.jpg' });
    await renderFiles([first, second], false);
    const card = container.querySelector('[aria-label="second.jpg"]');
    expect(card).not.toBeNull();
    await clickChip(card!);
    expect(popups).toHaveLength(1);
    expect(popups[0].image).toMatchObject({ mimeType: 'image/jpeg', filename: 'second.jpg', index: 1 });
    expect(popups[0].image?.gallery).toHaveLength(2);
  });
  test('compact PDF chips read authenticated native bytes and open the media preview', async () => {
    const pdf = file({ mediaType: 'application/pdf', name: 'doc.pdf' });
    await renderFiles([pdf], true);
    const chip = namedChip(pdf.name);
    expect(chip).toBeDefined();
    await clickChip(chip!);
    expect(readAttachment.mock.calls).toEqual([['workspace-native', pdf.attachmentId]]);
    expect(popups).toHaveLength(1);
    expect(popups[0].image).toMatchObject({ filename: 'doc.pdf', mimeType: 'application/pdf' });
  });
  test('compact file chip shows the file icon, truncated name and size label', async () => {
    const part = file({ name: 'quarterly-report-2026.txt' }, 'abc');
    await renderFiles([part], true);
    const chip = namedChip(part.name);
    expect(chip).toBeDefined();
    expect(chip!.textContent).toContain(part.name);
    expect(chip!.textContent).toContain('3 B');
    expect(chip!.querySelector('svg')).not.toBeNull();
    expect(chip!.querySelector('.truncate')?.textContent).toBe(part.name);
  });
  test('compact PDF download saves the authenticated bytes under the attachment name', async () => {
    const pdf = file({ mediaType: 'application/pdf', name: 'doc.pdf' });
    const saved: Array<{ name: string | null; href: string | null }> = [];
    const captureDownload = (event: Event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[download]') : null;
      if (!anchor) return;
      saved.push({ name: anchor.getAttribute('download'), href: anchor.getAttribute('href') });
      event.preventDefault();
    };
    document.addEventListener('click', captureDownload, true);
    try {
      await renderFiles([pdf], true);
      const download = container.querySelector<HTMLButtonElement>('button[aria-label="Download"]');
      expect(download).not.toBeNull();
      await clickChip(download!);
      const flushed = Promise.withResolvers<void>();
      setTimeout(flushed.resolve, 0);
      await act(async () => { await flushed.promise; });
      expect(readAttachment.mock.calls).toEqual([['workspace-native', pdf.attachmentId]]);
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe('doc.pdf');
      expect(saved[0].href?.startsWith('blob:attachment-test-')).toBe(true);
      expect(revokeObjectURL).toHaveBeenCalledWith(saved[0].href!);
    } finally {
      document.removeEventListener('click', captureDownload, true);
    }
  });
  test('compact media chips forward the native media type to the preview', async () => {
    const clip = file({ mediaType: 'audio/mpeg', name: 'clip.mp3' });
    await renderFiles([clip], true);
    await clickChip(namedChip(clip.name)!);
    expect(readAttachment.mock.calls).toEqual([['workspace-native', clip.attachmentId]]);
    expect(popups[0].image).toMatchObject({ filename: 'clip.mp3', mimeType: 'audio/mpeg' });
  });
  test('a failed compact PDF read reports the failure without opening a popup', async () => {
    const pdf = file({ mediaType: 'application/pdf', name: 'doc.pdf' });
    const errorToast = spyOn(toast, 'error');
    try {
      readAttachment.mockRejectedValueOnce(new Error('denied'));
      await renderFiles([pdf], true);
      await clickChip(namedChip(pdf.name)!);
      expect(popups).toHaveLength(0);
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(errorToast).toHaveBeenCalled();
    } finally {
      errorToast.mockRestore();
    }
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
