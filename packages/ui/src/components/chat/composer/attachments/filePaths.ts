
const FILE_URI_PREFIX = 'file://';

/** POSIX root, UNC share, or Windows drive letter. */
export function isLikelyAbsolutePath(value: string): boolean {
    return value.startsWith('/')
        || value.startsWith('\\\\')
        || /^[A-Za-z]:[\\/]/.test(value);
}

/** Turn a dropped `file://` URI back into a plain path. */
export function normalizeDroppedPath(rawPath: string): string {
 const input = rawPath.trim();
 if (!input.toLowerCase().startsWith(FILE_URI_PREFIX)) {
  return input;
 }

 try {
  let pathname = decodeURIComponent(new URL(input).pathname || '');
  // file:///C:/... parses with a leading slash before the drive letter.
  if (/^\/[A-Za-z]:\//.test(pathname)) {
   pathname = pathname.slice(1);
  }
  return pathname || input;
 } catch {
  const stripped = input.replace(/^file:\/\//i, '');
  try {
   return decodeURIComponent(stripped);
  } catch {
   return stripped;
  }
 }
}

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
