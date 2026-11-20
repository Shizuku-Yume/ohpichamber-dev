import { describe, expect, mock, test } from 'bun:test';

import { assignImageAttachmentFilenames, buildAttachmentCitationText, buildImagePathCitationText, findAttachmentCitationRanges, findLocalFileLinks, isGenericImageFilename, nextPastedContextFilename } from '../attachmentCitations';

const decodeHeic = async (): Promise<Blob> => new Blob(['jpeg-data'], { type: 'image/jpeg' });

mock.module('heic2any', () => ({
    default: async () => decodeHeic(),
}));

describe('attachment citations', () => {
    test('keeps meaningful image names', () => {
        expect(assignImageAttachmentFilenames([
            { name: 'desktop_without_icons.jpg', type: 'image/jpeg' },
        ], [])).toEqual(['desktop_without_icons.jpg']);
    });

    test('renames generic clipboard image names', () => {
        expect(assignImageAttachmentFilenames([
            { name: 'image.png', type: 'image/png' },
            { name: 'Screenshot.png', type: 'image/png' },
        ], [])).toEqual(['image-1.png', 'image-2.png']);
    });

    test('deduplicates meaningful names inside pending attachments', () => {
        expect(assignImageAttachmentFilenames([
            { name: 'desktop.jpg', type: 'image/jpeg' },
            { name: 'desktop.jpg', type: 'image/jpeg' },
        ], ['desktop-2.jpg'])).toEqual(['desktop.jpg', 'desktop-3.jpg']);
    });

    test('continues generated image indexes from existing pending attachments', () => {
        expect(assignImageAttachmentFilenames([
            { name: 'image.png', type: 'image/png' },
            { name: '', type: 'image/webp' },
        ], ['image-1.png'])).toEqual(['image-2.png', 'image-3.webp']);
    });

    test('detects generic names narrowly', () => {
        expect(isGenericImageFilename('image.png')).toBe(true);
        expect(isGenericImageFilename('Screenshot (1).png')).toBe(true);
        expect(isGenericImageFilename('Screen Shot.png')).toBe(true);
        expect(isGenericImageFilename('Screenshot 2026-05-24.png')).toBe(false);
        expect(isGenericImageFilename('desktop_without_icons.jpg')).toBe(false);
    });

    test('builds bracket citations', () => {
        expect(buildAttachmentCitationText(['desktop.jpg', 'icon.png'])).toBe('[desktop.jpg] [icon.png]');
    });

    test('finds active attachment citation ranges', () => {
        expect(findAttachmentCitationRanges(
            'desktop [desktop.jpg] link [desktop.jpg](https://example.com) missing [other.jpg]',
            ['desktop.jpg'],
        )).toEqual([{ start: 8, end: 21 }]);
    });

    test('assigns sequential pasted-context filenames', () => {
        expect(nextPastedContextFilename([])).toBe('pasted-context-1.txt');
        expect(nextPastedContextFilename(['pasted-context-1.txt', 'notes.md'])).toBe('pasted-context-2.txt');
        expect(nextPastedContextFilename(['PASTED-CONTEXT-2.TXT'])).toBe('pasted-context-1.txt');
    });
});

describe('links to files on disk', () => {
    test('finds the saved-image links the composer writes, plain and in angle brackets', () => {
        const text = `see ${buildImagePathCitationText([{ filename: 'a.png', path: '/tmp/oc/a.png' }, { filename: 'b.png', path: 'C:\\Temp dir\\b.png' }])}`;
        expect(findLocalFileLinks(text).map(({ name, path }) => ({ name, path }))).toEqual([
            { name: 'a.png', path: '/tmp/oc/a.png' },
            { name: 'b.png', path: 'C:/Temp dir/b.png' },
        ]);
    });

    test('leaves links to the web alone', () => {
        expect(findLocalFileLinks('[docs](https://example.com/a.png)')).toEqual([]);
    });
});
