<<<<<<< HEAD
/**
 * Client-side text sanitization for TTS output.
 * Removes markdown, URLs, file paths, and other non-speakable content.
 * Applied when canonical utility summarization is skipped or unavailable.
 */
||||||| bc50ba56aa
/**
 * Client-side text sanitization for TTS output.
 * Removes markdown, URLs, file paths, and other non-speakable content.
 * Applied as a fallback when server-side summarization is skipped.
 */
=======
>>>>>>> upstream/main
export function sanitizeForTTS(text: string): string {
    if (!text) return '';
    return text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`\n]*)`/g, '$1')
        .replace(/[*_~#]/g, '')
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/(^|\s)\/(?:[\w.-]+\/)*[\w.-]+/g, '$1')
        .replace(/([\w.])\/([\w.])/g, '$1 slash $2')
        .replace(/^\s*[$#>]\s*/gm, '')
        .replace(/[[\]{}()<>|&;]/g, ' ')
        .replace(/\\/g, '')
        .replace(/\r\n?/g, '\n')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n+/g, '\n')
        .trim();
}

export function ensureLineTerminalPunctuation(text: string): string {
    return text
        .split('\n')
        .map((line) => (/[\p{L}\p{N}]$/u.test(line) ? line + '.' : line))
        .join('\n');
}
