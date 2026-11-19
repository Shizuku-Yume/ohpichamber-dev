import React from 'react';
import { cn, fuzzyMatch } from '@/lib/utils';
import { selectSnippetsForDirectory, useSnippetsStore } from '@/stores/useSnippetsStore';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useUIStore } from '@/stores/useUIStore';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import type { Snippet } from '@/types/snippet';
import { useMobileAutocompleteMaxHeight } from './useMobileAutocompleteMaxHeight';

export interface SnippetAutocompleteHandle {
  handleKeyDown: (key: string) => void;
}

interface SnippetAutocompleteProps {
  searchQuery: string;
  onSnippetSelect: (snippet: Snippet, trigger: string) => void;
  onClose: () => void;
  style?: React.CSSProperties;
<<<<<<< HEAD
||||||| bc50ba56aa
  /**
   * The composer's text without the `#name` being typed. With it, a new name
   * offers to save that text as the snippet.
   */
  draftText?: string;
  /** Runs once the draft is saved, with the `#name` token that was typed. */
  onDraftSaved?: (typedName: string) => void;
}

interface PickerAction {
  id: string;
  label: string;
  icon: IconName;
  run: () => void;
=======
  draftText?: string;
  onDraftSaved?: (typedName: string) => void;
}

interface PickerAction {
  id: string;
  label: string;
  icon: IconName;
  run: () => void;
>>>>>>> upstream/main
}

function snippetPreview(snippet: Snippet): string {
  return (snippet.description || snippet.content).replace(/\s+/g, ' ').trim().slice(0, 120);
}

export const SnippetAutocomplete = React.forwardRef<SnippetAutocompleteHandle, SnippetAutocompleteProps>(({
  searchQuery,
  onSnippetSelect,
  onClose,
  style,
}, ref) => {
  const { t } = useI18n();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
<<<<<<< HEAD
||||||| bc50ba56aa
  // Narrowing as the user types, the box eases into its new height; its
  // bottom edge stays on the composer (`bottom-full`), so it moves upward.
  useHeightMorph(containerRef);
=======
  useHeightMorph(containerRef);
>>>>>>> upstream/main
  const isMobile = useUIStore((state) => state.isMobile);
<<<<<<< HEAD
  const mobileMaxHeight = useMobileAutocompleteMaxHeight(containerRef, true, 240);
||||||| bc50ba56aa
  // A caret placement brings its own max-height.
  const mobileMaxHeight = useMobileAutocompleteMaxHeight(containerRef, style?.maxHeight === undefined, 240);
=======
  const mobileMaxHeight = useMobileAutocompleteMaxHeight(containerRef, style?.maxHeight === undefined, 240);
>>>>>>> upstream/main
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const selectedIndexRef = React.useRef(0);
  const [filteredSnippets, setFilteredSnippets] = React.useState<Snippet[]>([]);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const directory = useEffectiveDirectory();
  const snippets = useSnippetsStore((state) => selectSnippetsForDirectory(state, directory));
  const loadSnippets = useSnippetsStore((s) => s.loadSnippets);
  const setSnippetDraft = useSnippetsStore((s) => s.setSnippetDraft);
  const setSelectedSnippet = useSnippetsStore((s) => s.setSelectedSnippet);
  const setSettingsDialogOpen = useUIStore((s) => s.setSettingsDialogOpen);
  const setSettingsPage = useUIStore((s) => s.setSettingsPage);

  React.useEffect(() => {
    void loadSnippets(directory);
  }, [directory, loadSnippets]);

  React.useEffect(() => {
    const query = searchQuery.trim();
    const matches = query.length
      ? snippets.filter((snippet) => fuzzyMatch(snippet.name, query))
      : snippets;
    const sortedMatches = [...matches].sort((a, b) => {
      if (a.scope === 'workspace' && b.scope !== 'workspace') return -1;
      if (a.scope !== 'workspace' && b.scope === 'workspace') return 1;
      return a.name.localeCompare(b.name);
    });
<<<<<<< HEAD
    setFilteredSnippets(sortedMatches);
    setSelectedIndex(sortedMatches.length ? 1 : 0);
  }, [searchQuery, snippets]);
||||||| bc50ba56aa
  }, [query, snippets]);

  // A typed name no snippet answers to can become one, from the draft or
  // from scratch. Every way in opens the dialog, so a stray Enter on `#42`
  // never writes a snippet.
  const actions = React.useMemo((): PickerAction[] => {
    const create = (request: Parameters<typeof openQuickCreate>[0]) => () => {
      openQuickCreate(request);
      onClose();
    };
    const typedName = isValidSnippetName(query) && !findSnippetByTrigger(snippets, query) ? query : null;
    if (!typedName) {
      return [{ id: 'new', label: t('chat.snippetAutocomplete.action.addNew'), icon: 'add', run: create({ content: '' }) }];
    }
    const typedActions: PickerAction[] = [];
    const draft = draftText?.trim() ?? '';
    if (draft) {
      typedActions.push({
        id: 'save-draft',
        label: t('chat.snippetAutocomplete.action.saveDraft', { name: typedName }),
        icon: 'save-3',
        // The typed token leaves the draft, whatever name the dialog saved under.
        run: create({ name: typedName, content: draft, onSaved: onDraftSaved ? () => onDraftSaved(typedName) : undefined }),
      });
    }
    typedActions.push({ id: 'create', label: t('chat.snippetAutocomplete.action.create', { name: typedName }), icon: 'add', run: create({ name: typedName, content: '' }) });
    return typedActions;
  }, [draftText, onClose, onDraftSaved, openQuickCreate, query, snippets, t]);

  // A match is what the user most likely wants; with none, the first action.
  React.useEffect(() => {
    setSelectedIndex(filteredSnippets.length ? actions.length : 0);
  }, [actions.length, filteredSnippets]);
