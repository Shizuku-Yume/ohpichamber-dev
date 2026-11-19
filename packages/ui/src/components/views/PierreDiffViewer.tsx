import React, { useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  parseDiffFromFile,
  type FileDiff as PierreFileDiff,
  type FileDiffOptions,
  type Virtualizer,
} from '@pierre/diffs';
import { PierreDiffCommentOverlays } from '@/components/comments';

import { useOptionalThemeSystem } from '@/contexts/useThemeSystem';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useWorkerPoolState } from '@/contexts/DiffWorkerProvider';
import { ensurePierreThemeRegistered, getResolvedShikiTheme } from '@/lib/shiki/appThemeRegistry';
import { DIFFS_HIGHLIGHTER } from '@/lib/shiki/diffsHighlighter';
import { getDefaultTheme } from '@/lib/theme/themes';

import { useDeviceInfo } from '@/lib/device';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { hideWhitespaceChanges } from '@/lib/diff/hideWhitespaceChanges';
import { DiffStickyScrollbar } from './DiffStickyScrollbar';
import { useEditorCodeMetrics } from '@/lib/editorCodeMetrics';
import { HIDE_COLUMN_SCROLLBAR_CSS, HUNK_ACTION_OVERLAY_CSS, WEBKIT_SCROLL_FIX_CSS } from './pierreDiff/css';
import { useContextExpansion } from './pierreDiff/useContextExpansion';
import { useAnnotationRenderer, useLineAnnotations } from './pierreDiff/useDiffAnnotations';
import { useDiffComments } from './pierreDiff/useDiffComments';
import { useDiffInstance } from './pierreDiff/useDiffInstance';
import { useDiffScrollToLine } from './pierreDiff/useDiffScrollToLine';
import { useDiffSwapAfterHighlight } from './pierreDiff/useDiffSwapAfterHighlight';
import { useDiffThemeVars } from './pierreDiff/useDiffThemeVars';
import { useFindHighlights, useShadowRootPass } from './pierreDiff/useFindHighlights';
import { useHunkActionTargets } from './pierreDiff/useHunkActionTargets';
import { useLineSelectionGestures } from './pierreDiff/useLineSelectionGestures';
import { DEFAULT_DIFF_LINE_HEIGHT, type SharedVirtualizer } from './pierreDiff/sharedVirtualizer';
import type { DiffAnnotation, PierreDiffViewerHandle, PierreDiffViewerProps } from './pierreDiff/types';

export type {
  ContextExpansionRequest,
  DiffFindWordRequest,
  DiffHunkActions,
  PierreDiffViewerHandle,
} from './pierreDiff/types';


const LARGE_CONTENT_BYTES = 500_000;

export const PierreDiffViewer = React.forwardRef<PierreDiffViewerHandle, PierreDiffViewerProps>(
  function PierreDiffViewer({ hideWhitespace = false, ...props }, ref) {
    const { t } = useI18n();
    const { original, modified, fileDiff, fileName } = props;
    const sourceDiff = useMemo(() => {
      if (!hideWhitespace || fileDiff) return fileDiff;
      return parseDiffFromFile({ name: fileName ?? '', contents: original }, { name: fileName ?? '', contents: modified });
    }, [fileDiff, fileName, hideWhitespace, modified, original]);
    const visibleDiff = useMemo(
      () => (hideWhitespace && sourceDiff ? hideWhitespaceChanges(sourceDiff) : fileDiff),
      [fileDiff, hideWhitespace, sourceDiff],
    );

    if (hideWhitespace && sourceDiff && sourceDiff.hunks.length > 0 && visibleDiff?.hunks.length === 0) {
      return (
        <div className="px-3 py-2 typography-meta text-muted-foreground">
          {t('diffView.state.whitespaceOnly')}
        </div>
      );
    }

    return (
      <PierreDiffViewerBody
        {...props}
        handleRef={ref}
        fileDiff={visibleDiff}
        hunkActions={hideWhitespace ? undefined : props.hunkActions}
      />
    );
  },
);

const PierreDiffViewerBody: React.FC<
  Omit<PierreDiffViewerProps, 'hideWhitespace'> & { handleRef?: React.Ref<PierreDiffViewerHandle> }
