/**
 * Path handling for composer attachments.
 *
 * Two representations meet here: what the user sees in the prompt (a
 * project-relative mention) and what the OpenCode server is given (a
 * `file://` URL).
 */

const FILE_URI_PREFIX = 'file://';

/**
 * Percent-encode a path for use in a `file://` URL, leaving separators intact
 * and preserving a Windows drive letter, which must not be encoded.
 */
export function encodeFilePath(filepath: string): string {
    let normalized = filepath.replace(/\\/g, '/');
    if (/^[A-Za-z]:/.test(normalized)) {
        normalized = `/${normalized}`;
    }
    return normalized
        .split('/')
        .map((segment, index) => {
            if (index === 1 && /^[A-Za-z]:$/.test(segment)) return segment;
            return encodeURIComponent(segment);
        })
        .join('/');
}

/** The `file://` URL the server resolves an attachment from. */
export function toServerFileUrl(filepath: string): string {
    const normalized = filepath.replace(/\\/g, '/').trim();
    if (normalized.toLowerCase().startsWith(FILE_URI_PREFIX)) {
        return normalized;
    }
    return `file://${encodeFilePath(normalized)}`;
}

export { normalizePath } from '@/lib/pathNormalization';

/**
 * Express an absolute path relative to the project root, so the prompt carries
 * the path the user recognizes. Paths outside the root are left absolute.
 */
export function toProjectRelativeMentionPath(absolutePath: string, root: string): string {
    const normalizedAbsolutePath = absolutePath.replace(/\\/g, '/').trim();
    const normalizedRoot = (root || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalizedRoot) return normalizedAbsolutePath;
    if (normalizedAbsolutePath === normalizedRoot) return normalizedAbsolutePath;

    const rootWithSlash = `${normalizedRoot}/`;
    return normalizedAbsolutePath.startsWith(rootWithSlash)
        ? normalizedAbsolutePath.slice(rootWithSlash.length)
        : normalizedAbsolutePath;
}

