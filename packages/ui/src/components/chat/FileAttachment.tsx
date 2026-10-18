import React, { useRef, memo } from 'react';
import type { AttachmentPart, Part } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { useDraftAttachedFiles, useInputStore } from '@/sync/input-store';
import type { ChatDraftIdentity } from '@/lib/chatDraftPersistence';
import type { AttachedFile } from '@/sync/session-ui-store';
import { useUIStore } from '@/stores/useUIStore';
import { toast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/fileSize';
import { getLanguageFromExtension } from '@/lib/toolHelpers';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import { Icon } from "@/components/icon/Icon";
import { useI18n } from '@/lib/i18n';

import type { ToolPopupContent } from './message/types';

const FileAttachmentButton = memo(() => {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addAttachedFile = useInputStore((state) => state.addAttachedFile);
  const isMobile = useUIStore((state) => state.isMobile);
  const buttonSizeClass = isMobile ? 'h-9 w-9' : 'h-7 w-7';
  const iconSizeClass = isMobile ? 'h-5 w-5' : 'h-[18px] w-[18px]';

  const attachFiles = async (files: FileList | File[]) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        await addAttachedFile(file);
      } catch (error) {
        console.error('File attach failed', error);
        toast.error(error instanceof Error ? error.message : t('chat.fileAttachment.toast.attachFailed'));
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    await attachFiles(files);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'hover:bg-muted text-muted-foreground',
              buttonSizeClass
            )}
            aria-label={t('chat.fileAttachment.actions.attachAria')}
          >
            <Icon name="attachment-2" className={iconSizeClass} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{t('chat.fileAttachment.actions.attach')}</p>
        </TooltipContent>
      </Tooltip>
    </>
  );
});

FileAttachmentButton.displayName = 'FileAttachmentButton';

interface ImagePreviewProps {
  file: AttachedFile;
  onRemove: () => void;
  onShowPopup?: (content: ToolPopupContent) => void;
  gallery?: NonNullable<ToolPopupContent['image']>['gallery'];
  index?: number;
}

const ImagePreview = memo(({ file, onRemove, onShowPopup, gallery, index = 0 }: ImagePreviewProps) => {
  const { t } = useI18n();
  const isLocalImagePreview =
    file.source !== 'server' &&
    file.mimeType.startsWith('image/') &&
    typeof file.dataUrl === 'string' &&
    file.dataUrl.startsWith('data:image/');

  const imageUrl = isLocalImagePreview ? file.dataUrl : (file.serverPath || '');

  const extractFilename = (path: string): string => {
    const normalized = path.replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || path;
  };

  const getFileExtension = (filename: string): string => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  };

  const displayName = extractFilename(file.filename);
  const extension = getFileExtension(file.filename);
  const handleOpenPreview = React.useCallback(() => {
    if (!onShowPopup || !imageUrl) return;

    onShowPopup({
      open: true,
      title: displayName || 'Image',
      content: '',
      image: {
        url: imageUrl,
        mimeType: file.mimeType,
        filename: displayName,
        size: file.size,
        gallery,
        index,
      },
    });
  }, [displayName, file.mimeType, file.size, gallery, imageUrl, index, onShowPopup]);

  if (!imageUrl) {
    // Fallback to text-only for server images without preview
    return (
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity text-left h-5"
      >
        <FileTypeIcon filePath={file.filename} extension={extension} className="h-4 w-4" />
        <span className="text-foreground truncate max-w-[200px]">
          {displayName}
        </span>
        <span
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex items-center justify-center h-5 w-5 flex-shrink-0 hover:bg-[var(--interactive-hover)] rounded-full transition-colors cursor-pointer"
          aria-label={t('chat.fileAttachment.actions.removeNamed', { name: displayName })}
        >
          <Icon name="close" className="h-4 w-4 text-muted-foreground" />
        </span>
      </button>
    );
  }

  return (
    <div
      role={onShowPopup ? 'button' : undefined}
      tabIndex={onShowPopup ? 0 : undefined}
      onClick={handleOpenPreview}
      onKeyDown={(event) => {
        if (!onShowPopup) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleOpenPreview();
        }
      }}
      className="relative h-16 w-16 rounded-lg border border-border/80 bg-background overflow-hidden flex-shrink-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={displayName}
    >
      <img
        src={imageUrl}
        alt={displayName}
        className="h-full w-full object-cover"
        loading="lazy"
      />
      <button
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className="absolute top-1 right-1 h-5 w-5 rounded-md bg-background/80 text-foreground hover:bg-background flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        // Inline: the mobile stylesheet floors every button at 36px, which
        // would swallow a 64px thumbnail; the thumbnail itself is the target.
        style={{ width: 20, height: 20, minWidth: 0, minHeight: 0 }}
        title={t('chat.fileAttachment.actions.removeImage')}
        aria-label={t('chat.fileAttachment.actions.removeNamed', { name: displayName })}
      >
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});

