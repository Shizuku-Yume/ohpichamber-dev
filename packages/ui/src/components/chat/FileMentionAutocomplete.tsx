import React from 'react';
import { cn, truncatePathMiddle } from '@/lib/utils';
import { useFileSearchStore } from '@/stores/useFileSearchStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useFilesViewTabsStore } from '@/stores/useFilesViewTabsStore';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useChatSearchDirectory } from '@/hooks/useChatSearchDirectory';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import type { ProjectFileSearchHit } from '@/lib/host-filesystem';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Icon } from "@/components/icon/Icon";
import { useDirectoryShowHidden } from '@/lib/directoryShowHidden';
import { useFilesViewShowGitignored } from '@/lib/filesViewShowGitignored';
import { useI18n } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';
import { useMobileAutocompleteMaxHeight } from './useMobileAutocompleteMaxHeight';
import { isFileMissingError } from '@/lib/api/files-errors';
import {
  filterStaleRecentFiles,
  mentionServerQuery,
  rankFileMentionResults,
  type FileMentionHit,
} from './fileMentionResults';
import { matchesRankQuery } from '@/lib/search/fuzzySearch';

type FileInfo = ProjectFileSearchHit;
const OMP_INTERNAL_SCHEMES: readonly FileMentionHit[] = [
  { name: 'skill://', path: 'skill://', relativePath: 'skill://', kind: 'file' },
  { name: 'local://', path: 'local://', relativePath: 'local://', kind: 'file' },
  { name: 'proc://', path: 'proc://', relativePath: 'proc://', kind: 'file' },
  { name: 'agent://', path: 'agent://', relativePath: 'agent://', kind: 'file' },
  { name: 'history://', path: 'history://', relativePath: 'history://', kind: 'file' },
] as const;

export interface FileMentionHandle {
  handleKeyDown: (key: string) => void;
}

interface FileMentionAutocompleteProps {
  searchQuery: string;
  onFileSelect: (file: { name: string; path: string; relativePath?: string }) => void;
  onClose: () => void;
  style?: React.CSSProperties;
}

