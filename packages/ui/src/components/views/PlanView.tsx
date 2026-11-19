import React from 'react';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { CodeMirrorEditor } from '@/components/ui/CodeMirrorEditor';
import { PreviewToggleButton } from './PreviewToggleButton';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
<<<<<<< HEAD
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buildCodeMirrorCommentWidgets, FilePreviewCommentMenu, normalizeLineRange, useInlineCommentController } from '@/components/comments';
||||||| bc50ba56aa
import { ActionToolbar } from '@/components/ui/action-toolbar';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { buildCodeMirrorCommentWidgets, FilePreviewCommentMenu, normalizeLineRange, useInlineCommentController, useLineNumberDragSelection } from '@/components/comments';
=======
import { ActionToolbar, type ToolbarAction } from '@/components/ui/action-toolbar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/icon/Icon';
import { PlanProgressLabel } from '@/components/session/project-context/PlansSection';
import { usePlanActions } from '@/components/session/project-context/usePlanActions';
import { useSessionKnowledgePins } from '@/components/session/project-context/useSessionKnowledgePins';
import { PlanTodos } from '@/components/session/project-context/PlanTodos';
import { registerOpenPlan } from '@/components/session/project-context/openPlanViews';
import { buildCodeMirrorCommentWidgets, FilePreviewCommentMenu, normalizeLineRange, useInlineCommentController, useLineNumberDragSelection } from '@/components/comments';
>>>>>>> upstream/main