ImagePreview.displayName = 'ImagePreview';

const useFileDetails = (file: AttachedFile) => {
  const getFileExtension = (filename: string): string => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  };

  const extractFilename = (path: string): string => {
    const normalized = path.replace(/\\/g, '/');
    const parts = normalized.split('/');
    const filename = parts[parts.length - 1];
    return filename || path;
  };

  return {
    displayName: extractFilename(file.filename),
    fileSize: formatFileSize(file.size),
    extension: getFileExtension(file.filename),
  };
};

interface FileChipProps {
  file: AttachedFile;
  onRemove: () => void;
}

const FileChip = memo(({ file, onRemove }: FileChipProps) => {
  const { t } = useI18n();
  const { displayName, fileSize, extension } = useFileDetails(file);

  return (
    <button
      type="button"
      onClick={(e) => {
        // Prevent click from bubbling if clicking the remove button
        if ((e.target as HTMLElement).closest('[data-remove-button]')) {
          return;
        }
      }}
      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/80 bg-background pl-2 pr-1 text-xs text-foreground text-left hover:opacity-90 transition-opacity"
      title={displayName}
    >
      <FileTypeIcon filePath={file.filename} extension={extension} className="h-4 w-4 flex-shrink-0" />
      <span className="truncate max-w-[200px]">{displayName}</span>
      {fileSize && <span className="text-muted-foreground flex-shrink-0">{fileSize}</span>}
      <span
        data-remove-button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="flex items-center justify-center h-5 w-5 flex-shrink-0 hover:bg-[var(--interactive-hover)] rounded-md transition-colors cursor-pointer"
        aria-label={t('chat.fileAttachment.actions.removeNamed', { name: displayName })}
      >
        <Icon name="close" className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
    </button>
  );
});

FileChip.displayName = 'FileChip';

interface AttachedFilesListProps {
  onShowPopup?: (content: ToolPopupContent) => void;
  className?: string;
  /** The composer draft whose files to show; its own even while another composer holds the slot. */
  draftIdentity?: ChatDraftIdentity | null;
}