=======
  }, [query, snippets]);

  const actions = React.useMemo((): PickerAction[] => {
    const create = (request: Parameters<typeof openQuickCreate>[0]) => () => {
      openQuickCreate(request);
      onClose();
    };
    const typedName = isValidSnippetName(query) && !findSnippetByTrigger(snippets, query) ? query : null;
    if (!typedName) {
      return [{ id: 'new', label: t('chat.snippetAutocomplete.action.addNew'), icon: 'add', run: create({ content: '' }) }];
    }
    const typedActions: PickerAction[] = [];
    const draft = draftText?.trim() ?? '';
    if (draft) {
      typedActions.push({
        id: 'save-draft',
        label: t('chat.snippetAutocomplete.action.saveDraft', { name: typedName }),
        icon: 'save-3',
        run: create({ name: typedName, content: draft, onSaved: onDraftSaved ? () => onDraftSaved(typedName) : undefined }),
      });
    }
    typedActions.push({ id: 'create', label: t('chat.snippetAutocomplete.action.create', { name: typedName }), icon: 'add', run: create({ name: typedName, content: '' }) });
    return typedActions;
  }, [draftText, onClose, onDraftSaved, openQuickCreate, query, snippets, t]);

  React.useEffect(() => {
    setSelectedIndex(filteredSnippets.length ? actions.length : 0);
  }, [actions.length, filteredSnippets]);
