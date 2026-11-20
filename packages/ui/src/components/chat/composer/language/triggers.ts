
import {
    getFileMentionAutocompleteQuery,
    type FileMentionAutocompleteInputSource,
} from '../../fileMentionAutocompleteState';
import { matchEmojiTrigger } from '@/lib/emoji/shortcodes';

export type AutocompleteKind = 'command' | 'skill' | 'mention' | 'emoji';

export interface AutocompleteTrigger {
    kind: AutocompleteKind;
    query: string;
}

export interface TriggerContext {
    inputMode: 'normal' | 'shell';
    mentionsEnabled?: boolean;
    inputSource?: FileMentionAutocompleteInputSource;
    insertedText?: string;
    mentionContinuesPastSpace?: (query: string) => boolean;
    mentionIsCompleted?: (start: number) => boolean;
}

const isWordBoundaryBefore = (text: string, index: number): boolean =>
    index <= 0 || /\s/.test(text[index - 1]);

function matchCommandPalette(value: string, cursorPosition: number): AutocompleteTrigger | null {
    if (!value.startsWith('/')) return null;

    const firstSpace = value.indexOf(' ');
    if (firstSpace !== -1) return null;

    const firstNewline = value.indexOf('\n');
    const commandEnd = firstNewline === -1 ? value.length : firstNewline;
    if (cursorPosition > commandEnd) return null;

    return { kind: 'command', query: value.substring(1, commandEnd) };
}

function matchInlineToken(
    value: string,
    cursorPosition: number,
    sigil: '$',
    kind: AutocompleteKind,
): AutocompleteTrigger | null {
    const textBeforeCursor = value.substring(0, cursorPosition);
    const sigilIndex = textBeforeCursor.lastIndexOf(sigil);
    if (sigilIndex === -1) return null;
    if (!isWordBoundaryBefore(textBeforeCursor, sigilIndex)) return null;

    const query = textBeforeCursor.substring(sigilIndex + 1);
    if (query.includes(' ') || query.includes('\n')) return null;

    return { kind, query };
}

const INTERNAL_SCHEMES = ['skill://', 'local://', 'proc://', 'agent://', 'history://'] as const;

/** Match OMP internal URL schemes typed at a word boundary (e.g. `skill://`). */
function matchInternalScheme(
    value: string,
    cursorPosition: number,
    context: TriggerContext,
): AutocompleteTrigger | null {
    if (context.mentionsEnabled === false) return null;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastWhitespace = Math.max(
        textBeforeCursor.lastIndexOf(' '),
        textBeforeCursor.lastIndexOf('\n'),
        textBeforeCursor.lastIndexOf('\t')
    );
    const token = textBeforeCursor.substring(lastWhitespace + 1);
    for (const scheme of INTERNAL_SCHEMES) {
        if (token.startsWith(scheme)) {
            return { kind: 'mention', query: token };
        }
    }
    return null;
}

/** Only typing opens it: pasted text that ends in `:word` is not asking for an emoji. */
function matchEmoji(value: string, cursorPosition: number, context: TriggerContext): AutocompleteTrigger | null {
    if (context.inputSource === 'paste') return null;
    const query = matchEmojiTrigger(value, cursorPosition);
    return query === null ? null : { kind: 'emoji', query };
}

/**
 * A native `/template` query at the start of a comment field.
 * Argument substitution is owned by the worker, not by this picker.
 */
export function matchSnippetTrigger(value: string, cursorPosition: number): string | null {
    return matchCommandPalette(value, cursorPosition)?.query ?? null;
}

export function resolveAutocompleteTrigger(
    value: string,
    cursorPosition: number,
    context: TriggerContext,
): AutocompleteTrigger | null {
    if (context.inputMode === 'shell') return null;

    return matchCommandPalette(value, cursorPosition)
        ?? matchInlineToken(value, cursorPosition, '$', 'skill')
        ?? matchMention(value, cursorPosition, context)
        ?? matchInternalScheme(value, cursorPosition, context)
        ?? matchEmoji(value, cursorPosition, context);
}

function matchMention(
    value: string,
    cursorPosition: number,
    context: TriggerContext,
): AutocompleteTrigger | null {
    if (context.mentionsEnabled === false) return null;
    const query = getFileMentionAutocompleteQuery({
        value,
        cursorPosition,
        inputSource: context.inputSource,
        insertedText: context.insertedText,
        continuesPastSpace: context.mentionContinuesPastSpace,
        isCompleted: context.mentionIsCompleted,
    });
    return query === null ? null : { kind: 'mention', query };
}
