import { matchesRankQuery } from '@/lib/search/fuzzySearch';
import React from 'react';

import { toast } from '@/components/ui';
import { Icon } from '@/components/icon/Icon';
import { Textarea } from '@/components/ui/textarea';
import { InlineDictationButton } from '@/components/dictation/InlineDictationButton';
import { KnowledgeCard } from './KnowledgeCard';
import { useI18n } from '@/lib/i18n';
import { PROJECT_NOTE_BODY_MAX_LENGTH, type ProjectNote, type ProjectRef } from '@/lib/projectContextApi';
import { cn } from '@/lib/utils';
import { useProjectContextStore } from '@/stores/useProjectContextStore';
import { useUIStore } from '@/stores/useUIStore';

const NOTE_SAVE_DEBOUNCE_MS = 400;

<<<<<<< HEAD
=======
/** Lazy: the editor brings CodeMirror, and most panel visits never open a note. */
const NoteEditor = React.lazy(() => import('./NoteEditor').then((module) => ({ default: module.NoteEditor })));

/** Past this the card preview is cut, and fades out so the cut is visible. */
const PREVIEW_FADE_MIN_CHARS = 180;
const PREVIEW_FADE_MIN_LINES = 4;
const PREVIEW_FADE_MASK = 'linear-gradient(to bottom, black 55%, transparent)';
const PREVIEW_FADE_STYLE: React.CSSProperties = { maskImage: PREVIEW_FADE_MASK, WebkitMaskImage: PREVIEW_FADE_MASK };

/** Source, date and pin state: the card footer and the open note's toolbar. */
const NoteMeta: React.FC<{ note: ProjectNote; pinned: boolean }> = ({ note, pinned }) => {
  const { t } = useI18n();
  const sourceLabel = note.source === 'selection'
    ? t('rightSidebar.contextNotesTodo.notes.source.selection')
    : note.source === 'agent'
      ? t('rightSidebar.contextNotesTodo.notes.source.agent')
      : null;
  const origin = note.origin;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 typography-micro text-muted-foreground">
      {sourceLabel && origin ? (
        // The note keeps the message it came from; the label opens it.
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void openSessionLink(origin.sessionId, origin.messageId ?? null);
          }}
          className="text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('rightSidebar.contextNotesTodo.notes.source.open')}
          data-row-tooltip={t('rightSidebar.contextNotesTodo.notes.source.open')}
        >
          {sourceLabel}
        </button>
      ) : sourceLabel ? (
        <span>{sourceLabel}</span>
      ) : null}
      {sourceLabel ? <span aria-hidden="true">·</span> : null}
      <span>{formatKnowledgeDate(note.updatedAt || note.createdAt)}</span>
      {pinned ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="text-primary">{t('rightSidebar.contextNotesTodo.pin.attached')}</span>
        </>
      ) : null}
    </span>
  );
};

/** One note in the list. Read-only; a click opens it. */
const NoteCard: React.FC<{
  note: ProjectNote;
  pinned: boolean;
  onOpen: () => void;
  onTogglePinned: () => void;
  onDelete: () => void;
  selected: boolean;
}> = ({ note, pinned, onOpen, onTogglePinned, onDelete , selected}) => {
  const { t } = useI18n();
  const { title, rest } = React.useMemo(() => splitNoteTitle(note.body), [note.body]);
  const fadePreview = rest.length > PREVIEW_FADE_MIN_CHARS || rest.split('\n').length > PREVIEW_FADE_MIN_LINES;
  const menuItems = [{
    id: 'delete',
    label: t('rightSidebar.contextNotesTodo.notes.actions.delete'),
    destructive: true,
    onSelect: onDelete,
  }];

  return (
    <KnowledgeCard
      selected={selected}
      entryId={note.id}
      onOpen={onOpen}
      label={title || t('rightSidebar.contextNotesTodo.notes.actions.expand')}
      header={(
        <span className="min-w-0 flex-1 truncate typography-ui-label font-medium text-foreground" dir="auto" title={title}>
          {title}
        </span>
      )}
      actions={(
        <>
          <KnowledgePinToggle pinned={pinned} onToggle={onTogglePinned} />
          <KnowledgeMenu items={menuItems} />
        </>
      )}
      menuItems={menuItems}
      footer={<NoteMeta note={note} pinned={pinned} />}
    >
      {rest ? (
        <div
          className="max-h-[4.5lh] overflow-hidden typography-meta text-muted-foreground"
          style={fadePreview ? PREVIEW_FADE_STYLE : undefined}
          // A link in the preview opens the link, not the note.
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest('a')) event.stopPropagation();
          }}
        >
          <SimpleMarkdownRenderer content={rest} className="typography-meta" enableFileReferences={false} />
        </div>
      ) : null}
    </KnowledgeCard>
  );
};