>>>>>>> upstream/main

  React.useEffect(() => {
    selectedIndexRef.current = selectedIndex;
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (target && containerRef.current && !containerRef.current.contains(target)) onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onClose]);

  const chooseSnippet = React.useCallback((snippet: Snippet) => {
    onSnippetSelect(snippet, snippet.name);
  }, [onSnippetSelect]);

  const openNewSnippetSettings = React.useCallback(() => {
    const existing = new Set(snippets.map((snippet) => snippet.name));
    let name = 'new-snippet';
    let counter = 1;
    while (existing.has(name)) {
      name = `new-snippet-${counter++}`;
    }
    setSnippetDraft({ name, scope: 'agent', content: '' });
    setSelectedSnippet(name);
    setSettingsPage('snippets');
    setSettingsDialogOpen(true);
    onClose();
  }, [onClose, setSelectedSnippet, setSettingsDialogOpen, setSettingsPage, setSnippetDraft, snippets]);

  React.useImperativeHandle(ref, () => ({
    handleKeyDown: (key: string) => {
      if (key === 'Escape') {
        onClose();
        return;
      }
      const itemCount = filteredSnippets.length + 1;
      if (key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % itemCount);
        return;
      }
      if (key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev - 1 + itemCount) % itemCount);
        return;
      }
      if (key === 'Enter' || key === 'Tab') {
        if (selectedIndexRef.current === 0) {
          openNewSnippetSettings();
          return;
        }
        const snippet = filteredSnippets[selectedIndexRef.current - 1];
        if (snippet) chooseSnippet(snippet);
      }
    },
  }), [chooseSnippet, filteredSnippets, onClose, openNewSnippetSettings]);

  return (
    <div ref={containerRef} className="absolute z-[100] min-w-0 w-full max-w-[450px] max-h-60 oc-glass-popover border-2 border-border/60 rounded-xl shadow-none bottom-full mb-2 left-0 flex flex-col" style={mobileMaxHeight !== undefined ? { ...style, maxHeight: mobileMaxHeight } : style}>
      <ScrollableOverlay preventOverscroll outerClassName="flex-1 min-h-0" className="px-0 pb-2">
        <div
          ref={(el) => { itemRefs.current[0] = el; }}
          className={cn('flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded-lg typography-ui-label', selectedIndex === 0 && 'bg-interactive-selection')}
          onClick={openNewSnippetSettings}
          onMouseMove={() => setSelectedIndex(0)}
        >
          <Icon name="add" className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium text-foreground">{t('chat.snippetAutocomplete.action.addNew')}</span>
        </div>
        {filteredSnippets.length ? filteredSnippets.map((snippet, index) => (
          <div
            key={snippet.templateId}
            ref={(el) => { itemRefs.current[index + 1] = el; }}
            className={cn('flex gap-2 px-3 py-1.5 cursor-pointer rounded-lg typography-ui-label', isMobile ? 'items-center' : 'items-start', index + 1 === selectedIndex && 'bg-interactive-selection')}
            onClick={() => chooseSnippet(snippet)}
            onMouseMove={() => setSelectedIndex(index + 1)}
          >
<<<<<<< HEAD
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold truncate">/{snippet.name}</span>
                <span className="text-[10px] leading-none uppercase font-bold tracking-tight px-1.5 py-1 rounded border flex-shrink-0 bg-[var(--surface-muted)] text-muted-foreground border-[var(--interactive-border)]/60">{snippet.source}</span>
              </div>
              {!isMobile && (
                <div className="typography-meta text-muted-foreground mt-0.5 truncate">{snippetPreview(snippet)}</div>
              )}
||||||| bc50ba56aa
            <Icon name={action.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-muted-foreground">{action.label}</span>
          </div>
        ))}
        {filteredSnippets.length ? filteredSnippets.map((snippet, index) => {
          const itemIndex = actions.length + index;
          return (
            <div
              key={`${snippet.source}:${snippet.filePath}`}
              ref={(el) => { itemRefs.current[itemIndex] = el; }}
              className={cn('flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-lg typography-ui-label', itemIndex === selectedIndex && 'bg-interactive-selection')}
              onClick={() => chooseSnippet(snippet)}
              onMouseMove={() => setSelectedIndex(itemIndex)}
            >
              <span className="max-w-[60%] shrink-0 truncate font-semibold">#{snippet.name}</span>
              {/* A global snippet is the user's own, as a user skill or command is. */}
              <AutocompleteRowDetail scope={snippet.source === 'project' ? 'project' : 'user'} description={snippetPreview(snippet)} />
=======
            <Icon name={action.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-muted-foreground">{action.label}</span>
          </div>
        ))}
        {filteredSnippets.length ? filteredSnippets.map((snippet, index) => {
          const itemIndex = actions.length + index;
          return (
            <div
              key={`${snippet.source}:${snippet.filePath}`}
              ref={(el) => { itemRefs.current[itemIndex] = el; }}
              className={cn('flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-lg typography-ui-label', itemIndex === selectedIndex && 'bg-interactive-selection')}
              onClick={() => chooseSnippet(snippet)}
              onMouseMove={() => setSelectedIndex(itemIndex)}
            >
              <span className="max-w-[60%] shrink-0 truncate font-semibold">#{snippet.name}</span>
              <AutocompleteRowDetail scope={snippet.source === 'project' ? 'project' : 'user'} description={snippetPreview(snippet)} />
>>>>>>> upstream/main
            </div>
          </div>
        )) : (
          <div className="px-3 py-2 typography-ui-label text-muted-foreground">{t('chat.snippetAutocomplete.empty')}</div>
        )}
      </ScrollableOverlay>
      {!isMobile && (
        <div className="px-3 pt-1 pb-1.5 border-t typography-meta text-muted-foreground">{t('chat.snippetAutocomplete.footer')}</div>
      )}
    </div>
  );
});

SnippetAutocomplete.displayName = 'SnippetAutocomplete';