export const FileMentionAutocomplete = React.forwardRef<FileMentionHandle, FileMentionAutocompleteProps>(({
  searchQuery,
  onFileSelect,
  onClose,
  style,
}, ref) => {
  const { t } = useI18n();
  const currentDirectory = useChatSearchDirectory() ?? '';
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const activeProjectPath = useProjectsStore(
    React.useCallback(
      (state) => state.projects.find((project) => project.id === activeProjectId)?.path ?? null,
      [activeProjectId],
    ),
  );
  const projectRoot = React.useMemo(() => {
    const candidate = activeProjectPath || currentDirectory;
    return candidate ? candidate.replace(/\\/g, '/').replace(/\/+$/, '') : null;
  }, [activeProjectPath, currentDirectory]);
  const projectTabs = useFilesViewTabsStore(
    React.useCallback(
      (state) => (projectRoot ? state.byRoot[projectRoot] : undefined),
      [projectRoot],
    ),
  );
  const { files: filesApi } = useRuntimeAPIs();
  const removeUnselectedOpenPath = useFilesViewTabsStore((state) => state.removeUnselectedOpenPath);
  const [staleRecentPaths, setStaleRecentPaths] = React.useState<ReadonlySet<string>>(() => new Set());
  const verifiedPathsRef = React.useRef<Set<string>>(new Set());
  const searchFiles = useFileSearchStore((state) => state.searchFiles);
  const debouncedQuery = useDebouncedValue(searchQuery, 180);
  const showHidden = useDirectoryShowHidden();
  const showGitignored = useFilesViewShowGitignored();
  const [files, setFiles] = React.useState<FileInfo[]>([]);
  const [directories, setDirectories] = React.useState<FileInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const pendingSearchRef = React.useRef(0);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const selectedIndexRef = React.useRef(0);
  const [marqueeWidth, setMarqueeWidth] = React.useState(360);
  const [selectedOverflow, setSelectedOverflow] = React.useState<{ index: number; duration: number } | null>(null);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const labelRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const measureRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const isMobile = useUIStore((state) => state.isMobile);
  const mobileMaxHeight = useMobileAutocompleteMaxHeight(containerRef, true);
  const normalizedSearchQuery = (searchQuery ?? '').trim();

  React.useEffect(() => {
    setStaleRecentPaths(new Set());
    verifiedPathsRef.current.clear();
  }, [projectRoot]);

  React.useEffect(() => {
    if (currentDirectory) {
      useFileSearchStore.getState().invalidateDirectory(currentDirectory);
    }
  }, [currentDirectory]);

  const recentFiles = React.useMemo(() => {
    if (!projectRoot || !projectTabs) {
      return [] as FileInfo[];
    }

    const ordered = [
      projectTabs.selectedPath,
      ...projectTabs.openPaths.slice().reverse(),
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);

    const seen = new Set<string>();
    const mapped = ordered
      .filter((filePath) => {
        if (seen.has(filePath)) return false;
        seen.add(filePath);
        const relative = filePath.startsWith(`${projectRoot}/`) ? filePath.slice(projectRoot.length + 1) : filePath;
        return matchesRankQuery([relative], normalizedSearchQuery);
      })
      .slice(0, 6)
      .map((filePath) => {
        const normalizedPath = filePath.replace(/\\/g, '/');
        const name = normalizedPath.split('/').filter(Boolean).pop() || normalizedPath;
        const relativePath = normalizedPath.startsWith(`${projectRoot}/`)
          ? normalizedPath.slice(projectRoot.length + 1)
          : normalizedPath;
        return {
          name,
          path: normalizedPath,
          relativePath,
          extension: name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined,
        } satisfies FileInfo;
      });

    return mapped;
  }, [normalizedSearchQuery, projectRoot, projectTabs]);

  const recentCandidatePathsKey = React.useMemo(
    () => recentFiles.map((file) => file.path).join('\n'),
    [recentFiles],
  );

  React.useEffect(() => {
    if (!projectRoot || !filesApi?.statFile || recentCandidatePathsKey.length === 0) {
      return;
    }

    const candidatePaths = recentCandidatePathsKey.split('\n').filter(Boolean);
    const unverifiedCandidates = candidatePaths.filter((path) => !verifiedPathsRef.current.has(path));
    if (unverifiedCandidates.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.all(
      unverifiedCandidates.map(async (filePath) => {
        try {
          const stat = await filesApi.statFile?.(filePath, { directory: projectRoot });
          if (cancelled) return;
          verifiedPathsRef.current.add(filePath);
          if (stat && !stat.isFile) {
            setStaleRecentPaths((prev) => {
              if (prev.has(filePath)) return prev;
              const next = new Set(prev);
              next.add(filePath);
              return next;
            });
            removeUnselectedOpenPath(projectRoot, filePath);
          }
        } catch (error) {
          if (cancelled) return;
          verifiedPathsRef.current.add(filePath);
          if (isFileMissingError(error)) {
            setStaleRecentPaths((prev) => {
              if (prev.has(filePath)) return prev;
              const next = new Set(prev);
              next.add(filePath);
              return next;
            });
            removeUnselectedOpenPath(projectRoot, filePath);
          }
        }
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [filesApi, projectRoot, recentCandidatePathsKey, removeUnselectedOpenPath]);

  const visibleRecentFiles = React.useMemo(
    () => filterStaleRecentFiles(recentFiles, staleRecentPaths),
    [recentFiles, staleRecentPaths],
  );
  const visibleSchemes = React.useMemo(() => {
    const q = normalizedSearchQuery.toLowerCase();
    if (!q) return OMP_INTERNAL_SCHEMES;
    return OMP_INTERNAL_SCHEMES.filter(s => s.name.toLowerCase().includes(q));
  }, [normalizedSearchQuery]);
  const visibleResults = React.useMemo(() => {
    const ranked = rankFileMentionResults(files, directories, normalizedSearchQuery, 20);
    if (visibleSchemes.length === 0) return ranked;
    return [...visibleSchemes, ...ranked];
  }, [files, directories, normalizedSearchQuery, visibleSchemes]);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || !containerRef.current) {
        return;
      }
      if (containerRef.current.contains(target)) {
        return;
      }
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [onClose]);

  React.useEffect(() => {
    if (!currentDirectory) {
      setFiles([]);
      return;
    }

    const serverQuery = mentionServerQuery(debouncedQuery ?? '');

    if (!serverQuery) {
      setFiles([]);
      return;
    }

    let cancelled = false;
    pendingSearchRef.current++;
    setLoading(true);

    searchFiles(currentDirectory, serverQuery, 80, {
      includeHidden: showHidden,
      respectGitignore: !showGitignored,
      type: 'file',
    })
      .then((hits) => {
        if (cancelled) {
          return;
        }

        const recentSet = new Set(visibleRecentFiles.map((file) => file.path));
        setFiles(hits.filter((hit) => !recentSet.has(hit.path)));
      })
      .catch(() => {
        if (!cancelled) {
          setFiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          pendingSearchRef.current--;
          if (pendingSearchRef.current <= 0) {
            pendingSearchRef.current = 0;
            setLoading(false);
          }
        }
      });

    return () => {
      cancelled = true;
      pendingSearchRef.current = Math.max(0, pendingSearchRef.current - 1);
      if (pendingSearchRef.current <= 0) {
        setLoading(false);
      }
    };
  }, [currentDirectory, debouncedQuery, visibleRecentFiles, searchFiles, showHidden, showGitignored]);

  React.useEffect(() => {
    if (!currentDirectory) {
      setDirectories([]);
      return;
    }

    const serverQuery = mentionServerQuery(debouncedQuery ?? '');

    if (!serverQuery) {
      setDirectories([]);
      return;
    }

    let cancelled = false;
    pendingSearchRef.current++;
    setLoading(true);

    searchFiles(currentDirectory, serverQuery, 20, {
      includeHidden: showHidden,
      respectGitignore: !showGitignored,
      type: 'directory',
    })
      .then((hits) => {
        if (!cancelled) {
          setDirectories(hits);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDirectories([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          pendingSearchRef.current--;
          if (pendingSearchRef.current <= 0) {
            pendingSearchRef.current = 0;
            setLoading(false);
          }
        }
      });

    return () => {
      cancelled = true;
      pendingSearchRef.current = Math.max(0, pendingSearchRef.current - 1);
      if (pendingSearchRef.current <= 0) {
        setLoading(false);
      }
    };
  }, [currentDirectory, debouncedQuery, searchFiles, showHidden, showGitignored]);

  React.useEffect(() => {
    setSelectedIndex(0);
    setSelectedOverflow(null);
  }, [visibleResults, visibleRecentFiles]);

  React.useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  React.useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({
      block: 'nearest'
    });
  }, [selectedIndex]);

  React.useEffect(() => {
    let frameId: number | null = null;

    const updateOverflow = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        const node = labelRefs.current[selectedIndex];
        if (!node) {
          setSelectedOverflow(null);
          return;
        }
        const measureNode = measureRefs.current[selectedIndex];
        const fullWidth = measureNode?.offsetWidth ?? node.scrollWidth;
        const overflowPx = Math.max(0, fullWidth - node.clientWidth);
        const duration = Math.max(0.6, overflowPx / 110);
        setSelectedOverflow((current) => {
          if (overflowPx <= 8) return null;
          return current?.index === selectedIndex && current.duration === duration
            ? current
            : { index: selectedIndex, duration };
        });
      });
    };

    updateOverflow();
    window.addEventListener('resize', updateOverflow);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      window.removeEventListener('resize', updateOverflow);
    };
  }, [selectedIndex, visibleRecentFiles, visibleResults]);

  React.useEffect(() => {
    const labelNode = labelRefs.current[selectedIndex];
    if (!labelNode) {
      return;
    }

    const updateWidth = () => {
      const width = labelNode.clientWidth;
      if (width > 0) {
        setMarqueeWidth(width);
      }
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(labelNode);

    return () => {
      observer.disconnect();
    };
  }, [selectedIndex]);

  const handleFileSelect = React.useCallback((file: FileInfo) => {
    onFileSelect(file);
  }, [onFileSelect]);

  React.useImperativeHandle(ref, () => ({
    handleKeyDown: (key: string) => {
      if (key === 'Escape') {
        onClose();
        return;
      }

      const total = visibleRecentFiles.length + visibleResults.length;
      if (total === 0) {
        return;
      }

      if (key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % total);
        return;
      }

      if (key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev - 1 + total) % total);
        return;
      }

      if (key === 'Enter' || key === 'Tab') {
        const safeIndex = ((selectedIndexRef.current % total) + total) % total;
        const recentIndex = safeIndex;
        const selectedFile = recentIndex < visibleRecentFiles.length
          ? visibleRecentFiles[recentIndex]
          : visibleResults[recentIndex - visibleRecentFiles.length];
        if (selectedFile) {
          handleFileSelect(selectedFile);
        }
      }
    }
  }), [visibleResults, visibleRecentFiles, onClose, handleFileSelect]);

  const getFileIcon = (file: { path: string; extension?: string }) => {
    const ext = file.extension?.toLowerCase();
    if (file.path.includes('://')) return 'terminal-box-line';
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        return <Icon name="code" className="h-3.5 w-3.5 text-[var(--status-info)]" />;
      case 'json':
        return <Icon name="code" className="h-3.5 w-3.5 text-[var(--status-warning)]" />;
      case 'md':
      case 'mdx':
        return <Icon name="file" className="h-3.5 w-3.5 text-muted-foreground" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
        return <Icon name="file-image" className="h-3.5 w-3.5 text-[var(--status-success)]" />;
      default:
        return <Icon name="file-pdf" className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
      <div
        ref={containerRef}
        className="absolute z-[100] min-w-0 w-full max-w-[640px] max-h-64 oc-glass-popover border-2 border-border/60 rounded-xl shadow-none bottom-full mb-2 left-0 flex flex-col"
        style={mobileMaxHeight !== undefined ? { ...style, maxHeight: mobileMaxHeight } : style}
      >
        <ScrollableOverlay preventOverscroll outerClassName="flex-1 min-h-0" className="px-0">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Icon name="refresh" className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="pb-2">
            {visibleRecentFiles.map((file, index) => {
              const rowIndex = index;
              const relativePath = file.relativePath || file.name;
              const displayPath = truncatePathMiddle(relativePath, { maxLength: 60 });
              const isSelected = selectedIndex === rowIndex;
              const isOverflowing = selectedOverflow?.index === rowIndex;
              const marqueeDuration = selectedOverflow?.index === rowIndex ? selectedOverflow.duration : 2.6;

              return (
                <div
                  key={`recent-${file.path}`}
                  ref={(el) => { itemRefs.current[rowIndex] = el; }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 cursor-pointer typography-ui-label rounded-lg",
                    isSelected && "bg-interactive-selection"
                  )}
                  onClick={() => handleFileSelect(file)}
                  onMouseMove={() => setSelectedIndex(rowIndex)}
                >
                  {getFileIcon(file)}
                  <span
                    ref={(el) => { labelRefs.current[rowIndex] = el; }}
                    className="relative flex-1 min-w-0 overflow-hidden file-mention-marquee-container"
                    style={isSelected ? {
                      ['--file-mention-marquee-width' as string]: `${marqueeWidth}px`,
                      ['--file-mention-marquee-duration' as string]: `${marqueeDuration}s`
                    } : undefined}
                    aria-label={relativePath}
                  >
                    <span
                      ref={(el) => { measureRefs.current[rowIndex] = el; }}
                      className="absolute invisible whitespace-nowrap pointer-events-none"
                      aria-hidden
                    >
                      {relativePath}
                    </span>
                    {isOverflowing && isSelected ? (
                      <span className="inline-block whitespace-nowrap file-mention-marquee">
                        {relativePath}
                      </span>
                    ) : (
                      <span className="block truncate">
                        {displayPath}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
            {visibleRecentFiles.length > 0 && visibleResults.length > 0 && (
              <div className="my-1 border-t border-border/60" />
            )}
            {visibleResults.map((file, index) => {
              const rowIndex = visibleRecentFiles.length + index;
              const relativePath = file.relativePath || file.name;
              const displayPath = truncatePathMiddle(relativePath, { maxLength: 60 });
              const isSelected = selectedIndex === rowIndex;
              const isOverflowing = selectedOverflow?.index === rowIndex;
              const marqueeDuration = selectedOverflow?.index === rowIndex ? selectedOverflow.duration : 2.6;

              const item = (
                <div
                  ref={(el) => { itemRefs.current[rowIndex] = el; }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 cursor-pointer typography-ui-label rounded-lg",
                      isSelected && "bg-interactive-selection"
                  )}
                  onClick={() => handleFileSelect(file)}
                  onMouseMove={() => setSelectedIndex(rowIndex)}
                >
                  {file.kind === 'directory'
                    ? <Icon name="folder-3-fill" className="h-3.5 w-3.5 text-primary/60" />
                    : getFileIcon(file)}
                  <span
                    ref={(el) => { labelRefs.current[rowIndex] = el; }}
                    className="relative flex-1 min-w-0 overflow-hidden file-mention-marquee-container"
                    style={isSelected ? {
                      ['--file-mention-marquee-width' as string]: `${marqueeWidth}px`,
                      ['--file-mention-marquee-duration' as string]: `${marqueeDuration}s`
                    } : undefined}
                    aria-label={relativePath}
                  >
                    <span
                      ref={(el) => { measureRefs.current[rowIndex] = el; }}
                      className="absolute invisible whitespace-nowrap pointer-events-none"
                      aria-hidden
                    >
                      {relativePath}
                    </span>
                    {isOverflowing && isSelected ? (
                      <span className="inline-block whitespace-nowrap file-mention-marquee">
                        {relativePath}
                      </span>
                    ) : (
                      <span className="block truncate">
                        {displayPath}
                      </span>
                    )}
                  </span>
                </div>
              );

              return (
                <React.Fragment key={`${file.kind}-${file.path}`}>
                  {item}
                </React.Fragment>
              );
            })}
            {visibleResults.length === 0 && visibleRecentFiles.length === 0 && (
              <div className="px-3 py-2 typography-ui-label text-muted-foreground">
                {t('chat.fileMentionAutocomplete.empty')}
              </div>
            )}
          </div>
        )}
        </ScrollableOverlay>
        {!isMobile && (
          <div className="px-3 pt-1 pb-1.5 border-t typography-meta text-muted-foreground">
            {t('chat.autocomplete.keyboardHint')}
          </div>
        )}
    </div>
  );
});