export const AttachedFilesList = memo(({ onShowPopup, className, draftIdentity }: AttachedFilesListProps) => {
  const attachedFiles = useDraftAttachedFiles(draftIdentity);
  const removeAttachedFile = useInputStore((state) => state.removeAttachedFile);

  const localFiles = attachedFiles.filter((file) => file.source !== 'server');

  if (localFiles.length === 0) return null;

  const images = localFiles.filter((f) => f.mimeType.startsWith('image/'));
  const otherFiles = localFiles.filter((f) => !f.mimeType.startsWith('image/'));
  const imageGallery = images.map((file) => ({
    url: file.dataUrl || file.serverPath || '',
    mimeType: file.mimeType,
    filename: file.filename,
    size: file.size,
  })).filter((image) => image.url);

  return (
    <div className={cn('w-full space-y-2', className)}>
      {/* Images row - inline with previews */}
      {images.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {images.map((file, index) => (
            <ImagePreview
              key={file.id}
              file={file}
              onRemove={() => removeAttachedFile(file.id)}
              onShowPopup={onShowPopup}
              gallery={imageGallery}
              index={index}
            />
          ))}
        </div>
      )}
      
      {/* Other files row - inline text-only */}
      {otherFiles.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {otherFiles.map((file) => (
            <FileChip
              key={file.id}
              file={file}
              onRemove={() => removeAttachedFile(file.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

AttachedFilesList.displayName = 'AttachedFilesList';

const NativeAttachmentThumbnail = memo(({ part, workspaceId, runtimeKey, compact, onReady, onOpen }: {
  part: AttachmentPart;
  workspaceId: string | undefined;
  runtimeKey: string;
  compact: boolean;
  onReady: (attachmentId: string, url: string | null) => void;
  onOpen: () => void;
}) => {
  const { t } = useI18n();
  const [state, setState] = React.useState<{ kind: 'loading' } | { kind: 'ready'; url: string } | { kind: 'failed' }>({ kind: 'loading' });
  React.useEffect(() => {
    if (!workspaceId) {
      setState({ kind: 'failed' });
      return;
    }
    let active = true;
    let objectUrl: string | undefined;
    void canonicalClient.readAttachment(workspaceId, part.attachmentId).then((blob) => {
      if (!active || getRuntimeKey() !== runtimeKey) return;
      objectUrl = URL.createObjectURL(blob);
      setState({ kind: 'ready', url: objectUrl });
      onReady(part.attachmentId, objectUrl);
    }).catch(() => {
      if (active && getRuntimeKey() === runtimeKey) setState({ kind: 'failed' });
    });
    return () => {
      active = false;
      if (objectUrl) {
        onReady(part.attachmentId, null);
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [workspaceId, runtimeKey, part.attachmentId, onReady]);
  return (
    <button type="button" aria-label={part.name} disabled={state.kind !== 'ready'} onClick={onOpen}
      title={state.kind === 'failed' ? t('filesView.error.readFileFailed') : part.name}
      className={cn('relative border border-border/40 bg-muted/10 overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', compact ? 'flex-none h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16' : 'aspect-video w-full')}>
      {state.kind === 'ready' ? (
        <img src={state.url} alt={part.name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="flex h-full items-center justify-center text-muted-foreground"><Icon name="file-image" className="h-6 w-6" /></span>
      )}
      <span className="sr-only">{state.kind === 'failed' ? t('filesView.error.readFileFailed') : part.name}</span>
    </button>
  );
});

NativeAttachmentThumbnail.displayName = 'NativeAttachmentThumbnail';

interface MessageFilesDisplayProps {
  files: readonly Part[];
  workspaceId: string | undefined;
  onShowPopup?: (content: ToolPopupContent) => void;
  compact?: boolean;
  className?: string;
}

export const MessageFilesDisplay = memo(({ files, workspaceId, onShowPopup, compact = false, className }: MessageFilesDisplayProps) => {
  const { t } = useI18n();
  const runtimeKey = React.useSyncExternalStore(subscribeRuntimeEndpointChanged, getRuntimeKey, getRuntimeKey);
  const scope = JSON.stringify([runtimeKey, workspaceId]);
  const attachments = files.filter((part): part is AttachmentPart => part.type === 'attachment');
  const currentFiles = React.useRef(files);
  currentFiles.current = files;
  const [images, setImages] = React.useState<{ scope: string; urls: Map<string, string> }>(() => ({ scope, urls: new Map() }));
  const popupUrl = React.useRef<{ attachmentId: string; url: string } | null>(null);
  const clearPopupUrl = React.useCallback(() => {
    if (popupUrl.current) URL.revokeObjectURL(popupUrl.current.url);
    popupUrl.current = null;
  }, []);
  const generation = React.useRef(0);
  React.useEffect(() => {
    generation.current += 1;
    return () => {
      generation.current += 1;
      clearPopupUrl();
    };
  }, [scope, clearPopupUrl]);
  React.useEffect(() => {
    const popup = popupUrl.current;
    if (popup && !files.some((part) => part.type === 'attachment' && part.attachmentId === popup.attachmentId)) clearPopupUrl();
  }, [files, clearPopupUrl]);
  const onImageReady = React.useCallback((attachmentId: string, url: string | null) => {
    setImages((current) => {
      const urls = new Map(current.scope === scope ? current.urls : []);
      if (url) urls.set(attachmentId, url);
      else urls.delete(attachmentId);
      return { scope, urls };
    });
  }, [scope]);
  const openImage = (attachmentId: string) => {
    if (!onShowPopup || images.scope !== scope) return;
    const gallery = attachments.flatMap((part) => {
      const url = images.urls.get(part.attachmentId);
      return url ? [{ url, mimeType: part.mediaType, filename: part.name, size: part.size }] : [];
    });
    const url = images.urls.get(attachmentId);
    const index = gallery.findIndex((image) => image.url === url);
    const image = gallery[index];
    if (image) {
      generation.current += 1;
      clearPopupUrl();
      onShowPopup({ open: true, title: image.filename, content: '', image: { ...image, gallery, index } });
    }
  };
  const showFilePopup = async (part: AttachmentPart) => {
    if (!onShowPopup) return;
    if (!workspaceId) {
      toast.error(t('filesView.error.readFileFailed'));
      return;
    }
    generation.current += 1;
    const requestGeneration = generation.current;
    const current = () => requestGeneration === generation.current && getRuntimeKey() === runtimeKey
      && currentFiles.current.some((item) => item.type === 'attachment' && item.attachmentId === part.attachmentId);
    try {
      const blob = await canonicalClient.readAttachment(workspaceId, part.attachmentId);
      if (!current()) return;
      if (part.mediaType.startsWith('text/') || part.mediaType === 'application/json') {
        const content = await blob.text();
        if (!current()) return;
        clearPopupUrl();
        onShowPopup({ open: true, title: part.name, content, language: getLanguageFromExtension(part.name) || undefined });
        return;
      }
      clearPopupUrl();
      const url = URL.createObjectURL(blob);
      popupUrl.current = { attachmentId: part.attachmentId, url };
      onShowPopup({ open: true, title: part.name, content: '', image: { url, mimeType: part.mediaType, filename: part.name, size: part.size } });
    } catch {
      if (current()) toast.error(t('filesView.error.readFileFailed'));
    }
  };
  if (attachments.length === 0) return null;
  return (
    <div className={cn(compact ? 'flex flex-wrap items-center gap-1.5' : 'grid grid-cols-1 sm:grid-cols-2 gap-2', className ?? (compact ? 'mt-1.5' : undefined))}>
      {attachments.map((part) => {
        if (part.mediaType.startsWith('image/')) return (
          <NativeAttachmentThumbnail key={`${scope}:${part.partId}`} part={part} workspaceId={workspaceId} runtimeKey={runtimeKey} compact={compact} onReady={onImageReady} onOpen={() => openImage(part.attachmentId)} />
        );
        const isText = part.mediaType.startsWith('text/') || part.mediaType === 'application/json';
        const content = <>
          {part.mediaType.includes('pdf') ? <Icon name="file-pdf" className="h-3.5 w-3.5 text-muted-foreground" /> : <FileTypeIcon filePath={part.name} extension={part.name.split('.').pop() || ''} className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="max-w-[220px] truncate" title={part.name}>{part.name}</span>
        </>;
        return (
          <Tooltip key={part.partId}>
            <TooltipTrigger asChild>
              {compact && !isText ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-border/30 bg-muted/30 typography-meta">{content}</span>
              ) : (
                <button type="button" onClick={() => { void showFilePopup(part); }} className={cn('inline-flex items-center gap-1 rounded-lg border border-border/30 bg-muted/30 hover:bg-muted/50', compact ? 'px-2 py-0.5 typography-meta' : 'gap-2 p-2 text-sm')}>{content}</button>
              )}
            </TooltipTrigger>
            <TooltipContent>{part.name} ({formatFileSize(part.size)})</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
});

MessageFilesDisplay.displayName = 'MessageFilesDisplay';

interface ImageGalleryProps {
  urls: string[];
  caption?: string;
  onShowPopup?: (content: ToolPopupContent) => void;
}

const ImageGallery = memo(({ urls, caption, onShowPopup }: ImageGalleryProps) => {
  if (urls.length === 0) return null;

  const getGridCols = () => {
    if (urls.length === 1) return 'grid-cols-1';
    if (urls.length === 2) return 'grid-cols-2';
    if (urls.length <= 4) return 'grid-cols-2';
    return 'grid-cols-3';
  };

  return (
    <div className="space-y-2">
      <div className={cn("grid gap-2", getGridCols())}>
        {urls.map((url, index) => (
          <button
            key={url}
            type="button"
            onClick={() => onShowPopup?.({
              open: true,
              title: caption || `Image ${index + 1} of ${urls.length}`,
              content: '',
              image: {
                url,
                gallery: urls.map(u => ({ url: u })),
                index,
              },
            })}
            className="relative aspect-square rounded-lg border border-border/40 bg-muted/10 overflow-hidden group"
          >
            <img
              src={url}
              alt={caption || `Image ${index + 1}`}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </button>
        ))}
      </div>
      {caption && (
        <p className="text-sm text-muted-foreground italic">{caption}</p>
      )}
    </div>
  );
});

ImageGallery.displayName = 'ImageGallery';