> = ({
  original,
  modified,
  fileDiff: incomingFileDiff,
  language,
  fileName,
  commentOrigin,
  renderSideBySide,
  wrapLines,
  layout = 'fill',
  enableComments = true,
  hunkActions,
  onExpandContextRequest,
  pendingContextExpansion = null,
  contextLoading = false,
  onFindWordRequest,
  handleRef,
}) => {
  const themeContext = useOptionalThemeSystem();
  const { t } = useI18n();
  const showLinesBelowLabel = t('diffView.actions.showLinesBelow');
  const requestTrailingExpansionRef = useRef<() => void>(() => {});

  const isDark = themeContext?.currentTheme.metadata.variant === 'dark';
  const lightTheme = themeContext?.availableThemes.find(t => t.metadata.id === themeContext.lightThemeId) ?? getDefaultTheme(false);
  const darkTheme = themeContext?.availableThemes.find(t => t.metadata.id === themeContext.darkThemeId) ?? getDefaultTheme(true);

  const { isMobile } = useDeviceInfo();
  const editorCode = useEditorCodeMetrics();
  const diffLineHeight = editorCode?.lineHeight ?? DEFAULT_DIFF_LINE_HEIGHT;
  const {
    hunkAnchors,
    hoveredHunk,
    hunkTargets,
    handleHunkLineEnter,
    handleHunkLineLeave,
    captureHunkTargets,
  } = useHunkActionTargets(hunkActions);

  const diffRootRef = useRef<HTMLDivElement | null>(null);
  const diffContainerRef = useRef<HTMLDivElement | null>(null);
  const diffInstanceRef = useRef<PierreFileDiff<DiffAnnotation> | null>(null);
  const sharedVirtualizerRef = useRef<SharedVirtualizer | null>(null);
  const instanceVirtualizerRef = useRef<Virtualizer | null>(null);

  const {
    selection,
    setSelection,
    commentText,
    setCommentText,
    editingDraftId,
    startEdit,
    deleteDraft,
    fileDrafts,
    review,
    reviewItems,
    reviewField,
    excerptOf,
    selectionRef,
    editingDraftIdRef,
    commentTextRef,
    isApplyingSelectionRef,
    lastAppliedSelectionRef,
    handleSelectionChange,
    handleCancelComment,
    handleSaveComment,
    paintSelection,
    applySelection,
  } = useDiffComments({
    original,
    modified,
    incomingFileDiff,
    fileName,
    language,
    commentOrigin,
    enableComments,
    isMobile,
    diffInstanceRef,
  });

  const { commentHostsRef, typingFieldRef, holdTypingField, renderAnnotation } = useAnnotationRenderer({
    diffContainerRef,
    requestTrailingExpansionRef,
    showLinesBelowLabel,
  });

  const { handleGutterUtilityClick, handleLineClick } = useLineSelectionGestures({
    enableComments,
    onFindWordRequest,
    diffRootRef,
    diffContainerRef,
    diffInstanceRef,
    selectionRef,
    commentTextRef,
    editingDraftIdRef,
    isApplyingSelectionRef,
    setSelection,
    setCommentText,
    applySelection,
  });

  const lightThemeName = ensurePierreThemeRegistered(lightTheme);
  const darkThemeName = ensurePierreThemeRegistered(darkTheme);

  const diffThemeKey = `${lightThemeName}:${darkThemeName}:${isDark ? 'dark' : 'light'}`;

  const isLargeContent = useMemo(() => {
    if (incomingFileDiff) {
      const deletionLength = incomingFileDiff.deletionLines.reduce((total, line) => total + line.length, 0);
      const additionLength = incomingFileDiff.additionLines.reduce((total, line) => total + line.length, 0);
      return Math.max(deletionLength, additionLength) > LARGE_CONTENT_BYTES;
    }

    return Math.max(original.length, modified.length) > LARGE_CONTENT_BYTES;
  }, [incomingFileDiff, modified.length, original.length]);

  const { findMatchesRef, shadowObserverRef, scheduleShadowPassRef, applyFindHighlights, setFindHighlights } = useFindHighlights(diffContainerRef);

  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const { status: workerPoolStatus, pool: workerPool } = useWorkerPoolState(
    isLargeContent ? 'unified' : (renderSideBySide ? 'split' : 'unified'),
  );
  const fileDiff = useDiffSwapAfterHighlight(incomingFileDiff, workerPool);

  const scrollToLine = useDiffScrollToLine({
    fileDiff,
    diffInstanceRef,
    diffContainerRef,
    instanceVirtualizerRef,
    sharedVirtualizerRef,
  });

  React.useImperativeHandle(handleRef, () => ({ scrollToLine, setFindHighlights }), [scrollToLine, setFindHighlights]);
  const expandOnDemand = Boolean(onExpandContextRequest) && fileDiff?.isPartial === true;
  const expandLoading = expandOnDemand && (contextLoading || incomingFileDiff !== fileDiff);

  const lightResolvedTheme = useMemo(() => getResolvedShikiTheme(lightTheme), [lightTheme]);
  const darkResolvedTheme = useMemo(() => getResolvedShikiTheme(darkTheme), [darkTheme]);

  useDiffThemeVars(diffRootRef, isDark, lightResolvedTheme, darkResolvedTheme, diffThemeKey);

  const hasHunkAnchors = hunkAnchors.length > 0;
  const handlePostRender = useCallback<NonNullable<FileDiffOptions<DiffAnnotation, undefined>['onPostRender']>>((node, instance, phase) => {
    if (hasHunkAnchors) captureHunkTargets(node, instance, phase);
    if (phase !== 'unmount' && findMatchesRef.current.length > 0) applyFindHighlights();
    if (phase === 'unmount') return;
    const typing = typingFieldRef.current;
    typingFieldRef.current = null;
    if (typing?.isConnected && document.activeElement === document.body) typing.focus({ preventScroll: true });
  }, [applyFindHighlights, captureHunkTargets, findMatchesRef, hasHunkAnchors, typingFieldRef]);

  const options = useMemo<FileDiffOptions<DiffAnnotation, undefined>>(() => ({
    theme: {
      dark: darkThemeName,
      light: lightThemeName,
    },
    themeType: isDark ? 'dark' : 'light',
    preferredHighlighter: DIFFS_HIGHLIGHTER,
    diffStyle: renderSideBySide ? 'split' : 'unified',
    diffIndicators: 'none',
    hunkSeparators: 'line-info-basic',
    lineDiffType: 'none',
    maxLineDiffLength: isLargeContent ? 0 : 1000,
    maxLineLengthForHighlighting: isLargeContent ? 1 : 1000,
    tokenizeMaxLineLength: isLargeContent ? 1 : 1000,
    collapsedContextThreshold: 0,
    expansionLineCount: 20,
    overflow: wrapLines ? 'wrap' : 'scroll',
    disableFileHeader: true,
    enableLineSelection: enableComments,
    enableGutterUtility: enableComments,
    onGutterUtilityClick: enableComments ? handleGutterUtilityClick : undefined,
    onLineClick: enableComments || onFindWordRequest ? handleLineClick : undefined,
    onLineEnter: hunkAnchors.length > 0 ? handleHunkLineEnter : undefined,
    onLineLeave: hunkAnchors.length > 0 ? handleHunkLineLeave : undefined,
    onLineSelected: enableComments ? handleSelectionChange : undefined,
    unsafeCSS: [
      WEBKIT_SCROLL_FIX_CSS,
      hunkAnchors.length > 0 ? HUNK_ACTION_OVERLAY_CSS : '',
      layout === 'inline' ? HIDE_COLUMN_SCROLLBAR_CSS : '',
    ].join('\n'),
    renderAnnotation: enableComments || hunkAnchors.length > 0 || expandOnDemand ? renderAnnotation : undefined,
    onPostRender: handlePostRender,
  }), [handlePostRender, hunkAnchors.length, darkThemeName, enableComments, expandOnDemand, isDark, isLargeContent, layout, lightThemeName, renderSideBySide, wrapLines, handleSelectionChange, handleGutterUtilityClick, handleLineClick, handleHunkLineEnter, handleHunkLineLeave, onFindWordRequest, renderAnnotation]);

  const { lineAnnotations, lineAnnotationsRef } = useLineAnnotations({
    enableComments,
    fileDrafts,
    editingDraftId,
    reviewItems,
    hunkAnchors,
    expandOnDemand,
    fileDiff,
    selection,
    commentHostsRef,
  });

  useDiffInstance({
    diffRootRef,
    diffContainerRef,
    diffInstanceRef,
    sharedVirtualizerRef,
    instanceVirtualizerRef,
    workerPool,
    fileDiff,
    fileName,
    language,
    original,
    modified,
    options,
    diffThemeKey,
    diffLineHeight,
    holdTypingField,
    lineAnnotations,
    lineAnnotationsRef,
    selection,
    selectionRef,
    isApplyingSelectionRef,
    lastAppliedSelectionRef,
    paintSelection,
    forceUpdate,
  });

  useShadowRootPass({
    diffContainerRef,
    forceUpdate,
    applyFindHighlights,
    findMatchesRef,
    shadowObserverRef,
    scheduleShadowPassRef,
    diffThemeKey,
    fileName,
  });

<<<<<<< HEAD
  useEffect(() => {
    lineAnnotationsRef.current = lineAnnotations;
    const current = new Set(lineAnnotations.flatMap(({ metadata }) => (
      metadata.type === 'hunk-action' || metadata.type === 'trailing-expand' ? [] : [toPierreAnnotationId(metadata)]
    )));
    for (const id of commentHostsRef.current.keys()) {
      if (!current.has(id)) commentHostsRef.current.delete(id);
    }
  }, [lineAnnotations]);

  useEffect(() => {
    const container = diffContainerRef.current;
    return () => {
      diffInstanceRef.current?.cleanUp();
      diffInstanceRef.current = null;
      sharedVirtualizerRef.current?.release();
      sharedVirtualizerRef.current = null;
      instanceVirtualizerRef.current = null;
      instanceWorkerPoolRef.current = null;
      instanceVirtualHunkSeparatorsRef.current = undefined;
      instanceFileDiffRef.current = undefined;
      instanceOldFileRef.current = undefined;
      instanceNewFileRef.current = undefined;
      if (container) {
        container.innerHTML = '';
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const container = diffContainerRef.current;
    const wrapper = diffRootRef.current;
    if (!container) return;
    if (workerPoolStatus === 'pending') return;

    const preserveDone = preserveScrollPosition(wrapper, container);
    let sharedVirtualizer = sharedVirtualizerRef.current;
    if (!sharedVirtualizer) {
      sharedVirtualizer = acquireSharedVirtualizer(container);
      sharedVirtualizerRef.current = sharedVirtualizer;
    }
    sharedVirtualizerRef.current = sharedVirtualizer;
    const virtualizer = sharedVirtualizer?.virtualizer ?? null;

    const oldFile: FileContents | undefined = fileDiff ? undefined : {
      name: fileName || '',
      contents: original,
      lang: language as FileContents['lang'],
      cacheKey: `old:${diffThemeKey}:${fileName}:${makeContentCacheKey(original)}`,
    };
    const newFile: FileContents | undefined = fileDiff ? undefined : {
      name: fileName || '',
      contents: modified,
      lang: language as FileContents['lang'],
      cacheKey: `new:${diffThemeKey}:${fileName}:${makeContentCacheKey(modified)}`,
    };

    const targetChanged = fileDiff
      ? instanceFileDiffRef.current !== fileDiff
      : instanceFileDiffRef.current !== undefined
        || !oldFile
        || !newFile
        || !instanceOldFileRef.current
        || !instanceNewFileRef.current
        || !areFilesEqual(instanceOldFileRef.current, oldFile)
        || !areFilesEqual(instanceNewFileRef.current, newFile);

    const currentInstance = diffInstanceRef.current;
    const shouldReset = Boolean(
      currentInstance
      && (
        instanceVirtualizerRef.current !== virtualizer
        || instanceWorkerPoolRef.current !== workerPool
        || (virtualizer && (instanceVirtualHunkSeparatorsRef.current !== options.hunkSeparators || targetChanged))
      )
    );

    if (shouldReset) {
      currentInstance?.cleanUp();
      diffInstanceRef.current = null;
      container.innerHTML = '';
    }

    let instance = diffInstanceRef.current;
    const forceRender = !shouldReset && currentInstance
      ? !areOptionsEqual(currentInstance.options, options)
      : false;
    if (!instance) {
      instance = sharedVirtualizer
        ? new VirtualizedFileDiff<DiffAnnotation>(
            options,
            sharedVirtualizer.virtualizer,
            VIRTUAL_METRICS,
            workerPool,
          )
        : new PierreFileDiff(options, workerPool);
      diffInstanceRef.current = instance;
      lastAppliedSelectionRef.current = null;
    } else {
      instance.setOptions(options);
    }

    instanceVirtualizerRef.current = virtualizer;
    instanceWorkerPoolRef.current = workerPool;
    instanceVirtualHunkSeparatorsRef.current = virtualizer ? options.hunkSeparators : undefined;
    instanceFileDiffRef.current = fileDiff;
    instanceOldFileRef.current = oldFile;
    instanceNewFileRef.current = newFile;

    if (fileDiff) {
      instance.render({
        fileDiff,
        forceRender,
        lineAnnotations: lineAnnotationsRef.current,
        containerWrapper: container,
      });
    } else {
      if (!oldFile || !newFile) return;

      instance.render({
        oldFile,
        newFile,
        forceRender,
        lineAnnotations: lineAnnotationsRef.current,
        containerWrapper: container,
      });
    }

    const cancelReady = waitForDiffReady(container, () => {
      preserveDone();
      wakeVirtualizer(instance, sharedVirtualizer, forceUpdate);
    });

    return () => {
      cancelReady();
      preserveDone();
    };
  }, [diffThemeKey, fileDiff, fileName, language, modified, options, original, workerPool, workerPoolStatus]);

  useEffect(() => {
    const instance = diffInstanceRef.current;
    if (!instance) return;

    try {
      instance.setLineAnnotations(lineAnnotations);
    } catch (error) {
      console.error('Failed to apply diff line annotations', error);
      try {
        instance.setLineAnnotations([]);
      } catch {
        // ignored
      }
    }

    requestAnimationFrame(() => {
      if (diffInstanceRef.current !== instance) return;
      // A rebuilt annotation moves its node, and moving a focused field drops
      // its focus. The virtualized diff renders later, so the post-render
      // callback gives it back, and only to a field that had it.
      const focused = document.activeElement;
      typingFieldRef.current = focused instanceof HTMLTextAreaElement && diffContainerRef.current?.contains(focused) ? focused : null;
      try {
        instance.rerender();
      } catch (err) {
        void err;
      }
      forceUpdate();
    });
  }, [lineAnnotations]);

  useEffect(() => {
    const instance = diffInstanceRef.current;
    if (!instance) return;

    // Only push selection to the diff when clearing.
    // User-driven selections already originate from the diff itself.
    if (selection !== null) {
      return;
    }

    // Guard against feedback loops and redundant updates
    const lastApplied = lastAppliedSelectionRef.current;
    if (isSameSelection(selection, lastApplied)) {
      return;
    }

    try {
      isApplyingSelectionRef.current = true;
      instance.setSelectedLines(selection);
      lastAppliedSelectionRef.current = selection;
    } catch {
      // ignore
    } finally {
      isApplyingSelectionRef.current = false;
    }
  }, [selection]);

  useEffect(() => {
    if (!enableComments) return;
    const container = diffContainerRef.current;
    if (!container) return;

    const handleNumberPointerDown = (event: PointerEvent) => {
      if (event.shiftKey || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const current = selectionRef.current;
      if (!current || current.start !== current.end || !current.side
          || (current.endSide && current.endSide !== current.side)
          || commentTextRef.current.trim()) return;

      // The capture listener sees the original number cell across the shadow
      // boundary, before Pierre handles pointerdown on its pre element.
      const numberCell = event.composedPath().find((node): node is HTMLElement =>
        node instanceof HTMLElement && node.hasAttribute('data-column-number'));
      if (!numberCell || Number(numberCell.dataset.columnNumber) !== current.start) return;
      const side: AnnotationSide = numberCell.dataset.lineType === 'change-deletion'
        || numberCell.closest('[data-code][data-deletions]') != null
        ? 'deletions'
        : 'additions';
      if (side === current.side) return;

      // Pierre toggles a single line by number alone. Clear that selection so
      // this gesture can select the same number on the other side normally.
      try {
        isApplyingSelectionRef.current = true;
        diffInstanceRef.current?.setSelectedLines(null);
      } finally {
        isApplyingSelectionRef.current = false;
      }
    };

    container.addEventListener('pointerdown', handleNumberPointerDown, true);
    return () => container.removeEventListener('pointerdown', handleNumberPointerDown, true);
  }, [enableComments]);

  // MutationObserver to trigger re-renders when annotation DOM nodes are added/removed
  useEffect(() => {
    const container = diffContainerRef.current;
    if (!container) return;

    let observer: MutationObserver | null = null;
    let rafId: number | null = null;

    const setupObserver = () => {
      const diffsContainer = container.querySelector('diffs-container');
      if (!(diffsContainer instanceof HTMLElement)) return;

      const shadowRoot = diffsContainer.shadowRoot;

      // A rebuild of the rows drops their find marks, so the pass paints them
      // again. The surgery takes its own records (applyFindHighlights), so this
      // never fires for it.
      const schedulePass = () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          rafId = null;
          forceUpdate();
          if (findMatchesRef.current.length > 0) applyFindHighlights();
        });
      };
      observer = new MutationObserver(schedulePass);
      shadowObserverRef.current = observer;
      scheduleShadowPassRef.current = schedulePass;

      observer.observe(diffsContainer, { childList: true, subtree: true });
      if (shadowRoot) {
        observer.observe(shadowRoot, { childList: true, subtree: true });
      }
    };

    const timeoutId = setTimeout(setupObserver, 100);

    return () => {
      clearTimeout(timeoutId);
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
      if (shadowObserverRef.current === observer) {
        shadowObserverRef.current = null;
        scheduleShadowPassRef.current = null;
      }
    };
  }, [applyFindHighlights, diffThemeKey, fileName]);

  useEffect(() => {
    requestTrailingExpansionRef.current = () => {
      if (expandLoading) return;
      onExpandContextRequest?.({ gap: 'after-last-hunk' });
    };
  }, [expandLoading, onExpandContextRequest]);

  useEffect(() => {
    const container = diffContainerRef.current;
    if (!container) return;
    return waitForDiffReady(container, () => {
      const host = container.querySelector('diffs-container');
      if (!(host instanceof HTMLElement)) return;
      host.toggleAttribute('data-oc-expand-on-demand', expandOnDemand);
      host.toggleAttribute('data-oc-expand-loading', expandLoading);
    });
  }, [expandLoading, expandOnDemand, fileDiff]);

  useEffect(() => {
    const container = diffContainerRef.current;
    if (!container || !expandOnDemand || expandLoading || !fileDiff || !onExpandContextRequest) return;

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const request = resolveContextExpansionRequest(event.composedPath(), fileDiff);
      if (!request) return;
      event.preventDefault();
      event.stopPropagation();
      onExpandContextRequest(request);
    };

    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, [expandLoading, expandOnDemand, fileDiff, onExpandContextRequest]);

  // Replay the expansion the user asked for on the partial diff once the full
  // diff is rendered. Hunks may merge differently after the reload, so the
  // gap is located through the hunk that now contains the requested line.
  const appliedContextExpansionRef = useRef<ContextExpansionRequest | null>(null);
  useEffect(() => {
    if (!pendingContextExpansion || !fileDiff || fileDiff.isPartial) return;
    if (appliedContextExpansionRef.current === pendingContextExpansion) return;
    const container = diffContainerRef.current;
    if (!container) return;

    return waitForDiffReady(container, () => {
      const instance = diffInstanceRef.current;
      if (!instance || instance.fileDiff !== fileDiff) return;
      if (appliedContextExpansionRef.current === pendingContextExpansion) return;
      appliedContextExpansionRef.current = pendingContextExpansion;
      if (pendingContextExpansion.gap === 'after-last-hunk') {
        // Pierre keys the region after the last hunk by the hunk count and
        // grows it from its start, which is the 'up' direction.
        instance.expandHunk(fileDiff.hunks.length, 'up');
        return;
      }
      const hunkIndex = fileDiff.hunks.findIndex((hunk) =>
        hunk.additionStart <= pendingContextExpansion.additionStart
        && pendingContextExpansion.additionStart < hunk.additionStart + Math.max(hunk.additionCount, 1));
      if (hunkIndex < 0) return;
      instance.expandHunk(hunkIndex, pendingContextExpansion.direction);
    });
  }, [fileDiff, pendingContextExpansion]);
||||||| bc50ba56aa
  useEffect(() => {
    lineAnnotationsRef.current = lineAnnotations;
    const current = new Set(lineAnnotations.flatMap(({ metadata }) => (
      metadata.type === 'hunk-action' || metadata.type === 'trailing-expand' ? [] : [toPierreAnnotationId(metadata)]
    )));
    for (const id of commentHostsRef.current.keys()) {
      if (!current.has(id)) commentHostsRef.current.delete(id);
    }
  }, [lineAnnotations]);

  useEffect(() => {
    const container = diffContainerRef.current;
    return () => {
      diffInstanceRef.current?.cleanUp();
      diffInstanceRef.current = null;
      sharedVirtualizerRef.current?.release();
      sharedVirtualizerRef.current = null;
      instanceVirtualizerRef.current = null;
      instanceWorkerPoolRef.current = null;
      instanceVirtualHunkSeparatorsRef.current = undefined;
      instanceFileDiffRef.current = undefined;
      instanceOldFileRef.current = undefined;
      instanceNewFileRef.current = undefined;
      if (container) {
        container.innerHTML = '';
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const container = diffContainerRef.current;
    const wrapper = diffRootRef.current;
    if (!container) return;
    if (!workerPool) return;

    const preserveDone = preserveScrollPosition(wrapper, container);
    let sharedVirtualizer = sharedVirtualizerRef.current;
    if (!sharedVirtualizer) {
      sharedVirtualizer = acquireSharedVirtualizer(container);
      sharedVirtualizerRef.current = sharedVirtualizer;
    }
    sharedVirtualizerRef.current = sharedVirtualizer;
    const virtualizer = sharedVirtualizer?.virtualizer ?? null;

    const oldFile: FileContents | undefined = fileDiff ? undefined : {
      name: fileName || '',
      contents: original,
      lang: language as FileContents['lang'],
      cacheKey: `old:${diffThemeKey}:${fileName}:${makeContentCacheKey(original)}`,
    };
    const newFile: FileContents | undefined = fileDiff ? undefined : {
      name: fileName || '',
      contents: modified,
      lang: language as FileContents['lang'],
      cacheKey: `new:${diffThemeKey}:${fileName}:${makeContentCacheKey(modified)}`,
    };

    const targetChanged = fileDiff
      ? instanceFileDiffRef.current !== fileDiff
      : instanceFileDiffRef.current !== undefined
        || !oldFile
        || !newFile
        || !instanceOldFileRef.current
        || !instanceNewFileRef.current
        || !areFilesEqual(instanceOldFileRef.current, oldFile)
        || !areFilesEqual(instanceNewFileRef.current, newFile);

    const currentInstance = diffInstanceRef.current;
    const shouldReset = Boolean(
      currentInstance
      && (
        instanceVirtualizerRef.current !== virtualizer
        || instanceWorkerPoolRef.current !== workerPool
        || (virtualizer && (instanceVirtualHunkSeparatorsRef.current !== options.hunkSeparators || targetChanged))
      )
    );

    if (shouldReset) {
      currentInstance?.cleanUp();
      diffInstanceRef.current = null;
      container.innerHTML = '';
    }

    let instance = diffInstanceRef.current;
    const forceRender = !shouldReset && currentInstance
      ? !areOptionsEqual(currentInstance.options, options)
      : false;
    if (!instance) {
      instance = sharedVirtualizer
        ? new VirtualizedFileDiff<DiffAnnotation>(
            options,
            sharedVirtualizer.virtualizer,
            VIRTUAL_METRICS,
            workerPool,
          )
        : new PierreFileDiff(options, workerPool);
      diffInstanceRef.current = instance;
      lastAppliedSelectionRef.current = null;
    } else {
      instance.setOptions(options);
    }

    instanceVirtualizerRef.current = virtualizer;
    instanceWorkerPoolRef.current = workerPool;
    instanceVirtualHunkSeparatorsRef.current = virtualizer ? options.hunkSeparators : undefined;
    instanceFileDiffRef.current = fileDiff;
    instanceOldFileRef.current = oldFile;
    instanceNewFileRef.current = newFile;

    if (fileDiff) {
      instance.render({
        fileDiff,
        forceRender,
        lineAnnotations: lineAnnotationsRef.current,
        containerWrapper: container,
      });
    } else {
      if (!oldFile || !newFile) return;

      instance.render({
        oldFile,
        newFile,
        forceRender,
        lineAnnotations: lineAnnotationsRef.current,
        containerWrapper: container,
      });
    }

    const cancelReady = waitForDiffReady(container, () => {
      preserveDone();
      wakeVirtualizer(instance, sharedVirtualizer, forceUpdate);
    });

    return () => {
      cancelReady();
      preserveDone();
    };
  }, [diffThemeKey, fileDiff, fileName, language, modified, options, original, workerPool]);

  useEffect(() => {
    const instance = diffInstanceRef.current;
    if (!instance) return;

    try {
      instance.setLineAnnotations(lineAnnotations);
    } catch (error) {
      console.error('Failed to apply diff line annotations', error);
      try {
        instance.setLineAnnotations([]);
      } catch {
        // ignored
      }
    }

    requestAnimationFrame(() => {
      if (diffInstanceRef.current !== instance) return;
      // A rebuilt annotation moves its node, and moving a focused field drops
      // its focus. The virtualized diff renders later, so the post-render
      // callback gives it back, and only to a field that had it.
      const focused = document.activeElement;
      typingFieldRef.current = focused instanceof HTMLTextAreaElement && diffContainerRef.current?.contains(focused) ? focused : null;
      try {
        instance.rerender();
      } catch (err) {
        void err;
      }
      forceUpdate();
    });
  }, [lineAnnotations]);

  useEffect(() => {
    const instance = diffInstanceRef.current;
    if (!instance) return;

    // Only push selection to the diff when clearing.
    // User-driven selections already originate from the diff itself.
    if (selection !== null) {
      return;
    }

    // Guard against feedback loops and redundant updates
    const lastApplied = lastAppliedSelectionRef.current;
    if (isSameSelection(selection, lastApplied)) {
      return;
    }

    try {
      isApplyingSelectionRef.current = true;
      instance.setSelectedLines(selection);
      lastAppliedSelectionRef.current = selection;
    } catch {
      // ignore
    } finally {
      isApplyingSelectionRef.current = false;
    }
  }, [selection]);

  useEffect(() => {
    if (!enableComments) return;
    const container = diffContainerRef.current;
    if (!container) return;

    const handleNumberPointerDown = (event: PointerEvent) => {
      if (event.shiftKey || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const current = selectionRef.current;
      if (!current || current.start !== current.end || !current.side
          || (current.endSide && current.endSide !== current.side)
          || commentTextRef.current.trim()) return;

      // The capture listener sees the original number cell across the shadow
      // boundary, before Pierre handles pointerdown on its pre element.
      const numberCell = event.composedPath().find((node): node is HTMLElement =>
        node instanceof HTMLElement && node.hasAttribute('data-column-number'));
      if (!numberCell || Number(numberCell.dataset.columnNumber) !== current.start) return;
      const side: AnnotationSide = numberCell.dataset.lineType === 'change-deletion'
        || numberCell.closest('[data-code][data-deletions]') != null
        ? 'deletions'
        : 'additions';
      if (side === current.side) return;

      // Pierre toggles a single line by number alone. Clear that selection so
      // this gesture can select the same number on the other side normally.
      try {
        isApplyingSelectionRef.current = true;
        diffInstanceRef.current?.setSelectedLines(null);
      } finally {
        isApplyingSelectionRef.current = false;
      }
    };

    container.addEventListener('pointerdown', handleNumberPointerDown, true);
    return () => container.removeEventListener('pointerdown', handleNumberPointerDown, true);
  }, [enableComments]);

  // MutationObserver to trigger re-renders when annotation DOM nodes are added/removed
  useEffect(() => {
    const container = diffContainerRef.current;
    if (!container) return;

    let observer: MutationObserver | null = null;
    let rafId: number | null = null;

    const setupObserver = () => {
      const diffsContainer = container.querySelector('diffs-container');
      if (!(diffsContainer instanceof HTMLElement)) return;

      const shadowRoot = diffsContainer.shadowRoot;

      // A rebuild of the rows drops their find marks, so the pass paints them
      // again. The surgery takes its own records (applyFindHighlights), so this
      // never fires for it.
      const schedulePass = () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          rafId = null;
          forceUpdate();
          if (findMatchesRef.current.length > 0) applyFindHighlights();
        });
      };
      observer = new MutationObserver(schedulePass);
      shadowObserverRef.current = observer;
      scheduleShadowPassRef.current = schedulePass;

      observer.observe(diffsContainer, { childList: true, subtree: true });
      if (shadowRoot) {
        observer.observe(shadowRoot, { childList: true, subtree: true });
      }
    };

    const timeoutId = setTimeout(setupObserver, 100);

    return () => {
      clearTimeout(timeoutId);
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
      if (shadowObserverRef.current === observer) {
        shadowObserverRef.current = null;
        scheduleShadowPassRef.current = null;
      }
    };
  }, [applyFindHighlights, diffThemeKey, fileName]);

  useEffect(() => {
    requestTrailingExpansionRef.current = () => {
      if (expandLoading) return;
      onExpandContextRequest?.({ gap: 'after-last-hunk' });
    };
  }, [expandLoading, onExpandContextRequest]);

  useEffect(() => {
    const container = diffContainerRef.current;
    if (!container) return;
    return waitForDiffReady(container, () => {
      const host = container.querySelector('diffs-container');
      if (!(host instanceof HTMLElement)) return;
      host.toggleAttribute('data-oc-expand-on-demand', expandOnDemand);
      host.toggleAttribute('data-oc-expand-loading', expandLoading);
    });
  }, [expandLoading, expandOnDemand, fileDiff]);

  useEffect(() => {
    const container = diffContainerRef.current;
    if (!container || !expandOnDemand || expandLoading || !fileDiff || !onExpandContextRequest) return;

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const request = resolveContextExpansionRequest(event.composedPath(), fileDiff);
      if (!request) return;
      event.preventDefault();
      event.stopPropagation();
      onExpandContextRequest(request);
    };

    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, [expandLoading, expandOnDemand, fileDiff, onExpandContextRequest]);

  // Replay the expansion the user asked for on the partial diff once the full
  // diff is rendered. Hunks may merge differently after the reload, so the
  // gap is located through the hunk that now contains the requested line.
  const appliedContextExpansionRef = useRef<ContextExpansionRequest | null>(null);
  useEffect(() => {
    if (!pendingContextExpansion || !fileDiff || fileDiff.isPartial) return;
    if (appliedContextExpansionRef.current === pendingContextExpansion) return;
    const container = diffContainerRef.current;
    if (!container) return;

    return waitForDiffReady(container, () => {
      const instance = diffInstanceRef.current;
      if (!instance || instance.fileDiff !== fileDiff) return;
      if (appliedContextExpansionRef.current === pendingContextExpansion) return;
      appliedContextExpansionRef.current = pendingContextExpansion;
      if (pendingContextExpansion.gap === 'after-last-hunk') {
        // Pierre keys the region after the last hunk by the hunk count and
        // grows it from its start, which is the 'up' direction.
        instance.expandHunk(fileDiff.hunks.length, 'up');
        return;
      }
      const hunkIndex = fileDiff.hunks.findIndex((hunk) =>
        hunk.additionStart <= pendingContextExpansion.additionStart
        && pendingContextExpansion.additionStart < hunk.additionStart + Math.max(hunk.additionCount, 1));
      if (hunkIndex < 0) return;
      instance.expandHunk(hunkIndex, pendingContextExpansion.direction);
    });
  }, [fileDiff, pendingContextExpansion]);
=======
  useContextExpansion({
    diffContainerRef,
    diffInstanceRef,
    requestTrailingExpansionRef,
    fileDiff,
    expandOnDemand,
    expandLoading,
    onExpandContextRequest,
    pendingContextExpansion,
  });
>>>>>>> upstream/main

  if (typeof window === 'undefined') {
    return null;
  }

  const commentOverlays = enableComments ? (
    <PierreDiffCommentOverlays
      diffRootRef={diffRootRef}
      drafts={fileDrafts}
      selection={selection}
      editingDraftId={editingDraftId}
      commentText={commentText}
      onTextChange={setCommentText}
      fileLabel={fileName ?? ''}
      onSave={handleSaveComment}
      onCancel={handleCancelComment}
      review={review}
      reviewItems={reviewItems}
      reviewField={reviewField}
      excerptOf={excerptOf}
      onEdit={(draft) => {
        applySelection({
          start: draft.startLine,
          end: draft.endLine,
          side: draft.side === 'original' ? 'deletions' : 'additions',
        });
        startEdit(draft);
      }}
      onDelete={deleteDraft}
    />
  ) : null;

  const hunkActionPortals = hunkActions && fileDiff && hunkTargets.fileDiff === fileDiff && hunkTargets.anchors === hunkAnchors
    ? [...hunkTargets.targets].map(([index, target]) => createPortal(hunkActions.render(index, hoveredHunk === index), target, `hunk-${index}`))
    : null;

  if (layout === 'fill') {
    return (
      <div className={cn("flex flex-col relative", "size-full")} style={editorCode?.style} data-diff-virtual-root>
        <div className="flex-1 relative min-h-0">
          <ScrollableOverlay
            outerClassName="pierre-diff-wrapper size-full"
            disableHorizontal={false}
            fillContainer={true}
            data-diff-virtual-content
          >
            <div ref={diffRootRef} className="size-full relative">
              <div ref={diffContainerRef} className="size-full" />
            </div>
          </ScrollableOverlay>
          {commentOverlays}
          {hunkActionPortals}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative", "w-full")}>
      <div ref={diffRootRef} className="pierre-diff-wrapper w-full overflow-x-auto overflow-y-visible relative" style={editorCode?.style}>
      <div ref={diffContainerRef} className="w-full" />
    </div>
    <DiffStickyScrollbar containerRef={diffContainerRef} />
    {commentOverlays}
    {hunkActionPortals}
  </div>
  );
};