import { getLanguageFromExtension } from '@/lib/toolHelpers';
import { useDeviceInfo } from '@/lib/device';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { createFlexokiCodeMirrorTheme } from '@/lib/codemirror/flexokiTheme';
import { codeHighlightExtension } from '@/lib/codemirror/codeHighlight';
import { getCodeTokenTheme } from '@/lib/shiki/appThemeRegistry';
import { languageByExtension } from '@/lib/codemirror/languageByExtension';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessions } from '@/sync/sync-context';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSelectionStore } from '@/sync/selection-store';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionGoalArmStore } from '@/stores/useSessionGoalArmStore';
import { useUIStore } from '@/stores/useUIStore';
import { useGitStore } from '@/stores/useGitStore';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { EditorView } from '@codemirror/view';
import { copyTextToClipboard } from '@/lib/clipboard';
import { generateBranchName } from '@/lib/git/branchNameGenerator';
import { fetchProjectPlan, parsePlanMarkdown, resolveProjectContextId, type SavedProjectPlanTarget } from '@/lib/projectContextApi';
import { CHAT_DRAFT_PROJECT_ID } from '@/lib/chatDirectories';
import { createPlanSaveQueue } from '@/lib/planSaveQueue';
import { observeProjectContext } from '@/lib/projectContextSync';
import { createFileContentPoller } from './fileContentPoller';
import { getRuntimeKey, getRuntimeSwitchRevision, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { useProjectContextStore } from '@/stores/useProjectContextStore';
import { createWorktreeSessionForNewBranch } from '@/lib/worktreeSessionCreator';
import { TodoSendDialog } from '@/components/session/TodoSendDialog';
import type { TodoSendExecution } from '@/components/session/todoSendExecution';
import { Icon } from "@/components/icon/Icon";
import { useMessageTTS } from '@/hooks/useMessageTTS';
import { loadMagicPrompts } from '@/lib/magicPrompts';
import { useI18n } from '@/lib/i18n';
<<<<<<< HEAD
||||||| bc50ba56aa
import { ContextPanelHeaderToolbar } from '@/components/layout/contextPanelHeaderSlot';
import { useInContextPanelHeader } from '@/components/layout/contextPanelHeaderSlotContext';
import { cn } from '@/lib/utils';
import { useMarkdownLocalAssets } from './files/previews/useMarkdownLocalAssets';
import { watchFileOnScreen } from '@/lib/watchedFiles';

/** The open plan's check while OpenCode watches its file: only for a watch lost on an OpenCode restart. */
const WATCHED_PLAN_POLL_MS = 30_000;
=======
import { ContextPanelHeaderToolbar } from '@/components/layout/contextPanelHeaderSlot';
import { useInContextPanelHeader } from '@/components/layout/contextPanelHeaderSlotContext';
import { cn } from '@/lib/utils';
import { useMarkdownLocalAssets } from './files/previews/useMarkdownLocalAssets';
import { watchFileOnScreen } from '@/lib/watchedFiles';

const WATCHED_PLAN_POLL_MS = 30_000;
>>>>>>> upstream/main

type PlanViewProps = {
<<<<<<< HEAD
  targetPath?: string | null;
  /** Saved project plan to open, with the project that owns it. The owner is
      part of the prop so the view never guesses it from the current directory:
      plan tabs outlive directory changes (persisted context tabs, mobile
      overlays), and for managed chats the owner is not a registered project a
      directory lookup could ever find. */
||||||| bc50ba56aa
  /** False while the panel holding the view is closed: nothing to keep fresh. */
  visible?: boolean;
  /** Saved project plan to open, with the project that owns it. The owner is
      part of the prop so the view never guesses it from the current directory:
      the Project knowledge panel and the mobile plan overlay keep a plan open
      across directory changes, and for managed chats the owner is not a
      registered project a directory lookup could ever find. */
=======
  visible?: boolean;
>>>>>>> upstream/main
  savedProjectPlan?: SavedProjectPlanTarget | null;
  onNavigatedToChat?: () => void;
<<<<<<< HEAD
||||||| bc50ba56aa
  /** Rendered before the title, e.g. the project knowledge panel's back control. */
  leading?: React.ReactNode;
=======
  leading?: React.ReactNode;
  onClose?: () => void;
>>>>>>> upstream/main
};

const NO_PROJECT = { id: '', path: '' };

const LEADING_HEADING = /^\s*#\s+.+?(?:\n+|$)/;

type PlanSendAction = 'improve' | 'implement';
type PlanSendTarget = 'session' | 'worktree';

type PendingPlanSend = {
  action: PlanSendAction;
  target: PlanSendTarget;
};

const normalize = (value: string): string => {
  if (!value) return '';
  const replaced = value.replace(/\\/g, '/');
  return replaced === '/' ? '/' : replaced.replace(/\/+$/, '');
};

const toDisplayPath = (resolvedPath: string, options: { currentDirectory: string; homeDirectory: string }): string => {
  const current = normalize(options.currentDirectory);
  const home = normalize(options.homeDirectory);
  const normalized = normalize(resolvedPath);

  if (current && normalized.startsWith(current + '/')) {
    return normalized.slice(current.length + 1);
  }

  if (home && normalized === home) {
    return '~';
  }

  if (home && normalized.startsWith(home + '/')) {
    return `~${normalized.slice(home.length)}`;
  }

  return normalized;
};

const resolveProjectRefForDirectory = (
  directory: string,
  projects: Array<{ id: string; path: string }>,
  activeProjectId: string | null,
): { id: string; path: string } | null => {
  const normalized = normalize(directory.trim());
  if (!normalized) {
    return null;
  }

  const activeProject = activeProjectId
    ? projects.find((project) => project.id === activeProjectId) ?? null
    : null;

  if (activeProject?.path) {
    const activePath = normalize(activeProject.path);
    if (normalized === activePath || normalized.startsWith(`${activePath}/`)) {
      return { id: activeProject.id, path: activeProject.path };
    }
  }

  const match = projects
    .filter((project) => {
      const projectPath = normalize(project.path);
      return normalized === projectPath || normalized.startsWith(`${projectPath}/`);
    })
    .sort((left, right) => normalize(right.path).length - normalize(left.path).length)[0];

  return match ? { id: match.id, path: match.path } : null;
};

const subscribeActiveRuntimeKey = (onStoreChange: () => void): (() => void) => {
  return subscribeRuntimeEndpointChanged(() => onStoreChange());
};

type SelectedLineRange = {
  start: number;
  end: number;
};

<<<<<<< HEAD
/** The poll only covers a change no event announced. */
const WATCHED_PLAN_POLL_MS = 2_000;

export const PlanView: React.FC<PlanViewProps> = ({ targetPath = null, savedProjectPlan = null, onNavigatedToChat }) => {
||||||| bc50ba56aa
export const PlanView: React.FC<PlanViewProps> = ({ visible = true, savedProjectPlan = null, onNavigatedToChat, leading }) => {
=======
export const PlanView: React.FC<PlanViewProps> = ({ visible = true, savedProjectPlan = null, onNavigatedToChat, leading, onClose }) => {
>>>>>>> upstream/main
  const { t } = useI18n();
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const createSession = useSessionUIStore((state) => state.createSession);
  const sendMessage = useSessionUIStore((state) => state.sendMessage);
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);
  const sessions = useSessions();
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory);
  const projects = useProjectsStore((state) => state.projects);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const gitDirectories = useGitStore((state) => state.directories);
  const effectiveDirectory = useEffectiveDirectory() ?? '';
  const setSessionSwitcherOpen = useUIStore((state) => state.setSessionSwitcherOpen);
  const runtimeApis = useRuntimeAPIs();
  const activeRuntimeKey = React.useSyncExternalStore(subscribeActiveRuntimeKey, getRuntimeKey, getRuntimeKey);
  const { isMobile } = useDeviceInfo();
  const { currentTheme } = useThemeSystem();

  const session = React.useMemo(() => {
    if (!currentSessionId) return null;
    return sessions.find((s) => s.sessionId === currentSessionId) ?? null;
  }, [currentSessionId, sessions]);

  const sessionDirectory = React.useMemo(() => {
    return normalize(session ? resolveGlobalSessionDirectory(session) ?? '' : '');
  }, [session]);
  const projectDirectory = React.useMemo(
    () => normalize(effectiveDirectory || sessionDirectory),
    [effectiveDirectory, sessionDirectory],
  );
  const currentProjectRef = React.useMemo(
    () => resolveProjectRefForDirectory(projectDirectory, projects, activeProjectId),
    [activeProjectId, projectDirectory, projects],
  );
  const savedPlanProjectId = savedProjectPlan?.projectRef.id ?? null;
  const savedPlanProjectPath = savedProjectPlan?.projectRef.path ?? null;
  const savedPlanProjectRef = React.useMemo(
    () => savedPlanProjectId && savedPlanProjectPath
      ? { id: savedPlanProjectId, path: savedPlanProjectPath }
      : null,
    [savedPlanProjectId, savedPlanProjectPath],
  );
  const savedPlanId = savedProjectPlan?.planId ?? null;
  const planLink = useProjectContextStore((state) => {
    if (!savedPlanProjectRef || !savedPlanId) return null;
    return state.entries[resolveProjectContextId(savedPlanProjectRef)]?.plans.find((plan) => plan.id === savedPlanId) ?? null;
  });
  const planActions = usePlanActions(savedPlanProjectRef ?? NO_PROJECT);
  const { pinnedPlanIds, togglePin } = useSessionKnowledgePins();
  const togglePlanPin = React.useCallback(async (planId: string, pinned: boolean) => {
    if (!await togglePin('plan', planId, pinned)) toast.error(t('rightSidebar.contextNotesTodo.toast.updatePlanFailed'));
  }, [t, togglePin]);
  const savedPlanKey = savedPlanProjectRef && savedPlanId
    ? JSON.stringify(['saved-plan', activeRuntimeKey, resolveProjectContextId(savedPlanProjectRef), savedPlanId])
    : null;
  const isManagedChatPlan = savedPlanProjectRef?.id === CHAT_DRAFT_PROJECT_ID;
  const canCreateWorktree = React.useMemo(
    () => {
      const sendTarget = savedPlanProjectRef ?? currentProjectRef;
      return sendTarget ? gitDirectories.get(sendTarget.path)?.isGitRepo === true : false;
    },
    [currentProjectRef, gitDirectories, savedPlanProjectRef],
  );
  const [pendingPlanSend, setPendingPlanSend] = React.useState<PendingPlanSend | null>(null);
  const [isPlanSendSubmitting, setIsPlanSendSubmitting] = React.useState(false);

<<<<<<< HEAD
  const [resolvedPath, setResolvedPath] = React.useState<string | null>(null);
  // Set once a saved project plan has actually loaded. Kept separate from
  // `resolvedPath` so nothing downstream can mistake a project plan for a file
  // the user could open, edit, or be shown a path for.
||||||| bc50ba56aa
  // Set once a saved project plan has actually loaded.
=======
>>>>>>> upstream/main
  const [loadedProjectPlanId, setLoadedProjectPlanId] = React.useState<string | null>(null);
  const [loadedProjectPlanPath, setLoadedProjectPlanPath] = React.useState<string | null>(null);
  const hasDocument = Boolean(resolvedPath) || Boolean(loadedProjectPlanId);
  const displayPath = React.useMemo(() => {
    if (!resolvedPath || !sessionDirectory || !homeDirectory) {
      return resolvedPath;
    }
    return toDisplayPath(resolvedPath, { currentDirectory: sessionDirectory, homeDirectory });
  }, [resolvedPath, sessionDirectory, homeDirectory]);
  const [content, setContent] = React.useState<string>('');
  const { isPlaying: isTTSPlaying, play: playTTS, stop: stopTTS } = useMessageTTS();
  const showMessageTTSButtons = useConfigStore((state) => state.showMessageTTSButtons);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
<<<<<<< HEAD
  const planFileLabel = React.useMemo(() => {
    return displayPath ? displayPath.split('/').pop() || t('planView.file.defaultName') : t('planView.file.defaultName');
  }, [displayPath, t]);
  // Comments name the plan by its full path, as Files does for a file.
  const commentFileLabel = resolvedPath ?? loadedProjectPlanPath ?? planFileLabel;
||||||| bc50ba56aa
  const planFileLabel = t('planView.file.defaultName');
  // Comments name the plan by its full path, as Files does for a file.
  const commentFileLabel = loadedProjectPlanPath ?? planFileLabel;
=======
  const planFileLabel = t('planView.file.defaultName');
  const commentFileLabel = loadedProjectPlanPath ?? planFileLabel;
>>>>>>> upstream/main
  const parsedTitle = React.useMemo(() => {
    if (!content.trim()) {
      return t('planView.title.default');
    }
    return parsePlanMarkdown(content, t('planView.title.default')).title;
  }, [content, t]);
  const previewContent = React.useMemo(() => {
    const heading = LEADING_HEADING.exec(content);
    return heading ? content.slice(heading[0].length) : content;
  }, [content]);
  const sendPromptTitle = React.useMemo(() => parsedTitle.trim() || t('planView.title.default'), [parsedTitle, t]);
  const [loading, setLoading] = React.useState(false);
  const [mdViewMode, setMdViewMode] = React.useState<'preview' | 'edit'>('preview');
  const [startsEmpty, setStartsEmpty] = React.useState(false);
  const viewMode = startsEmpty ? 'edit' : mdViewMode;

  const [lineSelection, setLineSelection] = React.useState<SelectedLineRange | null>(null);
  const editorViewRef = React.useRef<EditorView | null>(null);
  const editorWrapperRef = React.useRef<HTMLDivElement | null>(null);
  const previewRef = React.useRef<HTMLDivElement | null>(null);
<<<<<<< HEAD
||||||| bc50ba56aa
  const setPreviewContainer = React.useCallback((node: HTMLDivElement | null) => {
    previewRef.current = node;
  }, []);

  const openLinkedFile = React.useCallback((absolutePath: string) => {
    if (!savedPlanProjectRef?.path) return;
    useUIStore.getState().openContextFile(savedPlanProjectRef.path, absolutePath);
  }, [savedPlanProjectRef]);
  const markdownDocumentAssets = useMarkdownLocalAssets({
    filePath: loadedProjectPlanPath,
    workspaceRoot: savedPlanProjectRef?.path ?? null,
    onOpenFile: openLinkedFile,
    enabled: mdViewMode === 'preview' && hasDocument,
    colorScheme: currentTheme.metadata.variant === 'light' ? 'light' : 'dark',
  });
=======
  const setPreviewContainer = React.useCallback((node: HTMLDivElement | null) => {
    previewRef.current = node;
  }, []);

  const openLinkedFile = React.useCallback((absolutePath: string) => {
    if (!savedPlanProjectRef?.path) return;
    useUIStore.getState().openContextFile(savedPlanProjectRef.path, absolutePath);
  }, [savedPlanProjectRef]);
  const markdownDocumentAssets = useMarkdownLocalAssets({
    filePath: loadedProjectPlanPath,
    workspaceRoot: savedPlanProjectRef?.path ?? null,
    onOpenFile: openLinkedFile,
    enabled: viewMode === 'preview' && hasDocument,
    colorScheme: currentTheme.metadata.variant === 'light' ? 'light' : 'dark',
  });
>>>>>>> upstream/main

  const MD_VIEWER_MODE_KEY = 'openchamber:plan:md-viewer-mode';

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(MD_VIEWER_MODE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as unknown;
      if (parsed === 'preview' || parsed === 'edit') {
        setMdViewMode(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  const saveMdViewMode = React.useCallback((mode: 'preview' | 'edit') => {
    setStartsEmpty(false);
    setMdViewMode(mode);
    try {
      localStorage.setItem(MD_VIEWER_MODE_KEY, JSON.stringify(mode));
    } catch {
      // ignore
    }
  }, []);
  const isSelectingRef = React.useRef(false);
  const selectionStartRef = React.useRef<number | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      isSelectingRef.current = false;
      selectionStartRef.current = null;
      setIsDragging(false);
    };
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const extractSelectedCode = React.useCallback((text: string, range: SelectedLineRange): string => {
    const lines = text.split('\n');
    const startLine = Math.max(1, range.start);
    const endLine = Math.min(lines.length, range.end);
    if (startLine > endLine) return '';
    return lines.slice(startLine - 1, endLine).join('\n');
  }, []);

  const commentController = useInlineCommentController<SelectedLineRange>({
    source: 'plan',
    fileLabel: commentFileLabel,
    language: resolvedPath ? getLanguageFromExtension(resolvedPath) || 'markdown' : 'markdown',
    getCodeForRange: (range) => extractSelectedCode(content, normalizeLineRange(range)),
    toStoreRange: (range) => ({ startLine: range.start, endLine: range.end }),
    fromDraftRange: (draft) => ({ start: draft.startLine, end: draft.endLine }),
  });

  const {
    drafts: planFileDrafts,
    commentText,
    setCommentText,
    editingDraftId,
    setSelection: setCommentSelection,
    saveComment,
    cancel,
    reset,
    startEdit,
    deleteDraft,
  } = commentController;

  React.useEffect(() => {
    setLineSelection(null);
    reset();
  }, [content, reset]);

  React.useEffect(() => {
    setCommentSelection(lineSelection);
  }, [lineSelection, setCommentSelection]);

  const handleCancelComment = React.useCallback(() => {
    setLineSelection(null);
    cancel();
  }, [cancel]);

  const handleSaveComment = React.useCallback((textToSave: string, rangeOverride?: { start: number; end: number }): boolean => {
    if (rangeOverride) {
      setLineSelection(rangeOverride);
    }
    const saved = saveComment(textToSave, rangeOverride ?? lineSelection ?? undefined);
    if (saved) setLineSelection(null);
    return saved;
  }, [lineSelection, saveComment]);

  React.useEffect(() => {
    if (!lineSelection) return;

    if (isMobile && !editingDraftId) {
      // Input handles mobile scroll/focus behavior.
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('[data-comment-card="true"]') ||
        target.closest('[data-comment-input="true"]') ||
        target.closest('.oc-block-widget')
      ) {
        return;
      }

      if (target.closest('.cm-gutterElement')) return;
      if (target.closest('[data-sonner-toast]') || target.closest('[data-sonner-toaster]')) return;

      if (!commentText.trim()) {
        setLineSelection(null);
        cancel();
      }
    };

    const timeoutId = window.setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [cancel, commentText, editingDraftId, isMobile, lineSelection]);

  const editorFontSize = useUIStore((state) => state.editorFontSize);

  const editorExtensions = React.useMemo(() => {
    // Shiki token colors only for code files; markdown keeps the lezer
    // highlighter (markdown-aware bold headings etc., and no Shiki view to match).
    const shikiLanguage = resolvedPath ? getLanguageFromExtension(resolvedPath) : null;
    const useShiki = Boolean(shikiLanguage) && shikiLanguage !== 'markdown';
    const extensions = [createFlexokiCodeMirrorTheme(currentTheme, useShiki ? { syntaxColors: false, fontSize: editorFontSize } : { fontSize: editorFontSize })];
    const language = languageByExtension(resolvedPath || 'plan.md');
    if (language) {
      extensions.push(language);
    }
    if (useShiki && shikiLanguage) {
      extensions.push(codeHighlightExtension({
        language: shikiLanguage,
        themeName: currentTheme.metadata.id,
        theme: getCodeTokenTheme(currentTheme),
      }));
    }
    extensions.push(EditorView.lineWrapping);
    return extensions;
  }, [currentTheme, resolvedPath, editorFontSize]);

  const docRef = React.useRef<{
    key: string | null;
    target: SavedProjectPlanTarget | { filePath: string } | null;
    content: string;
    editRevision: number;
    savedRevision: number;
    runtimeKey: string;
  }>({ key: null, target: null, content: '', editRevision: 0, savedRevision: 0, runtimeKey: '' });
  const saveQueue = React.useState(createPlanSaveQueue)[0];

<<<<<<< HEAD
  // Filesystem writes keep the runtime adapter precedence the view always
  // used: the active RuntimeAPIs first, the registry as fallback.
  const writeDocument = React.useCallback(async (target: NonNullable<typeof docRef.current['target']>, text: string): Promise<void> => {
    if ('filePath' in target) {
      const files = runtimeApis.files ?? getRegisteredRuntimeAPIs()?.files;
      if (files?.writeFile) {
        const result = await files.writeFile(target.filePath, text);
        if (!result?.success) {
          throw new Error('Plan file write failed');
        }
        return;
      }
      const response = await runtimeFetch('/api/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: target.filePath, content: text }),
      });
      if (!response.ok) {
        throw new Error(`Failed to write plan file (${response.status})`);
      }
      return;
    }
    const saved = await useProjectContextStore.getState().savePlan(target.projectRef, target.planId, text);
    if (!saved) {
      throw new Error('Plan save rejected: the plan no longer exists');
    }
  }, [runtimeApis.files]);
  const writeDocumentRef = React.useRef(writeDocument);
  writeDocumentRef.current = writeDocument;

  // Queue any unflushed edits. Runs on document switches and on unmount, both
  // of which cancel the debounced save — without this the last 350ms of typing
  // is silently dropped. The queue orders it behind any write already in
  // flight for the same document, and the captured runtime key stops content
  // from one host being written into another after a runtime switch.
||||||| bc50ba56aa
  // Queue any unflushed edits. Runs on document switches and on unmount, both
  // of which cancel the debounced save — without this the last 350ms of typing
  // is silently dropped. The queue orders it behind any write already in
  // flight for the same document, and the captured runtime key stops content
  // from one host being written into another after a runtime switch.
=======
>>>>>>> upstream/main
  const scheduleSave = React.useCallback(() => {
    const doc = docRef.current;
    if (!doc.key || !doc.target || doc.editRevision <= doc.savedRevision) {
      return;
    }
    const captured = {
      key: doc.key,
      target: doc.target,
      content: doc.content,
      revision: doc.editRevision,
      runtimeKey: doc.runtimeKey,
      write: writeDocumentRef.current,
    };
    saveQueue.schedule(captured.key, captured.revision, async () => {
      if (getRuntimeKey() !== captured.runtimeKey) {
        return;
      }
      await captured.write(captured.target, captured.content);
      const current = docRef.current;
      if (current.key === captured.key) {
        current.savedRevision = Math.max(current.savedRevision, captured.revision);
        setSaveError(null);
      }
    }).catch((error) => {
      if (docRef.current.key === captured.key) {
        setSaveError(error instanceof Error ? error.message : 'Plan save failed');
      }
    });
  }, [saveQueue]);

  React.useEffect(() => {
    // A plan view with no file or saved project plan has nothing to show.
    if (!targetPath && !savedPlanId) {
      scheduleSave();
      docRef.current = { key: null, target: null, content: '', editRevision: 0, savedRevision: 0, runtimeKey: '' };
      setResolvedPath(null);
      setLoadedProjectPlanId(null);
      setLoadedProjectPlanPath(null);
      setContent('');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const readText = async (path: string): Promise<string> => {
      if (runtimeApis.files?.readFile) {
        const result = await runtimeApis.files.readFile(path);
        return result?.content ?? '';
      }

      const runtimeFiles = getRegisteredRuntimeAPIs()?.files;
      if (runtimeFiles?.readFile) {
        const result = await runtimeFiles.readFile(path, { optional: true });
        return result?.content ?? '';
      }

      const response = await runtimeFetch(`/api/fs/read?path=${encodeURIComponent(path)}&optional=true`, {
        // Avoid conditional requests (304 + empty body).
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Failed to read plan file (${response.status})`);
      }
      return response.text();
    };

    const run = async () => {
      scheduleSave();
      docRef.current = { key: null, target: null, content: '', editRevision: 0, savedRevision: 0, runtimeKey: '' };
      setResolvedPath(null);
      setLoadedProjectPlanId(null);
      setLoadedProjectPlanPath(null);
      setContent('');
      setSaveError(null);
      setLoadError(null);

      if (savedPlanId && savedPlanProjectRef && savedPlanKey) {
        // A plan re-opened while its own flush is still writing must read the
        // post-write state, not race it. The queue reset afterwards is safe:
        // every write for this key has settled, and the reloaded document
        // restarts its revision counter at zero.
        await saveQueue.pendingFor(savedPlanKey);
        if (cancelled) return;
        saveQueue.reset(savedPlanKey);
        setLoading(true);
        try {
          const plan = await fetchProjectPlan(savedPlanProjectRef, savedPlanId);
          if (cancelled) return;
          if (!plan) {
            // The plan or its markdown is gone. Leave the view empty and
            // unsaveable rather than presenting an editor that would recreate
            // a document the user deleted.
            setLoadError('Plan not found');
            return;
          }
          docRef.current = {
            key: savedPlanKey,
            target: { projectRef: savedPlanProjectRef, planId: savedPlanId },
            content: plan.raw,
            editRevision: 0,
            savedRevision: 0,
            runtimeKey: activeRuntimeKey,
          };
          setContent(plan.raw);
          setLoadedProjectPlanId(savedPlanId);
          setLoadedProjectPlanPath(plan.path ?? null);
        } catch (error) {
          if (cancelled) return;
          setLoadError(error instanceof Error ? error.message : 'Plan load failed');
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

<<<<<<< HEAD
      if (targetPath) {
        const fileKey = JSON.stringify(['plan-file', activeRuntimeKey, targetPath]);
        await saveQueue.pendingFor(fileKey);
||||||| bc50ba56aa
      // A plan re-opened while its own flush is still writing must read the
      // post-write state, not race it. The queue reset afterwards is safe:
      // every write for this key has settled, and the reloaded document
      // restarts its revision counter at zero.
      await saveQueue.pendingFor(savedPlanKey);
      if (cancelled) return;
      saveQueue.reset(savedPlanKey);
      setLoading(true);
      try {
        const plan = await fetchProjectPlan(savedPlanProjectRef, savedPlanId);
=======
      await saveQueue.pendingFor(savedPlanKey);
      if (cancelled) return;
      saveQueue.reset(savedPlanKey);
      setLoading(true);
      try {
        const plan = await fetchProjectPlan(savedPlanProjectRef, savedPlanId);
>>>>>>> upstream/main
        if (cancelled) return;
<<<<<<< HEAD
        saveQueue.reset(fileKey);
        setLoading(true);
        try {
          const text = await readText(targetPath);
          if (cancelled) return;
          docRef.current = {
            key: fileKey,
            target: { filePath: targetPath },
            content: text,
            editRevision: 0,
            savedRevision: 0,
            runtimeKey: activeRuntimeKey,
          };
          setResolvedPath(targetPath);
          setContent(text);
        } catch {
          if (cancelled) return;
          setResolvedPath(null);
          setContent('');
        } finally {
          if (!cancelled) setLoading(false);
||||||| bc50ba56aa
        if (!plan) {
          // The plan or its markdown is gone. Leave the view empty and
          // unsaveable rather than presenting an editor that would recreate
          // a document the user deleted.
          setLoadError('Plan not found');
          return;
=======
        if (!plan) {
          setLoadError('Plan not found');
          return;
>>>>>>> upstream/main
        }
<<<<<<< HEAD
        return;
||||||| bc50ba56aa
        docRef.current = {
          key: savedPlanKey,
          target: { projectRef: savedPlanProjectRef, planId: savedPlanId },
          content: plan.raw,
          editRevision: 0,
          savedRevision: 0,
          runtimeKey: activeRuntimeKey,
        };
        setContent(plan.raw);
        setLoadedProjectPlanId(savedPlanId);
        setLoadedProjectPlanPath(plan.path ?? null);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Plan load failed');
      } finally {
        if (!cancelled) setLoading(false);
=======
        docRef.current = {
          key: savedPlanKey,
          target: { projectRef: savedPlanProjectRef, planId: savedPlanId },
          content: plan.raw,
          editRevision: 0,
          savedRevision: 0,
          runtimeKey: activeRuntimeKey,
        };
        setContent(plan.raw);
        setStartsEmpty(!parsePlanMarkdown(plan.raw, '').body.trim());
        setLoadedProjectPlanId(savedPlanId);
        setLoadedProjectPlanPath(plan.path ?? null);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Plan load failed');
      } finally {
        if (!cancelled) setLoading(false);
>>>>>>> upstream/main
      }

      setResolvedPath(null);
      setContent('');
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [activeRuntimeKey, homeDirectory, runtimeApis.files, savedPlanId, savedPlanKey, savedPlanProjectRef, saveQueue, scheduleSave, sessionDirectory, targetPath]);

<<<<<<< HEAD
  // Synchronous buffer tracking: if an edit and an unmount land in the same
  // batch, the passive content effect would never run and a flush would save
  // a stale buffer. The editor echoes text it was given as a change; that echo
  // is not an edit and must not schedule a save or mark the document dirty.
  const handleContentChange = React.useCallback((next: string) => {
    if (next === docRef.current.content) return;
    docRef.current.content = next;
    docRef.current.editRevision += 1;
    setContent(next);
  }, []);

  // The debounced write and the close/switch flush go through the same queue
  // (scheduleSave), so two saves of one document can never complete out of
  // order and a flush never duplicates a debounce of the same revision.
||||||| bc50ba56aa
  // An agent can change the open plan, through the knowledge tool or by
  // editing its file. With no unsaved edits the editor takes the new text, so
  // a later edit starts from it instead of writing the old document back over
  // it. Unsaved edits win: the next save replaces the agent's version, the way
  // typing in a note does. A save through the API announces itself; a file
  // edit does not, so the open plan also watches or polls its file, as the
  // file panel does for open files.
=======
  const [heldForMove, setHeldForMove] = React.useState(false);
  React.useEffect(() => {
    if (!savedPlanProjectRef || !savedPlanId || !savedPlanKey || loadedProjectPlanId !== savedPlanId) return;
    return registerOpenPlan(resolveProjectContextId(savedPlanProjectRef), savedPlanId, {
      setHeld: setHeldForMove,
      flush: async () => {
        scheduleSave();
        await saveQueue.pendingFor(savedPlanKey);
        const doc = docRef.current;
        return doc.key === savedPlanKey && doc.savedRevision >= doc.editRevision;
      },
    });
  }, [loadedProjectPlanId, savedPlanId, savedPlanKey, savedPlanProjectRef, saveQueue, scheduleSave]);

>>>>>>> upstream/main
  React.useEffect(() => {
    if (!resolvedPath && !loadedProjectPlanId) {
      return;
    }

    const controller = window.setTimeout(() => {
      scheduleSave();
    }, 350);

    return () => {
      window.clearTimeout(controller);
    };
  }, [content, loadedProjectPlanId, resolvedPath, scheduleSave]);

  // A plan the agent rewrote on disk must reach the open editor without a
  // reload. Its own save announces itself through the project context,
  // which this view listens to, and the poll covers an edit that announces
  // nothing. Unsaved typing wins: the check skips a dirty document.
  React.useEffect(() => {
    if (!savedPlanProjectRef || !savedPlanId || !savedPlanKey || loadedProjectPlanId !== savedPlanId) return;
    const doc = docRef.current;
    if (doc.key !== savedPlanKey) return;
    const poller = createFileContentPoller({
      readContent: async () => {
        await saveQueue.pendingFor(savedPlanKey);
        const plan = await fetchProjectPlan(savedPlanProjectRef, savedPlanId);
        if (!plan) throw new Error('Plan not found');
        return plan.raw;
      },
      getLoadedContent: () => doc.content,
      getLoadedRevision: () => doc.editRevision,
      isDirty: () => docRef.current !== doc || doc.editRevision > doc.savedRevision,
      applyContent: (raw) => {
        doc.content = raw;
        setContent(raw);
      },
    });
    let polling = false;
    let pollAgain = false;
    const poll = async () => {
      if (document.visibilityState === 'hidden') return;
      if (polling) {
        pollAgain = true;
        return;
      }
      polling = true;
      try {
        await poller.poll();
      } finally {
        polling = false;
        if (pollAgain) {
          pollAgain = false;
          void poll();
        }
      }
    };
    const release = observeProjectContext(savedPlanProjectRef, poll);
<<<<<<< HEAD
    const interval = window.setInterval(() => { void poll(); }, WATCHED_PLAN_POLL_MS);
||||||| bc50ba56aa
    let interval = window.setInterval(() => { void poll(); }, 2000);
    // A plan kept in the repository is watched by OpenCode, so its change
    // event starts the check and the poll only covers a watch lost on an
    // OpenCode restart. A plan in OpenChamber's own data folder keeps polling.
    const watch = loadedProjectPlanPath
      ? watchFileOnScreen(savedPlanProjectRef.path, loadedProjectPlanPath, () => { void poll(); })
      : null;
    let stopped = false;
    void watch?.watching.then((watching) => {
      if (!watching || stopped) return;
      window.clearInterval(interval);
      interval = window.setInterval(() => { void poll(); }, WATCHED_PLAN_POLL_MS);
    });
=======
    let interval = window.setInterval(() => { void poll(); }, 2000);
    const watch = loadedProjectPlanPath
      ? watchFileOnScreen(savedPlanProjectRef.path, loadedProjectPlanPath, () => { void poll(); })
      : null;
    let stopped = false;
    void watch?.watching.then((watching) => {
      if (!watching || stopped) return;
      window.clearInterval(interval);
      interval = window.setInterval(() => { void poll(); }, WATCHED_PLAN_POLL_MS);
    });
>>>>>>> upstream/main
    return () => {
      window.clearInterval(interval);
      release();
      poller.dispose();
    };
<<<<<<< HEAD
  }, [loadedProjectPlanId, savedPlanId, savedPlanKey, savedPlanProjectRef, saveQueue]);
||||||| bc50ba56aa
  }, [loadedProjectPlanId, loadedProjectPlanPath, savedPlanId, savedPlanKey, savedPlanProjectRef, saveQueue, visible]);

  // Synchronous buffer tracking: if an edit and an unmount land in the same
  // batch, the passive content effect would never run and a flush would save
  // a stale buffer. The editor echoes text it was given as a change; that
  // echo is not an edit and must not schedule a save.
  const handleContentChange = React.useCallback((next: string) => {
    if (next === docRef.current.content) return;
    docRef.current.content = next;
    docRef.current.editRevision += 1;
    setContent(next);
  }, []);

  // The debounced write and the close/switch flush go through the same queue
  // (scheduleSave), so two saves of one document can never complete out of
  // order and a flush never duplicates a debounce of the same revision.
  React.useEffect(() => {
    if (!loadedProjectPlanId) {
      return;
    }

    const controller = window.setTimeout(() => {
      scheduleSave();
    }, 350);

    return () => {
      window.clearTimeout(controller);
    };
  }, [content, loadedProjectPlanId, scheduleSave]);
=======
  }, [loadedProjectPlanId, loadedProjectPlanPath, savedPlanId, savedPlanKey, savedPlanProjectRef, saveQueue, visible]);

  const handleContentChange = React.useCallback((next: string) => {
    if (next === docRef.current.content) return;
    docRef.current.content = next;
    docRef.current.editRevision += 1;
    setContent(next);
  }, []);

  React.useEffect(() => {
    if (!loadedProjectPlanId) {
      return;
    }

    const controller = window.setTimeout(() => {
      scheduleSave();
    }, 350);

    return () => {
      window.clearTimeout(controller);
    };
  }, [content, loadedProjectPlanId, scheduleSave]);
>>>>>>> upstream/main

  React.useEffect(() => {
    return () => {
      scheduleSave();
    };
  }, [scheduleSave]);

  const routeToChat = React.useCallback(() => {
    setSessionSwitcherOpen(false);
    onNavigatedToChat?.();
  }, [onNavigatedToChat, setSessionSwitcherOpen]);

  const handleConfirmPlanSend = React.useCallback(
<<<<<<< HEAD
    async (execution: TodoSendExecution) => {
      // A saved plan sends against its own project — the one it is stored
      // under — not against whatever directory the viewer is currently in.
      // For filesystem plans those are the same directory.
||||||| bc50ba56aa
    async (dialogExecution: TodoSendExecution) => {
      // A saved plan sends against its own project — the one it is stored
      // under — not against whatever directory the viewer is currently in.
=======
    async (dialogExecution: TodoSendExecution) => {
>>>>>>> upstream/main
      const sendTargetProject = savedPlanProjectRef ?? currentProjectRef;
      if (!sendTargetProject || !pendingPlanSend || isManagedChatPlan) {
        return;
      }
      const runtimeKey = getRuntimeKey();
      const revision = getRuntimeSwitchRevision();
      const assertOwner = () => {
        if (getRuntimeKey() !== runtimeKey || getRuntimeSwitchRevision() !== revision) throw new Error('Runtime changed');
      };

<<<<<<< HEAD
||||||| bc50ba56aa
      // A saved plan is a markdown file too, so the agent reads it and ticks
      // its steps there like any other plan file.
      const planFilePath = loadedProjectPlanPath;
=======
      const planFilePath = loadedProjectPlanPath;
>>>>>>> upstream/main
      setIsPlanSendSubmitting(true);

      try {
<<<<<<< HEAD
||||||| bc50ba56aa
        let prompts: MagicPromptSnapshot;
        try {
          // The plan's project owns the prompts, also when the session lands in a new worktree.
          prompts = await loadMagicPrompts(sendTargetProject.path);
        } catch (error) {
          // Nothing was created yet; the send dialog stays open with its choices.
          toast.error(t('magicPrompts.toast.loadFailed'), { description: error instanceof Error ? error.message : undefined });
          return;
        }
        const visiblePrompt = prompts.render(
          pendingPlanSend.action === 'improve' ? 'plan.improve.visible' : 'plan.implement.visible',
          {
            plan_title: sendPromptTitle,
          },
        );
        const instructionsText = prompts.render(
          pendingPlanSend.action === 'improve' ? 'plan.improve.instructions' : 'plan.implement.instructions',
          {
            plan_title: sendPromptTitle,
            plan_path: planFilePath ?? '',
          },
        );
        // A server that answered without the plan's path leaves the agent no
        // file to read, so the plan substance rides along in the message.
        const planSubstance = planFilePath
          ? instructionsText
          : [
              instructionsText,
              '',
              'The plan is not stored as a file in the repository and has no file path. Its full current contents follow below this note and are the source of truth for the plan. Where the instructions above refer to the plan file, treat the plan as stored in OpenChamber project knowledge (it is edited through the OpenChamber UI): propose plan revisions as plan text in the chat rather than editing a file.',
              '',
              content,
            ].join('\n');
        const syntheticParts = [{ synthetic: true as const, text: planSubstance }];

=======
        let prompts: MagicPromptSnapshot;
        try {
          prompts = await loadMagicPrompts(sendTargetProject.path);
        } catch (error) {
          toast.error(t('magicPrompts.toast.loadFailed'), { description: error instanceof Error ? error.message : undefined });
          return;
        }
        const visiblePrompt = prompts.render(
          pendingPlanSend.action === 'improve' ? 'plan.improve.visible' : 'plan.implement.visible',
          {
            plan_title: sendPromptTitle,
          },
        );
        const instructionsText = prompts.render(
          pendingPlanSend.action === 'improve' ? 'plan.improve.instructions' : 'plan.implement.instructions',
          {
            plan_title: sendPromptTitle,
            plan_path: planFilePath ?? '',
          },
        );
        const planSubstance = planFilePath
          ? instructionsText
          : [
              instructionsText,
              '',
              'The plan is not stored as a file in the repository and has no file path. Its full current contents follow below this note and are the source of truth for the plan. Where the instructions above refer to the plan file, treat the plan as stored in OpenChamber project knowledge (it is edited through the OpenChamber UI): propose plan revisions as plan text in the chat rather than editing a file.',
              '',
              content,
            ].join('\n');
        const syntheticParts = [{ synthetic: true as const, text: planSubstance }];

>>>>>>> upstream/main
        routeToChat();

        let sessionId: string | null = null;
        let directoryHint: string | null = sendTargetProject.path;

        if (pendingPlanSend.target === 'worktree') {
          if (!canCreateWorktree) {
            return;
          }
          const created = await createWorktreeSessionForNewBranch(sendTargetProject.path, generateBranchName(), undefined, {
            providerId: execution.providerID, modelId: execution.modelID, variant: execution.variant || undefined,
          });
          assertOwner();
          if (!created?.id) {
            return;
          }
          sessionId = created.id;
          directoryHint = created.directory;
        } else {
          const sessionResult = await createSession(undefined, sendTargetProject.path, undefined, {
            model: { providerId: execution.providerID, modelId: execution.modelID },
            variant: execution.variant || undefined,
          });
          assertOwner();
          if (!sessionResult?.sessionId) {
            return;
          }
          sessionId = sessionResult.sessionId;
          directoryHint = resolveGlobalSessionDirectory(sessionResult) ?? sendTargetProject.path;
        }

        if (!sessionId) {
          return;
        }
        const prompts = await loadMagicPrompts(directoryHint);
        assertOwner();
        const visiblePrompt = prompts.render(
          pendingPlanSend.action === 'improve' ? 'plan.improve.visible' : 'plan.implement.visible',
          { plan_title: sendPromptTitle },
        );
        const instructionsText = prompts.render(
          pendingPlanSend.action === 'improve' ? 'plan.improve.instructions' : 'plan.implement.instructions',
          { plan_title: sendPromptTitle, plan_path: resolvedPath ?? '' },
        );
        // Saved plans have no file path, so their content must accompany the instructions.
        const planSubstance = resolvedPath
          ? instructionsText
          : [
              instructionsText,
              '',
              'The plan is not stored as a file in the repository and has no file path. Its full current contents follow below this note and are the source of truth for the plan. Where the instructions above refer to the plan file, treat the plan as stored in OhPiChamber project knowledge (it is edited through the OhPiChamber UI): propose plan revisions as plan text in the chat rather than editing a file.',
              '',
              content,
            ].join('\n');
        const syntheticParts = [{ synthetic: true as const, text: planSubstance }];

        const selectionState = useSelectionStore.getState();
        selectionState.saveSessionModelSelection(sessionId, execution.providerID, execution.modelID);

        setCurrentSession(sessionId, directoryHint);
<<<<<<< HEAD
        // "Run as goal" uses the composer's arm mechanism. Set it either way
        // so an unrelated armed flag cannot leak into this plan send. OMP
        // receives the full plan objective before the first prompt; the
        // prompt carries the plan text or points to its source file.
        const goalObjective = execution.runAsGoal === true
||||||| bc50ba56aa
        // The plan's card leads to the session working on it. A failed link
        // costs only that shortcut, so it never holds up the send.
        if (savedPlanProjectRef && savedPlanId) {
          void useProjectContextStore.getState().linkPlanSession(savedPlanProjectRef, savedPlanId, sessionId);
        }
        // "Run as goal" rides the same arm mechanism as the composer target
        // button; set explicitly either way so a stray armed flag cannot
        // leak into a non-goal plan send. The objective override carries the
        // plan substance — "Implement this plan: X" alone would give the
        // progress audit nothing to judge against. Plans that exceed the
        // objective limit are distilled into completion criteria by the
        // small model (the working agent always reads the full plan from
        // its file); on distillation failure a head+tail excerpt keeps the
        // intent (top) and acceptance criteria (bottom), sacrificing the
        // implementation middle the agent reads from the file anyway.
        // Oversized objectives (huge plans) are distilled into audit
        // criteria inside setSessionGoal — the shared path for every goal
        // source. Here we only compose header + full content.
        // Improve stops before implementation, so only Implement runs as a goal.
        const runAsGoal = pendingPlanSend.action === 'implement' && execution.runAsGoal === true;
        const goalObjective = runAsGoal
=======
        if (savedPlanProjectRef && savedPlanId) {
          void useProjectContextStore.getState().linkPlanSession(savedPlanProjectRef, savedPlanId, sessionId);
        }
        const runAsGoal = pendingPlanSend.action === 'implement' && execution.runAsGoal === true;
        const goalObjective = runAsGoal
>>>>>>> upstream/main
          ? [
              `Implement the plan "${sendPromptTitle}" end-to-end${resolvedPath ? ` (plan file: ${resolvedPath})` : ' (the full plan follows)'}.`,
              resolvedPath
                ? 'Re-read that file for full details — it is the source of truth.'
                : 'The full plan follows in this message and is the source of truth.',
              '',
              content,
            ].join('\n')
          : null
        useSessionGoalArmStore.getState().setArmed(execution.runAsGoal === true, goalObjective, true);
        await sendMessage(
          visiblePrompt,
          execution.providerID,
          execution.modelID,
          null,
          undefined,
          undefined,
          syntheticParts,
          execution.variant || undefined,
          undefined,
          { target: { runtimeKey, sessionId, directory: directoryHint }, runtimeRevision: revision },
        );
        assertOwner();

        setPendingPlanSend(null);
      } finally {
        setIsPlanSendSubmitting(false);
      }
    },
    [canCreateWorktree, content, createSession, currentProjectRef, isManagedChatPlan, pendingPlanSend, resolvedPath, routeToChat, savedPlanProjectRef, sendMessage, sendPromptTitle, setCurrentSession]
  );

  const blockWidgets = React.useMemo(() => {
    return buildCodeMirrorCommentWidgets({
      drafts: planFileDrafts,
      editingDraftId,
      commentText,
      onTextChange: setCommentText,
      selection: lineSelection,
      isDragging,
      fileLabel: planFileLabel,
      newWidgetId: 'plan-new-comment-input',
      mapDraftToRange: (draft) => ({ start: draft.startLine, end: draft.endLine }),
      onSave: handleSaveComment,
      onCancel: handleCancelComment,
      onEdit: (draft) => {
        startEdit(draft);
        setLineSelection({ start: draft.startLine, end: draft.endLine });
      },
      onDelete: deleteDraft,
    });
  }, [commentText, deleteDraft, editingDraftId, handleCancelComment, handleSaveComment, isDragging, lineSelection, planFileDrafts, planFileLabel, setCommentText, startEdit]);

<<<<<<< HEAD
||||||| bc50ba56aa
  // Improve and implement each open the same choice of where the plan goes.
  const sendMenu = (action: 'improve' | 'implement') => (
    <>
      <DropdownMenuItem
        onClick={() => setPendingPlanSend({ action, target: 'session' })}
        disabled={isManagedChatPlan}
      >
        {t('planView.actions.sendToNewSession')}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => setPendingPlanSend({ action, target: 'worktree' })}
        disabled={!canCreateWorktree}
      >
        {t('planView.actions.sendToNewWorktreeSession')}
      </DropdownMenuItem>
    </>
  );

  const copyPlanContents = async () => {
    const result = await copyTextToClipboard(content);
    if (!result.ok) return;
    setCopiedContent(true);
    if (copiedContentTimeoutRef.current !== null) {
      window.clearTimeout(copiedContentTimeoutRef.current);
    }
    copiedContentTimeoutRef.current = window.setTimeout(() => {
      setCopiedContent(false);
    }, 1200);
  };

=======
  const sendMenu = (action: 'improve' | 'implement') => (
    <>
      <DropdownMenuItem
        onClick={() => setPendingPlanSend({ action, target: 'session' })}
        disabled={isManagedChatPlan}
      >
        {t('planView.actions.sendToNewSession')}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => setPendingPlanSend({ action, target: 'worktree' })}
        disabled={!canCreateWorktree}
      >
        {t('planView.actions.sendToNewWorktreeSession')}
      </DropdownMenuItem>
    </>
  );

  const copyPlanContents = async () => {
    const result = await copyTextToClipboard(content);
    if (result.ok) toast.success(t('planView.toast.copied'));
  };

  const entryActions: ToolbarAction[] = planLink && savedPlanProjectRef ? [
    {
      id: 'pin',
      label: pinnedPlanIds.has(planLink.id)
        ? t('rightSidebar.contextNotesTodo.pin.detach')
        : t('rightSidebar.contextNotesTodo.pin.attach'),
      icon: pinnedPlanIds.has(planLink.id) ? 'pushpin-2-fill' : 'pushpin-2',
      onSelect: () => void togglePlanPin(planLink.id, !pinnedPlanIds.has(planLink.id)),
    },
    ...planActions.actionsFor(planLink, { onDeleted: onClose }).filter((action) => action.id !== 'move').map((action): ToolbarAction => ({
      id: action.id,
      label: action.label,
      icon: action.id === 'open-session' ? 'chat-3' : 'delete-bin',
      disabled: action.disabled,
      destructive: action.destructive,
      onSelect: action.onSelect,
    })),
  ] : [];
  const sendDisabled = !previewContent.trim() || isManagedChatPlan;

>>>>>>> upstream/main
  return (
    <div className="relative flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-background">
<<<<<<< HEAD
      <div className="flex min-w-0 items-center gap-2 border-b border-border/40 px-3 py-1.5 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <div className="typography-ui-label font-medium truncate">{parsedTitle}</div>
          {loadError ? (
            <div className="typography-micro text-[color:var(--status-error)] truncate" title={loadError}>
              {t('planView.error.loadFailed')}
||||||| bc50ba56aa
      <ContextPanelHeaderToolbar>
      <div className={cn('flex min-w-0 items-center gap-2', inPanelHeader ? 'flex-1 py-1 pe-1' : 'border-b border-edge-muted px-3 py-1.5 flex-shrink-0')}>
        {leading}
        <ActionToolbar
          className="flex-1"
          start={(
            <div className="min-w-0 flex-1">
              <div className="typography-ui-label font-medium truncate">{parsedTitle}</div>
              {loadError ? (
                <div className="typography-micro text-[color:var(--status-error)] truncate" title={loadError}>
                  {t('planView.error.loadFailed')}
                </div>
              ) : null}
              {saveError ? (
                <div className="typography-micro text-[color:var(--status-error)] truncate" title={saveError}>
                  {t('planView.error.saveFailed')}
                </div>
              ) : null}
=======
      <ContextPanelHeaderToolbar>
      <div className={cn('flex min-w-0 items-center gap-2', inPanelHeader ? 'flex-1 py-1 pe-1' : 'border-b border-edge-muted px-3 py-1.5 flex-shrink-0')}>
        {leading}
        <ActionToolbar
          className="flex-1"
          start={(
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate typography-ui-label font-medium" dir="auto">{parsedTitle}</span>
                {planLink?.progress ? <PlanProgressLabel progress={planLink.progress} /> : null}
              </div>
              {loadError ? (
                <div className="typography-micro text-[color:var(--status-error)] truncate" title={loadError}>
                  {t('planView.error.loadFailed')}
                </div>
              ) : null}
              {saveError ? (
                <div className="typography-micro text-[color:var(--status-error)] truncate" title={saveError}>
                  {t('planView.error.saveFailed')}
                </div>
              ) : null}
>>>>>>> upstream/main
            </div>
<<<<<<< HEAD
          ) : null}
          {saveError ? (
            <div className="typography-micro text-[color:var(--status-error)] truncate" title={saveError}>
              {t('planView.error.saveFailed')}
            </div>
          ) : null}
        </div>
        {hasDocument ? (
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      aria-label={t('planView.actions.improvePlanAria')}
                      disabled={!content.trim() || isManagedChatPlan}
                    >
                      <Icon name="loop-right-ai" className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent sideOffset={8}>{t('planView.actions.improve')}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setPendingPlanSend({ action: 'improve', target: 'session' })}
                  disabled={isManagedChatPlan}
                >
                  {t('planView.actions.sendToNewSession')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setPendingPlanSend({ action: 'improve', target: 'worktree' })}
                  disabled={!canCreateWorktree}
                >
                  {t('planView.actions.sendToNewWorktreeSession')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      aria-label={t('planView.actions.implementPlanAria')}
                      disabled={!content.trim() || isManagedChatPlan}
                    >
                      <Icon name="code-ai" className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent sideOffset={8}>{t('planView.actions.implement')}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setPendingPlanSend({ action: 'implement', target: 'session' })}
                  disabled={isManagedChatPlan}
                >
                  {t('planView.actions.sendToNewSession')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setPendingPlanSend({ action: 'implement', target: 'worktree' })}
                  disabled={!canCreateWorktree}
                >
                  {t('planView.actions.sendToNewWorktreeSession')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <PreviewToggleButton
              currentMode={mdViewMode}
              onToggle={() => saveMdViewMode(mdViewMode === 'preview' ? 'edit' : 'preview')}
            />
            {mdViewMode === 'preview' && showMessageTTSButtons && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    aria-label={isTTSPlaying ? t('planView.tts.stopSpeaking') : t('planView.tts.readAloud')}
                    onClick={() => {
                      if (isTTSPlaying) {
                        stopTTS();
                      } else if (content.trim()) {
                        void playTTS(content);
                      }
                    }}
                  >
                    <Icon name="volume-up" className={isTTSPlaying ? 'h-4 w-4 text-[var(--primary-text)]' : 'h-4 w-4'} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={8}>
                  {isTTSPlaying ? t('planView.tts.stopSpeaking') : t('planView.tts.readAloud')}
                </TooltipContent>
              </Tooltip>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const result = await copyTextToClipboard(content);
                if (result.ok) {
                  setCopiedContent(true);
                  if (copiedContentTimeoutRef.current !== null) {
                    window.clearTimeout(copiedContentTimeoutRef.current);
                  }
                  copiedContentTimeoutRef.current = window.setTimeout(() => {
                    setCopiedContent(false);
                  }, 1200);
                } else {
                  // ignored
                }
              }}
              className="h-5 w-5 p-0"
              title={t('planView.actions.copyPlanContents')}
              aria-label={t('planView.actions.copyPlanContents')}
            >
              {copiedContent ? (
                <Icon name="check" className="h-4 w-4 text-[color:var(--status-success)]" />
              ) : (
                <Icon name="clipboard" className="h-4 w-4" />
              )}
            </Button>
          </div>
        ) : null}
||||||| bc50ba56aa
          )}
          groups={hasDocument ? [
            [{
              id: 'mode',
              label: t('documentToolbar.preview'),
              icon: 'eye',
              pressed: mdViewMode === 'preview',
              onSelect: () => saveMdViewMode(mdViewMode === 'preview' ? 'edit' : 'preview'),
              pinned: true,
            }],
            [
              {
                id: 'improve',
                label: t('planView.actions.improve'),
                icon: 'loop-right-ai',
                disabled: !content.trim() || isManagedChatPlan,
                menu: sendMenu('improve'),
              },
              {
                id: 'implement',
                label: t('planView.actions.implement'),
                icon: 'code-ai',
                disabled: !content.trim() || isManagedChatPlan,
                menu: sendMenu('implement'),
              },
            ],
            [
              // Reads the plan's text, so it works in either mode.
              showMessageTTSButtons && {
                id: 'read-aloud',
                label: isTTSPlaying ? t('planView.tts.stopSpeaking') : t('planView.tts.readAloud'),
                icon: 'volume-up',
                iconClassName: isTTSPlaying ? 'text-[var(--primary-text)]' : undefined,
                onSelect: () => {
                  if (isTTSPlaying) {
                    stopTTS();
                  } else if (content.trim()) {
                    void playTTS(content);
                  }
                },
              },
              {
                id: 'copy-contents',
                label: t('planView.actions.copyPlanContents'),
                icon: 'file-copy',
                done: copiedContent,
                onSelect: () => void copyPlanContents(),
              },
            ],
          ] : []}
          fold
        />
=======
          )}
          status={hasDocument ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="xs" disabled={sendDisabled} className="typography-ui-label">
                  {t('planView.actions.implement')}
                  <Icon name="arrow-down-s" className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {sendMenu('implement')}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined}
          groups={hasDocument ? [
            [{
              id: 'mode',
              label: t('documentToolbar.preview'),
              icon: 'eye',
              pressed: viewMode === 'preview',
              onSelect: () => saveMdViewMode(viewMode === 'preview' ? 'edit' : 'preview'),
              pinned: true,
            }],
          ] : []}
          menuOnly={hasDocument ? [
            {
              id: 'improve',
              label: t('planView.actions.improve'),
              icon: 'loop-right-ai',
              disabled: sendDisabled,
              menu: sendMenu('improve'),
            },
            showMessageTTSButtons && {
              id: 'read-aloud',
              label: isTTSPlaying ? t('planView.tts.stopSpeaking') : t('planView.tts.readAloud'),
              icon: 'volume-up',
              iconClassName: isTTSPlaying ? 'text-[var(--primary-text)]' : undefined,
              onSelect: () => {
                if (isTTSPlaying) {
                  stopTTS();
                } else if (content.trim()) {
                  void playTTS(content);
                }
              },
            },
            {
              id: 'copy-contents',
              label: t('planView.actions.copyPlanContents'),
              icon: 'file-copy',
              onSelect: () => void copyPlanContents(),
            },
            ...entryActions,
          ] : []}
        />
>>>>>>> upstream/main
      </div>

      <TodoSendDialog
        open={pendingPlanSend !== null}
        onOpenChange={(open) => {
          if (!open && !isPlanSendSubmitting) {
            setPendingPlanSend(null);
          }
        }}
        target={pendingPlanSend?.target ?? 'session'}
        projectDirectory={savedPlanProjectRef?.path ?? currentProjectRef?.path ?? null}
        submitting={isPlanSendSubmitting}
        allowRunAsGoal={pendingPlanSend?.action === 'implement'}
        onConfirm={handleConfirmPlanSend}
      />

      <div className="flex-1 min-h-0 min-w-0 relative">
        <ScrollableOverlay outerClassName="h-full min-w-0" className="h-full min-w-0">
          {loading ? (
            <div className="p-3 text-muted-foreground">{t('planView.state.loading')}</div>
          ) : (
            <div className="relative h-full">
              <div className="h-full">
<<<<<<< HEAD
                {mdViewMode === 'preview' ? (
                  <div className="h-full overflow-auto p-3" ref={previewRef}>
                    {/* Same comment-on-selection as a markdown file preview. */}
||||||| bc50ba56aa
                {mdViewMode === 'preview' ? (
                  <>
                  <div className="overlay-scrollbar-target overlay-scrollbar-container h-full overflow-auto p-3" ref={setPreviewContainer}>
                    {/* Same comment-on-selection as a markdown file preview. */}
=======
                {viewMode === 'preview' ? (
                  <>
                  <div className="overlay-scrollbar-target overlay-scrollbar-container h-full overflow-auto p-3" ref={setPreviewContainer}>
>>>>>>> upstream/main
                    <FilePreviewCommentMenu
                      containerRef={previewRef}
                      filePath={commentFileLabel}
                      fileContent={content}
                    />
                    <ErrorBoundary
                      fallback={
                        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
                          <div className="mb-1 font-medium text-destructive">{t('planView.error.previewUnavailable')}</div>
                          <div className="text-sm text-muted-foreground">
                            {t('planView.error.switchToEditMode')}
                          </div>
                        </div>
                      }
                    >
<<<<<<< HEAD
                      <SimpleMarkdownRenderer content={content} className="typography-markdown-body" enableFileReferences={false} />
||||||| bc50ba56aa
                      <SimpleMarkdownRenderer content={content} documentAssets={markdownDocumentAssets} className="typography-markdown-body" frontmatter="properties" enableFileReferences={false} />
=======
                      <SimpleMarkdownRenderer content={previewContent} documentAssets={markdownDocumentAssets} className="typography-markdown-body" frontmatter="properties" enableFileReferences={false} />
>>>>>>> upstream/main
                    </ErrorBoundary>
                  </div>
                ) : (
                  <div className="relative h-full" ref={editorWrapperRef}>
                    <CodeMirrorEditor
                      value={content}
                      onChange={handleContentChange}
                      readOnly={heldForMove}
                      className="h-full"
                      extensions={editorExtensions}
                      onViewReady={(view) => { editorViewRef.current = view; }}
                      onViewDestroy={() => { editorViewRef.current = null; }}
                      blockWidgets={blockWidgets}
                      highlightLines={lineSelection
                        ? {
                          start: Math.min(lineSelection.start, lineSelection.end),
                          end: Math.max(lineSelection.start, lineSelection.end),
                        }
                        : undefined}
                      lineNumbersConfig={{
                        domEventHandlers: {
                          mousedown: (view, line, event) => {
                            if (!(event instanceof MouseEvent)) return false;
                            if (event.button !== 0) return false;
                            event.preventDefault();
                            const lineNumber = view.state.doc.lineAt(line.from).number;

                            if (
                              lineSelection &&
                              !event.shiftKey &&
                              Math.min(lineSelection.start, lineSelection.end) === lineNumber &&
                              Math.max(lineSelection.start, lineSelection.end) === lineNumber
                            ) {
                              setLineSelection(null);
                              cancel();
                              isSelectingRef.current = false;
                              selectionStartRef.current = null;
                              setIsDragging(false);
                              return true;
                            }

                            if (isMobile && lineSelection && !event.shiftKey) {
                              const start = Math.min(lineSelection.start, lineSelection.end, lineNumber);
                              const end = Math.max(lineSelection.start, lineSelection.end, lineNumber);
                              setLineSelection({ start, end });
                              isSelectingRef.current = false;
                              selectionStartRef.current = null;
                              setIsDragging(false);
                              return true;
                            }

                            isSelectingRef.current = true;
                            selectionStartRef.current = lineNumber;
                            setIsDragging(true);

                            if (lineSelection && event.shiftKey) {
                              const start = Math.min(lineSelection.start, lineNumber);
                              const end = Math.max(lineSelection.end, lineNumber);
                              setLineSelection({ start, end });
                            } else {
                              setLineSelection({ start: lineNumber, end: lineNumber });
                            }

                            return true;
                          },
                          mouseover: (view, line, event) => {
                            if (!(event instanceof MouseEvent)) return false;
                            if (event.buttons !== 1) return false;
                            if (!isSelectingRef.current || selectionStartRef.current === null) return false;
                            const lineNumber = view.state.doc.lineAt(line.from).number;
                            const start = Math.min(selectionStartRef.current, lineNumber);
                            const end = Math.max(selectionStartRef.current, lineNumber);
                            setLineSelection({ start, end });
                            setIsDragging(true);
                            return false;
                          },
                          mouseup: () => {
                            isSelectingRef.current = false;
                            selectionStartRef.current = null;
                            setIsDragging(false);
                            return false;
                          },
                        },
                    }}
                  />
                </div>
                )}
              </div>
            </div>
          )}
        </ScrollableOverlay>
      </div>
      {savedPlanProjectRef && savedPlanId && hasDocument ? <PlanTodos projectRef={savedPlanProjectRef} planId={savedPlanId} /> : null}
    </div>
  );
};
