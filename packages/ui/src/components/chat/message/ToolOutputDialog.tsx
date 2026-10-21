import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PatchDiff } from '@pierre/diffs/react';
import { WorkerHighlightedCode } from '@/components/code/WorkerHighlightedCode';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';
import { SimpleMarkdownRenderer } from '../MarkdownRenderer';
import { toolDisplayStyles } from '@/lib/typography';
import { isSubagentTool } from '@/lib/toolHelpers';
import { useOptionalThemeSystem } from '@/contexts/useThemeSystem';
import { ensurePierreThemeRegistered } from '@/lib/shiki/appThemeRegistry';
import { getDefaultTheme } from '@/lib/theme/themes';
import { renderGlobOutput, renderGrepOutput, renderWebSearchOutput, tryParseJsonOutput } from './toolRenderers';
import type { ToolPopupContent, DiffViewMode } from './types';
import { DiffViewToggle } from './DiffViewToggle';
import { JsonTreeView } from '@/components/ui/JsonTreeView';
import { Icon } from "@/components/icon/Icon";
import { getToolIcon } from './parts/toolPresentation';
import { useGuestToolPresentation } from '@/lib/guests/tool-presentation';
import { useI18n, type I18nKey, type I18nParams } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { MermaidLoadFailure, getMermaidDataUrlSourcePromise, isCurrentMermaidLoadRequest, isMermaidLoadFailure, nextMermaidLoadRequestId } from './toolOutputDialogMermaid';
import { MediaArtifact } from '@/components/views/files/previews/MediaArtifact';
import { formatFileSize } from '@/lib/fileSize';

interface ToolOutputDialogProps {
    popup: ToolPopupContent;
    onOpenChange: (open: boolean) => void;
    isMobile: boolean;
}

const mermaidLoadFailure = (key: I18nKey, params?: I18nParams): MermaidLoadFailure => new MermaidLoadFailure(key, params);

const PREVIEW_ANIMATION_MS = 150;
const MERMAID_DIALOG_HEADER_HEIGHT = 40;
const MERMAID_ASPECT_RETRY_DELAY_MS = 120;
const MERMAID_ASPECT_MAX_RETRIES = 3;

const DIALOG_CODE_TAG_PROPS = { style: { background: 'transparent', backgroundColor: 'transparent', fontSize: 'inherit' } };

const MERMAID_CONTROLS = { download: false, copy: false, showPanZoomControls: true };

type PierreThemeConfig = {
    theme: { light: string; dark: string };
    themeType: 'light' | 'dark';
};

const TOOL_DIFF_UNSAFE_CSS = `
  [data-diff-header],
  [data-diff] {
    [data-separator] {
      height: 24px !important;
    }
  }
`;

const TOOL_DIFF_METRICS = {
    hunkLineCount: 50,
    lineHeight: 24,
    diffHeaderHeight: 44,
    hunkSeparatorHeight: 24,
    spacing: 0,
};

const usePierreThemeConfig = (): PierreThemeConfig => {
    const themeSystem = useOptionalThemeSystem();
    const fallbackLightTheme = React.useMemo(() => getDefaultTheme(false), []);
    const fallbackDarkTheme = React.useMemo(() => getDefaultTheme(true), []);

    const availableThemes = React.useMemo(
        () => themeSystem?.availableThemes ?? [fallbackLightTheme, fallbackDarkTheme],
        [fallbackDarkTheme, fallbackLightTheme, themeSystem?.availableThemes],
    );
    const lightThemeId = themeSystem?.lightThemeId ?? fallbackLightTheme.metadata.id;
    const darkThemeId = themeSystem?.darkThemeId ?? fallbackDarkTheme.metadata.id;

    const lightTheme = React.useMemo(
        () => availableThemes.find((theme) => theme.metadata.id === lightThemeId) ?? fallbackLightTheme,
        [availableThemes, fallbackLightTheme, lightThemeId],
    );
    const darkTheme = React.useMemo(
        () => availableThemes.find((theme) => theme.metadata.id === darkThemeId) ?? fallbackDarkTheme,
        [availableThemes, darkThemeId, fallbackDarkTheme],
    );

    React.useEffect(() => {
        ensurePierreThemeRegistered(lightTheme);
        ensurePierreThemeRegistered(darkTheme);
    }, [darkTheme, lightTheme]);

    const currentVariant = themeSystem?.currentTheme.metadata.variant ?? 'light';

    return {
        theme: { light: lightTheme.metadata.id, dark: darkTheme.metadata.id },
        themeType: currentVariant === 'dark' ? 'dark' : 'light',
    };
};

type ViewportSize = { width: number; height: number };

const getWindowViewport = (): ViewportSize => ({
    width: window.innerWidth,
    height: window.innerHeight,
});

