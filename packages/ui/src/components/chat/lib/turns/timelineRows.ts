import { isHiddenUserMessage } from '../../message/hiddenUserMessage';
import { filterVisibleParts, isEmptyTextPart } from '../../message/partUtils';
import { answerChunkCuts } from './answerChunks';
import { getLiveFinalMessage, getShownPages, hasLiveActivity } from './liveActivity';
import type { TimelineEntry } from './timelineEntries';
import type { ChatMessageEntry } from './types';

type TurnEntry = Extract<TimelineEntry, { kind: 'turn' }>;
type UngroupedEntry = Extract<TimelineEntry, { kind: 'ungrouped' }>;

export type TextCut = { partId: string; offset: number };

export type MessageSlice = {
<<<<<<< HEAD
 from?: TextCut;
 to?: TextCut;
 /** Which of the message's rows this is, and how many it has. */
 index: number;
 count: number;
||||||| bc50ba56aa
    from?: TextCut;
    to?: TextCut;
    /** Which of the message's rows this is, and how many it has. */
    index: number;
    count: number;
=======
    from?: TextCut;
    to?: TextCut;
    index: number;
    count: number;
>>>>>>> upstream/main
};

export type TimelineRow =
<<<<<<< HEAD
 | { kind: 'ungrouped'; key: string; entry: UngroupedEntry }
 | ({ kind: 'turn-head'; key: string } & TurnRowFields)
 | ({ kind: 'turn-fold'; key: string } & TurnRowFields)
 | ({ kind: 'turn-pages'; key: string } & TurnRowFields)
 | ({
  kind: 'turn-message';
  key: string;
  messageId: string;
  slice: MessageSlice | null;
  /** The turn's final answer under a fold (collapsed activity mode). */
  final: boolean;
 } & TurnRowFields);
||||||| bc50ba56aa
    | { kind: 'ungrouped'; key: string; entry: UngroupedEntry }
    | ({ kind: 'turn-head'; key: string } & TurnRowFields)
    | ({ kind: 'turn-fold'; key: string } & TurnRowFields)
    | ({ kind: 'turn-pages'; key: string } & TurnRowFields)
    | ({
        kind: 'turn-message';
        key: string;
        messageId: string;
        slice: MessageSlice | null;
        /** The turn's final answer under a fold (collapsed activity mode). */
        final: boolean;
    } & TurnRowFields);
=======
    | { kind: 'ungrouped'; key: string; entry: UngroupedEntry }
    | ({ kind: 'turn-head'; key: string } & TurnRowFields)
    | ({ kind: 'turn-fold'; key: string } & TurnRowFields)
    | ({ kind: 'turn-pages'; key: string } & TurnRowFields)
    | ({
        kind: 'turn-message';
        key: string;
        messageId: string;
        slice: MessageSlice | null;
        final: boolean;
    } & TurnRowFields);
>>>>>>> upstream/main

type TurnRowFields = {
<<<<<<< HEAD
 entry: TurnEntry;
 /**
  * The turn's work folds (collapsed activity mode): its rows draw the
  * pages the fold hoists. Read from the entry the rows were built from, so
  * the rows of a live turn agree on it while its record lags the stream.
  */
 underFold: boolean;
 /** Under a fold, the answer it leaves outside, from the same record. */
 finalMessageId: string | undefined;
 gapBelow: boolean;
||||||| bc50ba56aa
    entry: TurnEntry;
    /**
     * The turn's work folds (collapsed activity mode): its rows draw the
     * pages the fold hoists. Read from the entry the rows were built from, so
     * the rows of a live turn agree on it while its record lags the stream.
     */
    underFold: boolean;
    /** Under a fold, the answer it leaves outside, from the same record. */
    finalMessageId: string | undefined;
    gapBelow: boolean;
=======
    entry: TurnEntry;
    underFold: boolean;
    finalMessageId: string | undefined;
    gapBelow: boolean;
>>>>>>> upstream/main
};

type TimelineRowsOptions = {
 collapsedActivity: boolean;
 expandedTurns: ReadonlyMap<string, boolean>;
 showReasoningTraces: boolean;
};

const isMessageCompleted = (message: ChatMessageEntry): boolean => (
 message.role === 'assistant'
);

const PARTS_PER_ROW = 24;

