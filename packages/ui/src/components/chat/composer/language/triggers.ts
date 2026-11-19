<<<<<<< HEAD
/**
 * Which autocomplete a caret position asks for.
 *
 * Four pickers: native commands/templates, inline skills, file/agent mentions, and emoji shortcodes.
 * This module owns the caret trigger rules, not expansion or authorization.
 * The editor reports text and caret position, then renders the selected picker.
 *
 * Exactly one trigger is active: a leading slash command/template invocation,
 * then inline `$skill`, then file/agent mentions, then `:emoji`. Comment fields expose their
 * own leading-slash template picker through matchSnippetTrigger.
 */
||||||| bc50ba56aa
/**
 * Which autocomplete a caret position asks for.
 *
 * The composer has four pickers (command, skill, snippet, file/agent mention)
 * and the rule that opens each of them used to be inlined in a single 90-line
 * `updateAutocompleteState` callback, duplicating the boundary logic that
 * `scanPrefixTokens` and `scanMentions` already own. This module answers the
 * one question the composer actually asks — "given the text and the caret,
 * what should be open?" — as a pure function, so the editor layer only has to
 * report the caret and render the result.
 *
 * Exactly one trigger can be active, and order matters: the command palette
 * (a leading `/`) outranks the skill picker (`$`, anywhere in the text), which
 * outranks snippets, which outrank mentions, which outrank emoji (`:tada`). Commands and skills use separate
 * sigils so the palette lists commands only.
 */
=======
>>>>>>> upstream/main

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

<<<<<<< HEAD
/**
 * A `$skill` still being typed: the nearest sigil before the
 * caret, at a word boundary, with no separator between it and the caret.
 */
||||||| bc50ba56aa
/**
 * A `$skill` or `#snippet` still being typed: the nearest sigil before the
 * caret, at a word boundary, with no separator between it and the caret. The
 * skill sigil matches every spelling a CJK IME produces for the same key.
 */
=======
>>>>>>> upstream/main
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

<<<<<<< HEAD
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
||||||| bc50ba56aa
/**
 * The `#snippet` query being typed at the caret, or null. For text fields that
 * offer only the snippet picker (comment inputs), with the composer's rule.
 */
=======
>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
/** Only typing opens it: pasted text that ends in `:word` is not asking for an emoji. */
function matchEmoji(value: string, cursorPosition: number, context: TriggerContext): AutocompleteTrigger | null {
    if (context.inputSource === 'paste') return null;
    const query = matchEmojiTrigger(value, cursorPosition);
    return query === null ? null : { kind: 'emoji', query };
}

=======
function matchEmoji(value: string, cursorPosition: number, context: TriggerContext): AutocompleteTrigger | null {
    if (context.inputSource === 'paste') return null;
    const query = matchEmojiTrigger(value, cursorPosition);
    return query === null ? null : { kind: 'emoji', query };
}

>>>>>>> upstream/main
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