const PREVIEW_VIEWPORT_LIMITS = {
    mobile: { widthRatio: 0.94, heightRatio: 0.86, padding: 10 },
    desktop: { widthRatio: 0.8, heightRatio: 0.8, padding: 16 },
} as const;

const getPreviewViewportBounds = (viewport: { width: number; height: number }, isMobile: boolean) => {
    const limits = isMobile ? PREVIEW_VIEWPORT_LIMITS.mobile : PREVIEW_VIEWPORT_LIMITS.desktop;
    const paddedWidth = Math.max(160, viewport.width - limits.padding * 2);
    const paddedHeight = Math.max(160, viewport.height - limits.padding * 2);

    return {
        maxWidth: Math.max(160, Math.min(paddedWidth, viewport.width * limits.widthRatio)),
        maxHeight: Math.max(160, Math.min(paddedHeight, viewport.height * limits.heightRatio)),
    };
};

const getSvgAspectRatio = (svg: SVGElement): number | null => {
    try {
        const groups = Array.from(svg.querySelectorAll('g'));
        let bestArea = 0;
        let bestRatio: number | null = null;

        for (const group of groups) {
            if (!(group instanceof SVGGraphicsElement)) {
                continue;
            }
            const box = group.getBBox();
            if (!(box.width > 0 && box.height > 0)) {
                continue;
            }
            const area = box.width * box.height;
            if (area > bestArea) {
                bestArea = area;
                bestRatio = box.width / box.height;
            }
        }

        if (bestRatio && Number.isFinite(bestRatio) && bestRatio > 0) {
            return bestRatio;
        }
    } catch {
        // Ignore getBBox failures and fall back to SVG attrs/viewBox.
    }

    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
        const parts = viewBox.trim().split(/\s+/).map(Number);
        if (parts.length === 4) {
            const width = parts[2];
            const height = parts[3];
            if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
                return width / height;
            }
        }
    }

    const attrWidth = Number(svg.getAttribute('width'));
    const attrHeight = Number(svg.getAttribute('height'));
    if (Number.isFinite(attrWidth) && Number.isFinite(attrHeight) && attrWidth > 0 && attrHeight > 0) {
        return attrWidth / attrHeight;
    }

    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
        return rect.width / rect.height;
    }

    return null;
};

const usePreviewOverlayState = (open: boolean) => {
    const [isRendered, setIsRendered] = React.useState(open);
    const [isVisible, setIsVisible] = React.useState(open);
    const [isTransitioning, setIsTransitioning] = React.useState(false);

    React.useEffect(() => {
        if (open) {
            setIsRendered(true);
            setIsTransitioning(true);

            const raf = window.requestAnimationFrame(() => {
                setIsVisible(true);
            });

            const doneId = window.setTimeout(() => {
                setIsTransitioning(false);
            }, PREVIEW_ANIMATION_MS);

            return () => {
                window.cancelAnimationFrame(raf);
                window.clearTimeout(doneId);
            };
        }

        setIsVisible(false);
        setIsTransitioning(true);

        const timeoutId = window.setTimeout(() => {
            setIsRendered(false);
            setIsTransitioning(false);
        }, PREVIEW_ANIMATION_MS);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [open]);

    return { isRendered, isVisible, isTransitioning };
};

const usePreviewViewport = (open: boolean) => {
    const [viewport, setViewport] = React.useState<ViewportSize>(getWindowViewport);

    React.useEffect(() => {
        if (!open) {
            return;
        }

        const onResize = () => {
            setViewport(getWindowViewport());
        };

        onResize();
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
        };
    }, [open]);

    return viewport;
};

type PreviewMediaKind = 'image' | 'pdf' | 'audio' | 'video';

/**
 * Attachments forward their native MIME type. Browsers can render PDFs inline
 * and play audio/video with their own controls; anything else keeps the image
 * viewer it had before.
 */
const getPreviewMediaKind = (mimeType: string | undefined, filename: string | undefined): PreviewMediaKind => {
    const mime = (mimeType ?? '').toLowerCase().split(';', 1)[0]?.trim() ?? '';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    if (mime === 'application/pdf' || mime === 'application/x-pdf') return 'pdf';
    if (mime.startsWith('image/')) return 'image';

    const extension = filename?.split('.').pop()?.toLowerCase() ?? '';
    if (extension === 'pdf') return 'pdf';
    if (extension === 'mp3' || extension === 'wav' || extension === 'ogg' || extension === 'm4a'
        || extension === 'aac' || extension === 'flac' || extension === 'opus') return 'audio';
    if (extension === 'mp4' || extension === 'webm' || extension === 'mov' || extension === 'm4v'
        || extension === 'ogv' || extension === 'mkv') return 'video';
    return 'image';
};

interface PreviewGalleryItem {
    url: string;
    mimeType?: string;
    filename?: string;
    size?: number;
}

