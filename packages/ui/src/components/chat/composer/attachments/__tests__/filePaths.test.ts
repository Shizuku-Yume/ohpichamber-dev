import { describe, expect, test } from 'bun:test';

import {
    encodeFilePath,
    normalizePath,
    toProjectRelativeMentionPath,
    toServerFileUrl,
} from '../filePaths';

describe('encodeFilePath', () => {
    test('encodes segments but keeps separators', () => {
        expect(encodeFilePath('/a/b c/d.txt')).toBe('/a/b%20c/d.txt');
    });

    test('backslashes become forward slashes', () => {
        expect(encodeFilePath('a\\b\\c.txt')).toBe('a/b/c.txt');
    });

    test('a Windows drive letter is preserved unencoded', () => {
        expect(encodeFilePath('C:\\Users\\me\\a b.txt')).toBe('/C:/Users/me/a%20b.txt');
    });

    test('special characters in a name are encoded', () => {
        expect(encodeFilePath('/a/b#c?d.txt')).toBe('/a/b%23c%3Fd.txt');
    });
});

describe('toServerFileUrl', () => {
    test('wraps a plain path', () => {
        expect(toServerFileUrl('/repo/a.ts')).toBe('file:///repo/a.ts');
    });

    test('an existing file URL is passed through unchanged', () => {
        expect(toServerFileUrl('file:///repo/a.ts')).toBe('file:///repo/a.ts');
        expect(toServerFileUrl('FILE:///repo/a.ts')).toBe('FILE:///repo/a.ts');
    });

    test('a Windows path becomes a valid file URL', () => {
        expect(toServerFileUrl('C:\\repo\\a.ts')).toBe('file:///C:/repo/a.ts');
    });
});

describe('normalizePath', () => {
    test('trims and drops a trailing separator', () => {
        expect(normalizePath('  /repo/dir/  ')).toBe('/repo/dir');
        expect(normalizePath('/repo/dir///')).toBe('/repo/dir');
    });

    test('backslashes become forward slashes', () => {
        expect(normalizePath('C:\\repo\\dir')).toBe('C:/repo/dir');
    });

    test('the root keeps its slash', () => {
        expect(normalizePath('/')).toBe('/');
    });

    test('blank and non-string input yield null', () => {
        expect(normalizePath('')).toBeNull();
        expect(normalizePath('   ')).toBeNull();
        expect(normalizePath(null)).toBeNull();
        expect(normalizePath(undefined)).toBeNull();
    });
});

describe('toProjectRelativeMentionPath', () => {
    test('strips the project root', () => {
        expect(toProjectRelativeMentionPath('/repo/src/a.ts', '/repo')).toBe('src/a.ts');
    });

    test('tolerates a trailing slash on the root', () => {
        expect(toProjectRelativeMentionPath('/repo/src/a.ts', '/repo/')).toBe('src/a.ts');
    });

    test('a path outside the root stays absolute', () => {
        expect(toProjectRelativeMentionPath('/other/a.ts', '/repo')).toBe('/other/a.ts');
    });

    test('a sibling directory sharing a prefix is not treated as inside', () => {
        expect(toProjectRelativeMentionPath('/repo-other/a.ts', '/repo')).toBe('/repo-other/a.ts');
    });

    test('the root itself is returned unchanged', () => {
        expect(toProjectRelativeMentionPath('/repo', '/repo')).toBe('/repo');
    });

    test('with no root the path is left alone', () => {
        expect(toProjectRelativeMentionPath('/repo/src/a.ts', '')).toBe('/repo/src/a.ts');
    });
});
