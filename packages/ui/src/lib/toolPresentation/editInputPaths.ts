const TYPED_TAG_SUFFIX_RE = /#[0-9A-Fa-f]{4}$/;
const STREAMING_TAG_SUFFIX_RE = /#[0-9A-Fa-f]{0,4}$/;
const APPLY_PATCH_FILE_HEADER_RE = /^[ \t]*\*{3}[ \t]+(?:Add|Update|Delete)[ \t]+File:[ \t]*(.+)$/;
const APPLY_PATCH_MOVE_HEADER_RE = /^[ \t]*\*{3}[ \t]+Move[ \t]+to:[ \t]*(.+)$/;
const SLOPPY_FILE_HEADER_RE = /^[ \t]*\*{3}[ \t]+Edit[ \t]+File:[ \t]*(.+)$/i;
const HAS_APPLY_PATCH_HEADER_RE = /^[ \t]*\*{3}[ \t]+(?:Add|Update|Delete)[ \t]+File:/m;
const HAS_SLOPPY_HEADER_RE = /^[ \t]*\*{3}[ \t]+Edit[ \t]+File:/im;

function unquotePath(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.length >= 2) {
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        if ((first === '"' || first === "'") && first === last) {
            return trimmed.slice(1, -1).trim();
        }
    }
    return trimmed;
}

function normalizeHashlineTarget(raw: string, complete: boolean): string {
    const trimmed = raw.trim();
    const tagRe = complete ? TYPED_TAG_SUFFIX_RE : STREAMING_TAG_SUFFIX_RE;
    const match = tagRe.exec(trimmed);
    const withoutTag = match ? trimmed.slice(0, match.index) : trimmed;
    return unquotePath(withoutTag);
}

function pushUniquePath(paths: string[], candidate: string): void {
    const normalized = candidate.trim();
    if (normalized && !paths.includes(normalized)) {
        paths.push(normalized);
    }
}

/**
 * Extracts target file paths from freeform OMP `edit` / `apply_patch` payloads
 * (`hashline` `[path#TAG]` + `MV dest`, `apply_patch` `*** Add/Update/Delete File:` + `*** Move to:`,
 * and `sloppy` `*** Edit File:`). Tolerates mid-stream headers while the call is still running.
 */
export function parseEditInputPaths(rawInput: string): string[] {
    if (!rawInput) return [];
    const stripped = rawInput.startsWith('\uFEFF') ? rawInput.slice(1) : rawInput;
    const lines = stripped.split('\n');
    const paths: string[] = [];

    if (HAS_APPLY_PATCH_HEADER_RE.test(stripped)) {
        for (const rawLine of lines) {
            const line = rawLine.replace(/\r$/, '');
            const fileMatch = APPLY_PATCH_FILE_HEADER_RE.exec(line);
            if (fileMatch?.[1]) {
                pushUniquePath(paths, unquotePath(fileMatch[1]));
                continue;
            }
            const moveMatch = APPLY_PATCH_MOVE_HEADER_RE.exec(line);
            if (moveMatch?.[1]) {
                pushUniquePath(paths, unquotePath(moveMatch[1]));
            }
        }
        return paths;
    }

    if (HAS_SLOPPY_HEADER_RE.test(stripped)) {
        for (const rawLine of lines) {
            const line = rawLine.replace(/\r$/, '');
            const match = SLOPPY_FILE_HEADER_RE.exec(line);
            if (match?.[1]) {
                pushUniquePath(paths, unquotePath(match[1]));
            }
        }
        return paths;
    }

    for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');
        const trimmedEnd = line.trimEnd();
        if (trimmedEnd.startsWith('[')) {
            const complete = trimmedEnd.endsWith(']');
            const body = complete ? trimmedEnd.slice(1, -1) : trimmedEnd.slice(1);
            const target = normalizeHashlineTarget(body, complete);
            if (target) pushUniquePath(paths, target);
            continue;
        }
        const trimmed = line.trim();
        if (trimmed.startsWith('MV ')) {
            const dest = normalizeHashlineTarget(trimmed.slice(3), true);
            if (dest) pushUniquePath(paths, dest);
        }
    }

    return paths;
}