const MediaPreviewDialog: React.FC<{
    popup: ToolPopupContent;
    onOpenChange: (open: boolean) => void;
    isMobile: boolean;
}> = ({ popup, onOpenChange, isMobile }) => {
    const { t } = useI18n();
    const mediaKind = getPreviewMediaKind(popup.image?.mimeType, popup.image?.filename);
    const gallery = React.useMemo<PreviewGalleryItem[]>(() => {
        const baseImage = popup.image;
        if (!baseImage || mediaKind !== 'image') return [];
        const fromPopup = Array.isArray(baseImage.gallery)
            ? baseImage.gallery.filter((item): item is PreviewGalleryItem => Boolean(item?.url))
            : [];

        if (fromPopup.length > 0) {
            return fromPopup;
        }

        return [{
            url: baseImage.url,
            mimeType: baseImage.mimeType,
            filename: baseImage.filename,
            size: baseImage.size,
        }];
    }, [mediaKind, popup.image]);

    const [currentIndex, setCurrentIndex] = React.useState(0);
    const [mediaNaturalSize, setMediaNaturalSize] = React.useState<{ url: string; width: number; height: number } | null>(null);
    const { isRendered, isVisible, isTransitioning } = usePreviewOverlayState(popup.open);
    const viewport = usePreviewViewport(popup.open);

    React.useEffect(() => {
        if (!popup.open || gallery.length === 0) {
            return;
        }

        const requestedIndex = popup.image?.index ?? -1;
        if (requestedIndex >= 0 && requestedIndex < gallery.length) {
            setCurrentIndex(requestedIndex);
            return;
        }

        const matchingIndex = popup.image?.url
            ? gallery.findIndex((item) => item.url === popup.image?.url)
            : -1;
        setCurrentIndex(matchingIndex >= 0 ? matchingIndex : 0);
    }, [gallery, popup.image?.index, popup.image?.url, popup.open]);

    const currentMedia = mediaKind === 'image'
        ? gallery[currentIndex] ?? gallery[0] ?? popup.image
        : popup.image;
    const titleFallback = mediaKind === 'image' ? 'Image preview'
        : mediaKind === 'pdf' ? 'PDF preview'
        : mediaKind === 'audio' ? 'Audio preview'
        : 'Video preview';
    const mediaTitle = currentMedia?.filename || popup.title || titleFallback;
    const hasMultipleImages = mediaKind === 'image' && gallery.length > 1;
    const mediaSizeLabel = formatFileSize(currentMedia?.size);

    const showPrevious = React.useCallback(() => {
        if (gallery.length <= 1) return;
        setCurrentIndex((prev) => (prev - 1 + gallery.length) % gallery.length);
    }, [gallery.length]);

    const showNext = React.useCallback(() => {
        if (gallery.length <= 1) return;
        setCurrentIndex((prev) => (prev + 1) % gallery.length);
    }, [gallery.length]);

    React.useEffect(() => {
        if (!popup.open) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onOpenChange(false);
                return;
            }

            if (event.key === 'ArrowLeft' && hasMultipleImages) {
                event.preventDefault();
                showPrevious();
                return;
            }

            if (event.key === 'ArrowRight' && hasMultipleImages) {
                event.preventDefault();
                showNext();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [hasMultipleImages, onOpenChange, popup.open, showNext, showPrevious]);

    // The measured size belongs to one URL. Resetting it in an effect on URL
    // change raced the load event of an already-cached image, which left the
    // viewer stuck at its maximum box with wide dead margins around the image.
    const currentMediaUrl = currentMedia?.url;
    const currentNaturalSize = mediaNaturalSize && mediaNaturalSize.url === currentMediaUrl
        ? mediaNaturalSize
        : null;

    const imageDisplaySize = React.useMemo(() => {
        const maxWidth = Math.max(160, viewport.width * (isMobile ? 0.86 : 0.75));
        const maxHeight = Math.max(160, viewport.height * (isMobile ? 0.72 : 0.75));

        if (!currentNaturalSize) {
            return {
                width: Math.round(maxWidth),
                height: Math.round(maxHeight),
            };
        }

        const widthScale = maxWidth / currentNaturalSize.width;
        const heightScale = maxHeight / currentNaturalSize.height;
        const scale = Math.min(widthScale, heightScale);

        return {
            width: Math.max(1, Math.round(currentNaturalSize.width * scale)),
            height: Math.max(1, Math.round(currentNaturalSize.height * scale)),
        };
    }, [currentNaturalSize, isMobile, viewport.height, viewport.width]);

    const mediaDisplaySize = React.useMemo(() => {
        if (mediaKind === 'image') return imageDisplaySize;

        const bounds = getPreviewViewportBounds(viewport, isMobile);
        if (mediaKind === 'audio') {
            return { width: Math.round(Math.min(480, bounds.maxWidth)), height: 220 };
        }
        if (mediaKind === 'pdf') {
            return {
                width: Math.round(Math.min(bounds.maxWidth, 1024)),
                height: Math.round(Math.min(bounds.maxHeight, 900)),
            };
        }
        const width = Math.round(bounds.maxWidth);
        return {
            width,
            height: Math.round(Math.min(bounds.maxHeight, Math.max(180, width * 9 / 16))),
        };
    }, [imageDisplaySize, isMobile, mediaKind, viewport]);

    if (!isRendered || !currentMedia) {
        return null;
    }

    const content = (
        <div className={cn('fixed inset-0 z-50', popup.open ? 'pointer-events-auto' : 'pointer-events-none')}>
            <div
                aria-hidden="true"
                className={cn(
                    // Same scrim as DialogOverlay, so the image viewer sits on
                    // the app the way every other dialog does.
                    'oc-glass-backdrop absolute inset-0 bg-surface-overlay/60',
                    isTransitioning && 'transition-opacity duration-150 ease-out',
                    isVisible ? 'opacity-100' : 'opacity-0'
                )}
                onMouseDown={() => onOpenChange(false)}
            />

            {hasMultipleImages && (
                <>
                    <button
                        type="button"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={showPrevious}
                        className="absolute left-3 top-1/2 -translate-y-1/2 z-10 h-10 w-10 flex items-center justify-center rounded-full bg-surface-elevated/90 text-surface-elevated-foreground hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label={t('chat.toolOutputDialog.image.previousAria')}
                    >
                        <Icon name="arrow-left-s" className="h-6 w-6" />
                    </button>
                    <button
                        type="button"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={showNext}
                        className="absolute right-3 top-1/2 -translate-y-1/2 z-10 h-10 w-10 flex items-center justify-center rounded-full bg-surface-elevated/90 text-surface-elevated-foreground hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label={t('chat.toolOutputDialog.image.nextAria')}
                    >
                        <Icon name="arrow-right-s" className="h-6 w-6" />
                    </button>
                </>
            )}

            <div
                className={cn(
                    'absolute inset-0 flex items-center justify-center pointer-events-none',
                    isMobile ? 'p-2.5' : 'p-4'
                )}
            >
                <div
                    className={cn(
                        'pointer-events-auto flex flex-col gap-2',
                        isTransitioning && 'transition-opacity duration-150 ease-out',
                        isVisible ? 'opacity-100' : 'opacity-0'
                    )}
                    style={{ width: `${mediaDisplaySize.width}px` }}
                >
                    <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1 text-foreground typography-ui-header font-semibold truncate" title={mediaTitle}>
                            {mediaTitle}
                        </div>
                        {mediaSizeLabel ? (
                            <span className="shrink-0 typography-meta text-muted-foreground">{mediaSizeLabel}</span>
                        ) : null}
                        <button
                            type="button"
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground/80 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            onClick={() => onOpenChange(false)}
                            aria-label={t('chat.toolOutputDialog.image.closeAria')}
                        >
                            <Icon name="close" className="h-4 w-4" />
                        </button>
                    </div>

                    {mediaKind === 'pdf' ? (
                        <iframe
                            src={currentMedia.url}
                            title={mediaTitle}
                            className="block w-full rounded-lg border border-border/30 bg-white"
                            style={{ height: `${mediaDisplaySize.height ?? 480}px` }}
                        />
                    ) : mediaKind === 'audio' ? (
                        <div
                            className="w-full overflow-hidden rounded-lg border border-border/30 bg-[var(--surface-elevated)]"
                            style={{ height: `${mediaDisplaySize.height ?? 220}px` }}
                        >
                            <MediaArtifact
                                kind="audio"
                                src={currentMedia.url}
                                name={mediaTitle}
                                sizeBytes={currentMedia.size ?? null}
                            />
                        </div>
                    ) : mediaKind === 'video' ? (
                        <div
                            className="w-full overflow-hidden rounded-lg border border-border/30 bg-[var(--surface-background)]"
                            style={{ height: `${mediaDisplaySize.height ?? 320}px` }}
                        >
                            <MediaArtifact
                                kind="video"
                                src={currentMedia.url}
                                name={mediaTitle}
                                sizeBytes={currentMedia.size ?? null}
                            />
                        </div>
                    ) : (
                        <img
                            src={currentMedia.url}
                            alt={mediaTitle}
                            className="block object-contain"
                            style={{ width: `${imageDisplaySize.width}px`, height: `${imageDisplaySize.height}px` }}
                            loading="lazy"
                            onLoad={(event) => {
                                const element = event.currentTarget;
                                const width = element.naturalWidth;
                                const height = element.naturalHeight;
                                const url = element.getAttribute('src') ?? '';
                                if (width > 0 && height > 0) {
                                    setMediaNaturalSize((previous) => {
                                        if (previous && previous.url === url && previous.width === width && previous.height === height) {
                                            return previous;
                                        }
                                        return { url, width, height };
                                    });
                                }
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

// ── PERF-007: Virtualised sub-components for dialog ──────────────────

const DialogUnifiedDiff: React.FC<{
    popup: ToolPopupContent;
    diffViewMode: DiffViewMode;
    pierreThemeConfig: PierreThemeConfig;
}> = React.memo(({ popup, diffViewMode, pierreThemeConfig }) => {
    const patchContent = popup.content || '';

    return (
        <div className="typography-code">
            <PatchDiff
                patch={patchContent}
                metrics={TOOL_DIFF_METRICS}
                options={{
                    diffStyle: diffViewMode === 'unified' ? 'unified' : 'split',
                    diffIndicators: 'none',
                    hunkSeparators: 'line-info-basic',
                    lineDiffType: 'none',
                    disableFileHeader: true,
                    maxLineDiffLength: 1000,
                    expansionLineCount: 20,
                    overflow: 'wrap',
                    theme: pierreThemeConfig.theme,
                    themeType: pierreThemeConfig.themeType,
                    unsafeCSS: TOOL_DIFF_UNSAFE_CSS,
                }}
                className="block w-full"
            />
        </div>
    );
});

DialogUnifiedDiff.displayName = 'DialogUnifiedDiff';

const MermaidPreviewDialog: React.FC<{
    popup: ToolPopupContent;
    onOpenChange: (open: boolean) => void;
    isMobile: boolean;
}> = ({ popup, onOpenChange, isMobile }) => {
    const { t } = useI18n();
    const [source, setSource] = React.useState<string>(popup.mermaid?.source || '');
    const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>(popup.mermaid?.source ? 'ready' : 'idle');
    const [errorMessage, setErrorMessage] = React.useState<string>('');
    const { isRendered, isVisible, isTransitioning } = usePreviewOverlayState(popup.open);
    const [diagramAspectRatio, setDiagramAspectRatio] = React.useState<number | null>(null);
    const viewport = usePreviewViewport(popup.open);
    const requestIdRef = React.useRef(0);
    const mermaidPreviewRef = React.useRef<HTMLDivElement | null>(null);

    const normalizeFilePath = React.useCallback((rawPath: string): string | null => {
        const input = rawPath.trim();
        if (!input.toLowerCase().startsWith('file://')) {
            return null;
        }

        const isSafeLocalPath = (path: string): boolean => {
            if (!path || /[\0\r\n]/.test(path)) {
                return false;
            }

            const normalized = path.replace(/\\/g, '/');
            const segments = normalized.split('/').filter(Boolean);
            if (segments.includes('..')) {
                return false;
            }

            if (normalized.startsWith('/')) {
                return true;
            }

            return /^[A-Za-z]:\//.test(normalized);
        };

        const decodeLoose = (value: string): string => {
            return value.replace(/%([0-9A-Fa-f]{2})/g, (_match, hex: string) => {
                const codePoint = Number.parseInt(hex, 16);
                return Number.isFinite(codePoint) ? String.fromCharCode(codePoint) : `%${hex}`;
            });
        };

        const canParse = URL.canParse(input);

        if (canParse) {
            let pathname = decodeLoose(new URL(input).pathname || '');
            if (/^\/[A-Za-z]:\//.test(pathname)) {
                pathname = pathname.slice(1);
            }
            return isSafeLocalPath(pathname) ? pathname : null;
        }

        const stripped = input.replace(/^file:\/\//i, '');
        const decoded = decodeLoose(stripped);
        return isSafeLocalPath(decoded) ? decoded : (isSafeLocalPath(stripped) ? stripped : null);
    }, []);

    const loadMermaidSource = React.useCallback(async () => {
        const target = popup.mermaid;
        const requestId = nextMermaidLoadRequestId(requestIdRef.current);
        requestIdRef.current = requestId;

        if (!target?.url) {
            setStatus('error');
            setErrorMessage(t('chat.toolOutputDialog.mermaid.missingSource'));
            return;
        }

        if (target.source) {
            setSource(target.source);
            setStatus('ready');
            setErrorMessage('');
            return;
        }

        setStatus('loading');
        setErrorMessage('');

        let sourcePromise: Promise<string>;
        if (target.url.startsWith('data:')) {
            sourcePromise = getMermaidDataUrlSourcePromise(target.url);
        } else if (target.url.toLowerCase().startsWith('file://')) {
            const normalizedPath = normalizeFilePath(target.url);
            if (!normalizedPath) {
                sourcePromise = Promise.reject(mermaidLoadFailure('chat.toolOutputDialog.mermaid.invalidLocalPath'));
            } else {
                sourcePromise = runtimeFetch('/api/fs/raw', { query: { path: normalizedPath } })
                    .then((response) => {
                        if (!response.ok) {
                            return Promise.reject(mermaidLoadFailure('chat.toolOutputDialog.mermaid.readFileFailedWithStatus', { status: response.status }));
                        }
                        return response.text();
                    });
            }
        } else {
            const canParse = URL.canParse(target.url, window.location.origin);
            const resolvedUrl = canParse ? new URL(target.url, window.location.origin) : null;

            if (!resolvedUrl || (resolvedUrl.protocol !== 'http:' && resolvedUrl.protocol !== 'https:')) {
                sourcePromise = Promise.reject(mermaidLoadFailure('chat.toolOutputDialog.mermaid.unsupportedUrlProtocol'));
            } else {
                sourcePromise = fetch(resolvedUrl.toString())
                    .then((response) => {
                        if (!response.ok) {
                            return Promise.reject(mermaidLoadFailure('chat.toolOutputDialog.mermaid.loadFailedWithStatus', { status: response.status }));
                        }
                        return response.text();
                    });
            }
        }

        await sourcePromise
            .then((resolvedSource) => {
                if (!isCurrentMermaidLoadRequest(requestIdRef.current, requestId)) {
                    return;
                }

                setSource(resolvedSource);
                setStatus('ready');
            })
            .catch((error) => {
                if (!isCurrentMermaidLoadRequest(requestIdRef.current, requestId)) {
                    return;
                }
                setStatus('error');
                setErrorMessage(isMermaidLoadFailure(error) ? t(error.key, error.params) : t('chat.toolOutputDialog.mermaid.loadFailed'));
            });
    }, [normalizeFilePath, popup.mermaid, t]);

    React.useEffect(() => {
        if (!popup.open || !popup.mermaid) {
            return;
        }
        void loadMermaidSource();
    }, [loadMermaidSource, popup.mermaid, popup.open]);

    React.useEffect(() => {
        if (!popup.open) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onOpenChange(false);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [onOpenChange, popup.open]);

    React.useEffect(() => {
        if (!popup.open || status !== 'ready') {
            setDiagramAspectRatio(null);
            return;
        }

        const measureAspectRatio = () => {
            const svg = mermaidPreviewRef.current?.querySelector('svg');
            if (!svg) {
                return false;
            }

            const aspectRatio = getSvgAspectRatio(svg);
            if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
                return false;
            }

            setDiagramAspectRatio((previous) => {
                if (previous && Math.abs(previous - aspectRatio) < 0.001) {
                    return previous;
                }
                return aspectRatio;
            });
            return true;
        };

        let rafId = window.requestAnimationFrame(() => {
            if (!measureAspectRatio()) {
                rafId = window.requestAnimationFrame(() => {
                    measureAspectRatio();
                });
            }
        });

        let retryCount = 0;
        let timeoutId: number | undefined;
        const scheduleRetry = () => {
            if (retryCount >= MERMAID_ASPECT_MAX_RETRIES) {
                return;
            }

            timeoutId = window.setTimeout(() => {
                retryCount += 1;
                if (!measureAspectRatio()) {
                    scheduleRetry();
                }
            }, MERMAID_ASPECT_RETRY_DELAY_MS);
        };
        scheduleRetry();

        const observer = new MutationObserver(() => {
            measureAspectRatio();
        });

        if (mermaidPreviewRef.current) {
            observer.observe(mermaidPreviewRef.current, { childList: true, subtree: true, attributes: true });
        }

        return () => {
            window.cancelAnimationFrame(rafId);
            if (timeoutId !== undefined) {
                window.clearTimeout(timeoutId);
            }
            observer.disconnect();
        };
    }, [popup.open, source, status]);

    const mermaidMarkdown = `\`\`\`mermaid\n${source}\n\`\`\``;

    const dialogSize = React.useMemo(() => {
        const { maxWidth, maxHeight } = getPreviewViewportBounds(viewport, isMobile);
        const availableDiagramHeight = Math.max(160, maxHeight - MERMAID_DIALOG_HEADER_HEIGHT);

        if (diagramAspectRatio && diagramAspectRatio < 1) {
            const squareSide = Math.min(maxWidth, availableDiagramHeight);
            return { width: Math.round(squareSide), height: Math.round(squareSide) };
        }

        return { width: Math.round(maxWidth), height: Math.round(availableDiagramHeight) };
    }, [diagramAspectRatio, isMobile, viewport]);

    if (!isRendered) {
        return null;
    }

    const content = (
        <div className={cn('fixed inset-0 z-50', popup.open ? 'pointer-events-auto' : 'pointer-events-none')}>
            <div
                aria-hidden="true"
                className={cn(
                    'absolute inset-0',
                    isTransitioning && 'transition-opacity duration-150 ease-out',
                    isVisible ? 'opacity-100' : 'opacity-0'
                )}
                style={{ backgroundColor: 'color-mix(in srgb, var(--surface-elevated) 70%, transparent)', color: 'var(--surface-elevated-foreground)' }}
                onMouseDown={() => onOpenChange(false)}
            />

            <div
                className={cn(
                    'absolute inset-0 flex items-center justify-center pointer-events-none',
                    isMobile ? 'p-2.5' : 'p-4'
                )}
            >
                <div
                    className={cn(
                        'pointer-events-auto flex flex-col gap-2',
                        isTransitioning && 'transition-opacity duration-150 ease-out',
                        isVisible ? 'opacity-100' : 'opacity-0'
                    )}
                    style={{ width: `${dialogSize.width}px` }}
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <div className="flex items-center justify-end">
                        <button
                            type="button"
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground/80 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            onClick={() => onOpenChange(false)}
                            aria-label={t('chat.toolOutputDialog.mermaid.closeAria')}
                        >
                            <Icon name="close" className="h-4 w-4" />
                        </button>
                    </div>
                    <div
                        className="relative overflow-hidden"
                        style={{ height: `${dialogSize.height}px` }}
                    >
                        <div className="h-full overflow-hidden">
                            {status === 'loading' && (
                                <div className="h-full min-h-28 flex items-center justify-center gap-2 text-muted-foreground typography-meta">
                                    <Icon name="loader-4" className="h-4 w-4 animate-spin" />
                                    <span>{t('chat.toolOutputDialog.mermaid.loading')}</span>
                                </div>
                            )}

                            {status === 'error' && (
                                <div
                                    className="rounded-xl border p-3 space-y-3"
                                    style={{
                                        backgroundColor: 'var(--status-error-background)',
                                        borderColor: 'var(--status-error-border)',
                                    }}
                                >
                                    <p className="typography-markdown" style={{ color: 'var(--status-error)' }}>
                                        {errorMessage || t('chat.toolOutputDialog.mermaid.renderFailed')}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void loadMermaidSource();
                                        }}
                                        className="px-3 py-1.5 rounded-lg typography-meta border transition-colors hover:bg-[var(--interactive-hover)]"
                                        style={{
                                            borderColor: 'var(--interactive-border)',
                                            color: 'var(--surface-foreground)',
                                        }}
                                    >
                                        {t('chat.toolOutputDialog.mermaid.retry')}
                                    </button>
                                </div>
                            )}

                            {status === 'ready' && (
                                <div ref={mermaidPreviewRef} className="h-full">
                                    <SimpleMarkdownRenderer
                                        content={mermaidMarkdown}
                                        variant="tool"
                                        allowMermaidWheelEvents
                                        className="markdown-mermaid-fullscreen h-full"
                                        mermaidControls={MERMAID_CONTROLS}
                                        enableFileReferences={false}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

const ToolOutputDialog: React.FC<ToolOutputDialogProps> = ({ popup, onOpenChange, isMobile }) => {
    const { t } = useI18n();
    const [diffViewMode, setDiffViewMode] = React.useState<DiffViewMode>('unified');
    const pierreThemeConfig = usePierreThemeConfig();
    const popupToolName = popup.toolName ?? popup.toolResult?.toolName ?? null;
    const popupToolPresentation = useGuestToolPresentation(popupToolName);
    const popupInput = popup.input;
    const hasPopupInput = Boolean(popupInput && Object.keys(popupInput).length > 0);
    const argumentsText = React.useMemo(() => {
        if (!popupInput || Object.keys(popupInput).length === 0) return '';
        // Deep inspection shows the complete canonical input. Tool-specific
        // formatting would hide fields the native tool also received.
        return JSON.stringify(popupInput, null, 2);
    }, [popupInput]);
    const popupError = popup.toolResult?.error;

    React.useEffect(() => {
        if (!popup.open) return;
        setDiffViewMode('unified');
    }, [popup.open, popup.title]);

    if (popup.image) {
        return <MediaPreviewDialog popup={popup} onOpenChange={onOpenChange} isMobile={isMobile} />;
    }

    if (popup.mermaid) {
        return <MermaidPreviewDialog popup={popup} onOpenChange={onOpenChange} isMobile={isMobile} />;
    }

    return (
        <Dialog open={popup.open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    'overflow-hidden flex flex-col min-h-0 pt-3 pb-4 px-4 gap-1',
                    '[&>button]:top-1.5',
                    isMobile ? 'w-[95vw] max-w-[95vw]' : 'max-w-5xl',
                    isMobile ? '[&>button]:right-1' : '[&>button]:top-2.5 [&>button]:right-4'
                )}
                style={{ maxHeight: '90vh' }}
            >
                <div className="flex-shrink-0 pb-1">
                    <div className="flex items-start gap-2 text-foreground typography-ui-header font-semibold">
                        {popupToolName ? getToolIcon(popupToolName, popupToolPresentation) : (
                            <Icon name="tools" className="h-3.5 w-3.5 text-foreground flex-shrink-0" />
                        )}
                        <span className="break-words flex-1 leading-tight">{popup.title}</span>
                        {popup.isDiff && (
                            <DiffViewToggle
                                mode={diffViewMode}
                                onModeChange={setDiffViewMode}
                                className="mr-8 flex-shrink-0"
                            />
                        )}
                    </div>
                </div>
                <div className="flex-1 min-h-0 rounded-xl border border-border/30 bg-muted/10 overflow-hidden">
                    <div className="tool-output-surface h-full max-h-[75vh] overflow-y-auto px-3 pr-4">
                        {hasPopupInput ? (
                            <div className="border-b border-border/20 p-4">
                                <div className="mb-2 typography-ui-label font-medium text-muted-foreground">
                                    {t('chat.toolOutputDialog.arguments')}
                                </div>
                                <div className="tool-input-surface bg-transparent rounded-xl border border-border/20">
                                    <WorkerHighlightedCode
                                        language="json"
                                        code={argumentsText}
                                        style={toolDisplayStyles.getPopupStyles()}
                                        codeStyle={DIALOG_CODE_TAG_PROPS.style}
                                        wrap
                                    />
                                </div>
                            </div>
                        ) : null}
                        {popupError ? (
                            <div className="border-b border-border/20 p-4">
                                <div className="mb-2 typography-ui-label font-medium text-muted-foreground">
                                    {t('chat.toolPart.error')}
                                </div>
                                <div
                                    className="typography-meta whitespace-pre-wrap rounded-xl border p-2"
                                    style={{
                                        backgroundColor: 'var(--status-error-background)',
                                        color: 'var(--status-error)',
                                        borderColor: 'var(--status-error-border)',
                                    }}
                                >
                                    {popupError}
                                </div>
                            </div>
                        ) : null}
                        {popup.isDiff ? (
                            <DialogUnifiedDiff
                                popup={popup}
                                diffViewMode={diffViewMode}
                                pierreThemeConfig={pierreThemeConfig}
                            />
                        ) : popup.content ? (
                        <div className="p-4">
                            <div className="mb-2 typography-ui-label font-medium text-muted-foreground">
                                {t('chat.toolPart.output')}
                            </div>
                            {(() => {
                                if (popupToolName === 'grep') {
                                    return renderGrepOutput(popup.content, isMobile) ?? (
                                        <WorkerHighlightedCode
                                            language={popup.language || 'text'}
                                            code={popup.content}
                                            style={toolDisplayStyles.getPopupContainerStyles()}
                                            codeStyle={DIALOG_CODE_TAG_PROPS.style}
                                            wrap
                                        />
                                    );
                                }

                                if (popupToolName === 'glob') {
                                    return renderGlobOutput(popup.content, isMobile) ?? (
                                        <WorkerHighlightedCode
                                            language={popup.language || 'text'}
                                            code={popup.content}
                                            style={toolDisplayStyles.getPopupContainerStyles()}
                                            codeStyle={DIALOG_CODE_TAG_PROPS.style}
                                            wrap
                                        />
                                    );
                                }

                                if (popupToolName && (isSubagentTool(popupToolName) || popupToolName === 'ask')) {
                                    return <SimpleMarkdownRenderer content={popup.content} variant="tool" />;
                                }

                                if (popupToolName === 'web_search') {
                                    return renderWebSearchOutput(popup.toolResult?.output, { unstyled: true });
                                }

                                // JSON tree viewer for generic JSON outputs
                                const jsonResult = tryParseJsonOutput(popup.content);
                                if (jsonResult.isJson) {
                                    return (
                                        <JsonTreeView
                                            jsonString={popup.content}
                                            initiallyExpandedDepth={3}
                                            maxHeight="70vh"
                                        />
                                    );
                                }

                                return (
                                    <WorkerHighlightedCode
                                        language={popup.language || 'text'}
                                        code={popup.content}
                                        style={toolDisplayStyles.getPopupContainerStyles()}
                                        codeStyle={DIALOG_CODE_TAG_PROPS.style}
                                        wrap
                                    />
                                );
                            })()}
                        </div>
                    ) : (
                        <div className="p-8 text-muted-foreground typography-ui-header">
                            <div className="mb-2">{t('chat.toolOutputDialog.commandCompleted')}</div>
                            <div className="typography-meta">{t('chat.toolOutputDialog.noOutputProduced')}</div>
                        </div>
                    )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

// Mounted by every chat message, which re-renders on each streamed chunk
// while the popup state and handlers stay the same.
export default React.memo(ToolOutputDialog);