const messageCuts = (message: ChatMessageEntry, showReasoningTraces: boolean): TextCut[] => {
 const completed = isMessageCompleted(message);
 const cuts: TextCut[] = [];
 let partsInRow = 0;
 for (const part of filterVisibleParts(message.parts, { includeReasoning: showReasoningTraces })) {
  if (isEmptyTextPart(part)) continue;
  const partId = ('partId' in part && typeof part.partId === 'string') ? part.partId : (part as { id?: string }).id ?? '';
  if (partsInRow === PARTS_PER_ROW) {
   cuts.push({ partId, offset: 0 });
   partsInRow = 0;
  }
  partsInRow += 1;
  const text = 'content' in part && typeof part.content === 'string' ? part.content : ('text' in part && typeof part.text === 'string' ? part.text : '');
  if (!completed || part.type !== 'text' || !text) continue;
  const textCuts = answerChunkCuts(text);
  for (const offset of textCuts) cuts.push({ partId, offset });
  if (textCuts.length > 0) partsInRow = 1;
 }
 return cuts;
};

const sliceKey = (cut: TextCut) => `${cut.partId}:${cut.offset}`;

const turnRows = (entry: TurnEntry, options: TimelineRowsOptions): TimelineRow[] => {
 const { turn } = entry;
 const underFold = options.collapsedActivity && hasLiveActivity(turn, options.showReasoningTraces);
 const finalMessage = underFold ? getLiveFinalMessage(turn.assistantMessages) : undefined;
 const finalMessageId = finalMessage?.messageId;
 const fields = { entry, underFold, finalMessageId, gapBelow: false };
 const rows: TimelineRow[] = [{ kind: 'turn-head', key: entry.key, ...fields }];
 const addMessage = (message: ChatMessageEntry, final = false) => {
  const messageId = message.messageId;
  const cuts = messageCuts(message, options.showReasoningTraces);
  if (cuts.length === 0) {
   rows.push({ kind: 'turn-message', key: `step:${messageId}`, ...fields, messageId, slice: null, final });
   return;
  }
  cuts.forEach((cut, index) => {
   const from = index === 0 ? undefined : cuts[index - 1];
   rows.push({
    kind: 'turn-message',
    key: from ? `step:${messageId}:${sliceKey(from)}` : `step:${messageId}`,
    ...fields,
    messageId,
    slice: from ? { from, to: cut, index, count: cuts.length + 1 } : { to: cut, index, count: cuts.length + 1 },
    final,
   });
  });
  const last = cuts[cuts.length - 1];
  rows.push({ kind: 'turn-message', key: `step:${messageId}:${sliceKey(last)}`, ...fields, messageId, slice: { from: last, index: cuts.length, count: cuts.length + 1 }, final });
 };

<<<<<<< HEAD
 if (underFold) {
  // The rows LiveTurnActivity drew inside one turn row, in the same order.
  const activityMessages = finalMessage ? turn.assistantMessages.filter((message) => message !== finalMessage) : turn.assistantMessages;
  // Folded, the fold row itself draws what stays in view: a working
  // turn's latest steps, the pages and the steps after them. Opened,
  // every step is a row of its own.
  rows.push({ kind: 'turn-fold', key: `fold:${turn.turnId}`, ...fields });
  if (options.expandedTurns.get(turn.turnId) === true) {
   const pages = finalMessage ? [] : getShownPages(turn.assistantMessages);
   // A working turn draws what came after its last page below it.
   const lastPagePartId = pages[pages.length - 1]?.partId;
   const lastPageMessageId = lastPagePartId
    ? activityMessages.find((message) => message.parts.some((part) => part.partId === lastPagePartId))?.messageId
    : undefined;
   const split = lastPageMessageId ? activityMessages.findIndex((message) => message.messageId === lastPageMessageId) + 1 : 0;
   activityMessages.slice(0, split > 0 ? split : activityMessages.length).forEach((message) => addMessage(message));
   if (pages.length > 0) rows.push({ kind: 'turn-pages', key: `pages:${turn.turnId}`, ...fields });
   if (split > 0) activityMessages.slice(split).forEach((message) => addMessage(message));
  }
  if (finalMessage) addMessage(finalMessage, true);
 } else {
  turn.assistantMessages.forEach((message) => addMessage(message));
 }
||||||| bc50ba56aa
    if (underFold) {
        // The rows LiveTurnActivity drew inside one turn row, in the same order.
        const activityMessages = finalMessage ? turn.assistantMessages.filter((message) => message !== finalMessage) : turn.assistantMessages;
        // Folded, the fold row itself draws what stays in view: a working
        // turn's latest steps, the pages and the steps after them. Opened,
        // every step is a row of its own.
        rows.push({ kind: 'turn-fold', key: `fold:${turn.turnId}`, ...fields });
        if (options.expandedTurns.get(turn.turnId) === true) {
            const pages = finalMessage ? [] : getShownPages(turn.assistantMessages);
            // A working turn draws what came after its last page below it.
            const lastPageMessageId = pages[pages.length - 1]?.messageID;
            const split = lastPageMessageId ? activityMessages.findIndex((message) => message.info.id === lastPageMessageId) + 1 : 0;
            activityMessages.slice(0, split > 0 ? split : activityMessages.length).forEach((message) => addMessage(message));
            if (pages.length > 0) rows.push({ kind: 'turn-pages', key: `pages:${turn.turnId}`, ...fields });
            if (split > 0) activityMessages.slice(split).forEach((message) => addMessage(message));
        }
        if (finalMessage) addMessage(finalMessage, true);
    } else {
        turn.assistantMessages.forEach((message) => addMessage(message));
    }
=======
    if (underFold) {
        const activityMessages = finalMessage ? turn.assistantMessages.filter((message) => message !== finalMessage) : turn.assistantMessages;
        rows.push({ kind: 'turn-fold', key: `fold:${turn.turnId}`, ...fields });
        if (options.expandedTurns.get(turn.turnId) === true) {
            const pages = finalMessage ? [] : getShownPages(turn.assistantMessages);
            const lastPageMessageId = pages[pages.length - 1]?.messageID;
            const split = lastPageMessageId ? activityMessages.findIndex((message) => message.info.id === lastPageMessageId) + 1 : 0;
            activityMessages.slice(0, split > 0 ? split : activityMessages.length).forEach((message) => addMessage(message));
            if (pages.length > 0) rows.push({ kind: 'turn-pages', key: `pages:${turn.turnId}`, ...fields });
            if (split > 0) activityMessages.slice(split).forEach((message) => addMessage(message));
        }
        if (finalMessage) addMessage(finalMessage, true);
    } else {
        turn.assistantMessages.forEach((message) => addMessage(message));
    }
>>>>>>> upstream/main

<<<<<<< HEAD
 // The gap under an answer belongs to the turn's last row, from the moment
 // it is sent (see the scroll documentation, "Row identity").
 const last = rows[rows.length - 1];
 if (last.kind !== 'ungrouped' && !isHiddenUserMessage(entry.nextEntryFirstMessage)) rows[rows.length - 1] = { ...last, gapBelow: true };
 return rows;
||||||| bc50ba56aa
    // The gap under an answer belongs to the turn's last row, from the moment
    // it is sent (see the scroll documentation, "Row identity").
    const last = rows[rows.length - 1];
    if (last.kind !== 'ungrouped' && !isHiddenUserMessage(entry.nextEntryFirstMessage)) rows[rows.length - 1] = { ...last, gapBelow: true };
    return rows;
=======
    const last = rows[rows.length - 1];
    if (last.kind !== 'ungrouped' && !isHiddenUserMessage(entry.nextEntryFirstMessage)) rows[rows.length - 1] = { ...last, gapBelow: true };
    return rows;
>>>>>>> upstream/main
};

