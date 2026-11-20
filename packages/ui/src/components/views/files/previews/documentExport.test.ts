import { describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { strFromU8, unzipSync } from 'fflate';

import { markdownToDocx, markdownToPrintableHtml, printHtml, rowsToXlsx } from './documentExport';
import { extractDocumentAttachments } from '@/sync/document-attachments';
import { openWorkbookDocument, sheetGrid } from './workbook/workbookSession';

describe('exporting', () => {
  for (const html of ['<p>Print me</p>', '']) test(`printing ${html ? 'a page' : 'an empty page'} cleans up after the dialog closes`, async () => {
    const dom = new Window({ settings: { disableIframePageLoading: true } });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.document });
    try {
      printHtml(html);
      const frame = document.querySelector('iframe');
      if (!frame) throw new Error('Print frame missing');
      const printed = mock(() => {});
      const view = Object.assign(new EventTarget(), { print: printed });
      Object.defineProperty(frame, 'contentWindow', { configurable: true, value: view });
      expect(frame.srcdoc).toBe(html);
      expect(frame.sandbox.contains('allow-scripts')).toBe(false);
      frame.onload?.(new Event('load'));
      expect(printed).toHaveBeenCalledTimes(1);
      view.dispatchEvent(new Event('afterprint'));
      expect(document.querySelector('iframe')).toBeNull();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
      else Reflect.deleteProperty(globalThis, 'document');
      await dom.happyDOM.close();
    }
  });

  test('a failed print removes its frame', async () => {
    const dom = new Window({ settings: { disableIframePageLoading: true } });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.document });
    try {
      printHtml('<p>Print me</p>');
      const frame = document.querySelector('iframe');
      if (!frame) throw new Error('Print frame missing');
      const view = Object.assign(new EventTarget(), { print: () => { throw new Error('Print failed'); } });
      Object.defineProperty(frame, 'contentWindow', { configurable: true, value: view });
      expect(() => frame.onload?.(new Event('load'))).toThrow('Print failed');
      expect(document.querySelector('iframe')).toBeNull();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
      else Reflect.deleteProperty(globalThis, 'document');
      await dom.happyDOM.close();
    }
  });

  const source = '# Title\n\nSome **bold** & `code`.\n\n- one\n- two\n\n| A | B |\n| --- | --- |\n| 1 | <x> |\n';

  test('Word holds the text, and our own reader takes it back', async () => {
    const bytes = await markdownToDocx(source);
    expect(strFromU8(unzipSync(bytes)['word/document.xml'])).toContain('<w:pStyle w:val="Heading1"/>');
    const text = await (await extractDocumentAttachments(new File([bytes], 'a.docx')))?.textFile.text();
    expect(text).toContain('Title');
    expect(text).toContain('Some bold & code.');
    expect(text).toContain('<x>');
  });

  test('the printable page escapes what the file says', () => {
    const html = markdownToPrintableHtml('a <script>x</script>\n\n`<b>`', 'T');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<code>&lt;b&gt;</code>');
  });

  test('a table becomes a workbook, numbers as numbers', async () => {
    const document = await openWorkbookDocument('a.xlsx', await rowsToXlsx('Data', [['name', 'age'], ['Ada', '36'], ['00', '']]));
    const sheet = document?.sheets[0];
    if (!sheet) throw new Error('no sheet');
    expect(sheetGrid(sheet, 10, false).rows).toEqual([['name', 'age'], ['Ada', '36'], ['00', '']]);
    expect(sheet.cells.get('2:1')?.kind).toBe('number');
  });
});