>>>>>>> bc50ba56a
/**
 * One note, edited in place.
 *
 * The draft is local and debounced: writing straight through on every keystroke
 * would put a request behind every character, and re-reading the store on every
 * render would fight the caret. The stored body is adopted only while the
 * editor is untouched since its last save, so a concurrent write from another
 * surface reaches an idle row without eating an active one.
 */
const NoteRow: React.FC<{
  note: ProjectNote;
  pinned: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSaveBody: (noteId: string, body: string) => void;
  onTogglePinned: () => void;
  onDelete: () => void;
}> = ({ note, pinned, expanded, onToggleExpanded, onSaveBody, onTogglePinned, onDelete }) => {
  const { t } = useI18n();
  const [draft, setDraft] = React.useState(note.body);
  const lastSavedRef = React.useRef(note.body);
  const debounceRef = React.useRef<number | null>(null);

  const cancelDebounce = React.useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (note.body === lastSavedRef.current) {
      return;
    }
    if (draft !== lastSavedRef.current) {
      return;
    }
    lastSavedRef.current = note.body;
    setDraft(note.body);
  }, [draft, note.body]);

  React.useEffect(() => {
    if (draft === lastSavedRef.current) {
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      // An empty body is a rejected write, not a delete. Leave it unsaved so
      // the row stays visible and the user can either restore it or delete it.
      if (!draft.trim()) {
        return;
      }
      lastSavedRef.current = draft;
      onSaveBody(note.id, draft);
    }, NOTE_SAVE_DEBOUNCE_MS);

    return cancelDebounce;
  }, [cancelDebounce, draft, note.id, onSaveBody]);

  React.useEffect(() => cancelDebounce, [cancelDebounce]);

  const handleBlur = React.useCallback(() => {
    cancelDebounce();
    if (draft === lastSavedRef.current) {
      return;
    }
    if (!draft.trim()) {
      // Restore rather than persist a blank: the server rejects it anyway.
      setDraft(lastSavedRef.current);
      return;
    }
    lastSavedRef.current = draft;
    onSaveBody(note.id, draft);
  }, [cancelDebounce, draft, note.id, onSaveBody]);

  const sourceLabel = note.source === 'selection'
    ? t('rightSidebar.contextNotesTodo.notes.source.selection')
    : note.source === 'agent'
      ? t('rightSidebar.contextNotesTodo.notes.source.agent')
      : null;

  return (
    <KnowledgeCard
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      expandLabel={t('rightSidebar.contextNotesTodo.notes.actions.expand')}
      footer={sourceLabel ? (
        <span className="typography-micro text-muted-foreground">{sourceLabel}</span>
      ) : null}
      actions={(
        <>
          <button
            type="button"
            onClick={onTogglePinned}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              pinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={pinned}
            aria-label={pinned
              ? t('rightSidebar.contextNotesTodo.notes.actions.unpin')
              : t('rightSidebar.contextNotesTodo.notes.actions.pin')}
            title={pinned
              ? t('rightSidebar.contextNotesTodo.notes.actions.unpin')
              : t('rightSidebar.contextNotesTodo.notes.actions.pin')}
          >
            {/* Filled means pinned, outline means "pin this" — the same
                language the work status panel uses. */}
            <Icon name={pinned ? 'pushpin-2-fill' : 'pushpin'} className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-interactive-hover/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('rightSidebar.contextNotesTodo.notes.actions.delete')}
            title={t('rightSidebar.contextNotesTodo.notes.actions.delete')}
          >
            <Icon name="delete-bin" className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    >
      {expanded ? (
        <Textarea
          simple
          autoFocus
          rows={Math.min(20, Math.max(3, draft.split('\n').length + 1))}
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, PROJECT_NOTE_BODY_MAX_LENGTH))}
          onBlur={handleBlur}
          className="min-h-0 w-full resize-none bg-transparent p-0 typography-ui-label leading-normal text-foreground focus-visible:outline-none focus-visible:ring-0"
        />
      ) : (
        <p className="line-clamp-3 whitespace-pre-wrap break-words typography-ui-label leading-normal text-foreground" title={draft}>
          {draft}
        </p>
      )}
    </KnowledgeCard>
  );
};

/**
 * Free-form project notes, one entry per note.
 *
 * Notes are written through their own routes, so this section owns its writes
 * end to end — nothing here has to be persisted alongside todos.
 */