const isSameSlice = (previous: MessageSlice | null, next: MessageSlice | null): boolean => (
 previous?.from?.partId === next?.from?.partId && previous?.from?.offset === next?.from?.offset
 && previous?.to?.partId === next?.to?.partId && previous?.to?.offset === next?.to?.offset
 && previous?.count === next?.count
);

const isSameRow = (previous: TimelineRow, next: TimelineRow): boolean => {
 if (previous.kind !== next.kind || previous.entry !== next.entry) return false;
 if (previous.kind === 'ungrouped' || next.kind === 'ungrouped') return true;
 if (previous.gapBelow !== next.gapBelow || previous.underFold !== next.underFold || previous.finalMessageId !== next.finalMessageId) return false;
 if (previous.kind === 'turn-message' && next.kind === 'turn-message') {
  return previous.messageId === next.messageId && previous.final === next.final && isSameSlice(previous.slice, next.slice);
 }
 return true;
};

export const buildTimelineRows = (
 entries: readonly TimelineEntry[],
 options: TimelineRowsOptions,
 previous: TimelineRow[],
): TimelineRow[] => {
 const previousByKey = new Map<string, TimelineRow>();
 for (const row of previous) previousByKey.set(row.key, row);
 const rows: TimelineRow[] = [];
 for (const entry of entries) {
  const built: TimelineRow[] = entry.kind === 'turn' ? turnRows(entry, options) : [{ kind: 'ungrouped', key: entry.key, entry }];
  for (const row of built) {
   const reusable = previousByKey.get(row.key);
   rows.push(reusable && isSameRow(reusable, row) ? reusable : row);
  }
 }
 const unchanged = rows.length === previous.length && rows.every((row, index) => row === previous[index]);
 return unchanged ? previous : rows;
};