export const NotesSection: React.FC<{
  projectRef: ProjectRef;
  notes: ProjectNote[];
  disabled: boolean;
  query: string;
  pinnedNoteIds: ReadonlySet<string>;
  onTogglePinned: (noteId: string, pinned: boolean) => Promise<boolean>;
}> = ({ projectRef, notes, disabled, query, pinnedNoteIds, onTogglePinned }) => {
  const { t } = useI18n();
  const [composerText, setComposerText] = React.useState('');
  // One at a time on purpose: notes can run to 3000 characters each, and
  // letting several stand open turns the tab into one unbroken wall of text.
  const [expandedNoteId, setExpandedNoteId] = React.useState<string | null>(null);
  const notesPanelHeight = useUIStore((state) => state.notesPanelHeight);
  const setNotesPanelHeight = useUIStore((state) => state.setNotesPanelHeight);
  const createNote = useProjectContextStore((state) => state.createNote);
  const saveNoteBody = useProjectContextStore((state) => state.saveNoteBody);
  const deleteNote = useProjectContextStore((state) => state.deleteNote);

  const visibleNotes = React.useMemo(
    () => notes.filter((note) => matchesRankQuery([note.body], query)),
    [notes, query],
  );

  // The store keeps the failure reason; without passing it through, every
  // failure looks identical to the user and tells them nothing about the cause.
  const reportFailure = React.useCallback((message: string) => {
    const detail = useProjectContextStore.getState().getEntry(projectRef).error;
    toast.error(message, detail ? { description: detail } : undefined);
  }, [projectRef]);

  const handleAdd = React.useCallback(async () => {
    const body = composerText.trim();
    if (!body) {
      return;
    }
    const created = await createNote(projectRef, { body });
    if (!created) {
      reportFailure(t('rightSidebar.contextNotesTodo.toast.createNoteFailed'));
      return;
    }
    setComposerText('');
  }, [composerText, createNote, projectRef, reportFailure, t]);

  // Dictated text continues the draft at its end; the cap still applies.
  const handleDictated = React.useCallback((text: string) => {
    setComposerText((current) => {
      const joined = current.trim() ? `${current.trimEnd()} ${text}` : text;
      return joined.slice(0, PROJECT_NOTE_BODY_MAX_LENGTH);
    });
  }, []);

  const handleDelete = React.useCallback(
    async (noteId: string) => {
      const ok = await deleteNote(projectRef, noteId);
      if (!ok) {
        reportFailure(t('rightSidebar.contextNotesTodo.toast.deleteNoteFailed'));
      }
    },
    [deleteNote, projectRef, reportFailure, t]
  );

  const handleTogglePinned = React.useCallback(
    async (noteId: string, pinned: boolean) => {
      const ok = await onTogglePinned(noteId, pinned);
      if (!ok) {
        reportFailure(t('rightSidebar.contextNotesTodo.toast.saveNotesFailed'));
      }
    },
    [onTogglePinned, reportFailure, t]
  );

  const handleSaveBody = React.useCallback(
    (noteId: string, body: string) => {
      void saveNoteBody(projectRef, noteId, body).then((ok: boolean) => {
        if (!ok) {
          reportFailure(t('rightSidebar.contextNotesTodo.toast.saveNotesFailed'));
        }
      });
    },
    [projectRef, reportFailure, saveNoteBody, t]
  );

  return (
    <div className="space-y-2">
      {/* Counter and add live in the textarea's own footer slot: beside it they
          cost width the panel does not have and leave the button floating
          against a tall field. */}
      <Textarea
        value={composerText}
        onChange={(event) => setComposerText(event.target.value.slice(0, PROJECT_NOTE_BODY_MAX_LENGTH))}
        placeholder={t('rightSidebar.contextNotesTodo.notes.placeholder')}
        resizedHeight={notesPanelHeight}
        onResizeHeightChange={setNotesPanelHeight}
        useScrollShadow
        scrollShadowSize={24}
        disabled={disabled}
        // The footer row carries counter, mic, add and resize; the default
        // bottom padding left it pressed against the rounded border.
        outerClassName="pb-3.5"
        endSlot={(
          <>
            <span className="typography-meta text-muted-foreground">
              {composerText.length}/{PROJECT_NOTE_BODY_MAX_LENGTH}
            </span>
            <InlineDictationButton
              onTranscript={handleDictated}
              disabled={disabled}
              buttonClassName="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={disabled || composerText.trim().length === 0}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('rightSidebar.contextNotesTodo.notes.addAria')}
              title={t('rightSidebar.contextNotesTodo.notes.addAria')}
            >
              <Icon name="add" className="h-4 w-4" />
            </button>
          </>
        )}
      />

      {/* No frame around the list: each note is a bordered card, and an outer
          border sitting flush against them read as lines joining the cards. */}
      <div>
        {visibleNotes.length === 0 ? (
          <p className="typography-meta text-muted-foreground">
            {query.trim()
              ? t('rightSidebar.contextNotesTodo.search.noResults', { query: query.trim() })
              : t('rightSidebar.contextNotesTodo.notes.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {visibleNotes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                pinned={pinnedNoteIds.has(note.id)}
                expanded={expandedNoteId === note.id}
                onToggleExpanded={() => setExpandedNoteId((current) => (current === note.id ? null : note.id))}
                onSaveBody={handleSaveBody}
                onTogglePinned={() => void handleTogglePinned(note.id, !pinnedNoteIds.has(note.id))}
                onDelete={() => void handleDelete(note.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
