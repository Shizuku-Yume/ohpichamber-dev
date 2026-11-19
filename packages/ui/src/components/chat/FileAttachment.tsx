<<<<<<< HEAD
import { INLINE_SERVER_ATTACHMENT_ID_PREFIX } from './composer/attachments/inlineMentionAttachments';
import React, { useRef, memo } from 'react';
import type { AttachmentPart, Part } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { isCapacitorMobileApp } from '@/apps/mobileNativeChrome';
import { shareFileFromNativeApp } from '@/lib/nativeFileShare';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { useDraftAttachedFiles, useInputStore } from '@/sync/input-store';
import type { ChatDraftIdentity } from '@/lib/chatDraftPersistence';
import type { AttachedFile } from '@/sync/session-ui-store';
||||||| bc50ba56aa
import React, { useRef, memo } from 'react';
import { useDraftAttachedFiles, useInputStore } from '@/sync/input-store';
import type { ChatDraftIdentity } from '@/lib/chatDraftPersistence';
import type { AttachedFile } from '@/sync/session-ui-store';
=======
import React, { memo } from 'react';
import { useInputStore } from '@/sync/input-store';
>>>>>>> upstream/main
import { useUIStore } from '@/stores/useUIStore';
import { toast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/fileSize';
<<<<<<< HEAD
import { getLanguageFromExtension } from '@/lib/toolHelpers';
||||||| bc50ba56aa
import { getLanguageFromExtension, isDrawioFile, isExcalidrawFile } from '@/lib/toolHelpers';
import { trackerPresentation } from '@/lib/trackers/presentation';
import { decodeDataUrlText, getIssueLinkKind, getRepositoryIssueLinkProvider, getTrackerItemLinkProvider, isTextLikeFile, resolveAttachmentOpenTarget, type IssueLinkKind } from '@/lib/messages/attachmentPreview';
import { ProviderIcon } from '@/components/sourceControl/ProviderIcon';
import { useSourceControlProvider } from '@/lib/source-control/providers/registry';
import { useOpenAttachment } from './message/useOpenAttachment';
import { INLINE_SERVER_ATTACHMENT_ID_PREFIX } from './composer/attachments/inlineMentionAttachments';
=======
import { isDrawioFile, isExcalidrawFile } from '@/lib/toolHelpers';
import { trackerPresentation } from '@/lib/trackers/presentation';
import { getIssueLinkKind, getRepositoryIssueLinkProvider, getTrackerItemLinkProvider, resolveAttachmentOpenTarget, type IssueLinkKind } from '@/lib/messages/attachmentPreview';
import { ProviderIcon } from '@/components/sourceControl/ProviderIcon';
import { useSourceControlProvider } from '@/lib/source-control/providers/registry';
import { useOpenAttachment } from './message/useOpenAttachment';
>>>>>>> upstream/main
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import { Icon } from "@/components/icon/Icon";
import { useI18n } from '@/lib/i18n';

import type { ToolPopupContent } from './message/types';
import { problemMessage } from '@/lib/problemMessage';

<<<<<<< HEAD
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
    file.dataUrl?.startsWith('data:image/');

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
      className="relative h-16 w-16 rounded-lg border border-edge bg-background overflow-hidden flex-shrink-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={displayName}
    >
      <img
        src={imageUrl}
        alt={displayName}
        className="h-full w-full object-cover"
        loading="lazy"
      />
      <button
        type="button"
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
      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-edge bg-background pl-2 pr-1 text-xs text-foreground text-left hover:opacity-90 transition-opacity"
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

  const localFiles = attachedFiles.filter((file) => file.source !== 'server' && !file.id.startsWith(INLINE_SERVER_ATTACHMENT_ID_PREFIX));

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
||||||| bc50ba56aa
const FileAttachmentButton = memo(() => {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addAttachedFile = useInputStore((state) => state.addAttachedFile);
  const isMobile = useUIStore((state) => state.isMobile);
  const runtimeApis = useRuntimeAPIs();
  const isVSCodeRuntime = runtimeApis.runtime.isVSCode;
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

  const handleVSCodePick = async () => {
    try {
      const data = (await runtimeApis.vscode?.pickFiles?.()) as {
        files?: Array<{ name: string; mimeType?: string; dataUrl?: string }>;
        skipped?: Array<{ name?: string; reason?: string }>;
      } | undefined;
      const picked = Array.isArray(data?.files) ? data.files : [];
      const skipped = Array.isArray(data?.skipped) ? data.skipped : [];

      if (skipped.length > 0) {
        const summary = skipped.map((s: { name?: string; reason?: string }) => `${s?.name || t('chat.fileAttachment.fileFallback')}: ${s?.reason || t('chat.fileAttachment.skippedFallback')}`).join('\n');
        toast.error(t('chat.fileAttachment.toast.someFilesSkipped', { summary }));
      }

      const asFiles = picked
        .map((file: { name: string; mimeType?: string; dataUrl?: string }) => {
          if (!file?.dataUrl) return null;
          try {
            const [meta, base64] = file.dataUrl.split(',');
            const mime = file.mimeType || (meta?.match(/data:(.*);base64/)?.[1] || 'application/octet-stream');
            if (!base64) return null;
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: mime });
            return new File([blob], file.name || t('chat.fileAttachment.fileFallback'), { type: mime });
          } catch (err) {
            console.error('Failed to decode VS Code picked file', err);
            return null;
          }
        })
        .filter(Boolean) as File[];

      if (asFiles.length > 0) {
        await attachFiles(asFiles);
      }
    } catch (error) {
      console.error('VS Code file pick failed', error);
      toast.error(error instanceof Error ? error.message : t('chat.fileAttachment.toast.vscodePickFailed'));
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
            onClick={isVSCodeRuntime ? handleVSCodePick : () => fileInputRef.current?.click()}
            className={cn(
              'flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'hover:bg-interactive-hover text-muted-foreground',
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
      metadata: {
        tool: 'image-preview',
        filename: displayName,
        mime: file.mimeType,
        size: file.size,
      },
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
        className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity text-start h-5"
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
      className="relative h-16 w-16 rounded-lg border border-edge bg-background overflow-hidden flex-shrink-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={displayName}
    >
      <StatusImage
        src={imageUrl}
        alt={displayName}
        variant="thumbnail"
        className="h-full w-full"
        imgClassName="h-full w-full object-cover"
        lazy
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className="absolute top-1 inset-e-1 h-5 w-5 rounded-md bg-background/80 text-foreground hover:bg-background flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            // Inline: the mobile stylesheet floors every button at 36px, which
            // would swallow a 64px thumbnail; the thumbnail itself is the target.
            style={{ width: 20, height: 20, minWidth: 0, minHeight: 0 }}
            aria-label={t('chat.fileAttachment.actions.removeNamed', { name: displayName })}
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>{t('chat.fileAttachment.actions.removeImage')}</TooltipContent>
      </Tooltip>
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
      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-edge bg-background ps-2 pe-1 text-xs text-foreground text-start hover:opacity-90 transition-opacity"
    >
      <FileTypeIcon filePath={file.filename} extension={extension} className="h-4 w-4 flex-shrink-0" />
      <span className="truncate max-w-[200px]" title={displayName}>{displayName}</span>
      {fileSize && <span className="text-muted-foreground flex-shrink-0">{fileSize}</span>}
      <Tooltip>
        <TooltipTrigger asChild>
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
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>{t('chat.fileAttachment.actions.removeNamed', { name: displayName })}</TooltipContent>
      </Tooltip>
    </button>
  );
});

FileChip.displayName = 'FileChip';

const VSCodeFileChip = memo(({ file, onRemove }: FileChipProps) => {
  const { t } = useI18n();
  const { displayName, extension } = useFileDetails(file);

  // Detect selection-style attachments: ends with ":N" or ":N-M"
  const isSelectionAttachment = /:\d+(?:-\d+)?$/.test(displayName);

  return (
    <button
      type="button"
      onClick={(e) => {
        // Prevent click from bubbling if clicking the remove button
        if ((e.target as HTMLElement).closest('[data-remove-button]')) {
          return;
        }
      }}
      className="inline-flex items-center gap-1 text-xs pe-1 rounded-sm border border-solid bg-transparent text-foreground not-italic hover:opacity-90 transition-colors text-start"
      style={{ borderColor: 'var(--interactive-border)' }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-remove-button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="flex items-center justify-center h-5 w-5 flex-shrink-0 hover:bg-[var(--interactive-hover)] rounded-full transition-colors cursor-pointer"
            aria-label={t('chat.fileAttachment.activeEditor.remove')}
          >
            <Icon name="close" className="h-4 w-4 text-muted-foreground" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>{t('chat.fileAttachment.activeEditor.remove')}</TooltipContent>
      </Tooltip>
        <FileTypeIcon filePath={file.filename} extension={extension} className="h-4 w-4" />
        <span className={cn('text-foreground', isSelectionAttachment ? 'whitespace-nowrap' : 'truncate max-w-[200px]')} title={file.vscodePath}>
          {displayName}
        </span>
    </button>
  );
});

VSCodeFileChip.displayName = 'VSCodeFileChip';

interface AttachedFilesListProps {
  onShowPopup?: (content: ToolPopupContent) => void;
  className?: string;
  /** The composer draft whose files to show; its own even while another composer holds the slot. */
  draftIdentity?: ChatDraftIdentity | null;
}

export const AttachedVSCodeFileChips = memo(({ onShowPopup, draftIdentity }: AttachedFilesListProps) => {
  const attachedFiles = useDraftAttachedFiles(draftIdentity);
  const removeAttachedFile = useInputStore((state) => state.removeAttachedFile);

  const vscodeFiles = attachedFiles.filter((file) => file.source === 'vscode');

  if (vscodeFiles.length === 0) return null;

  const images = vscodeFiles.filter((f) => f.mimeType.startsWith('image/'));
  const otherFiles = vscodeFiles.filter((f) => !f.mimeType.startsWith('image/'));
  const imageGallery = images.map((file) => ({
    url: file.dataUrl || file.serverPath || '',
    mimeType: file.mimeType,
    filename: file.filename,
    size: file.size,
  })).filter((image) => image.url);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {images.map((file, index) => (
        <ImagePreview key={file.id} file={file} onRemove={() => removeAttachedFile(file.id)} onShowPopup={onShowPopup} gallery={imageGallery} index={index} />
      ))}
      {otherFiles.map((file) => (
        <VSCodeFileChip key={file.id} file={file} onRemove={() => removeAttachedFile(file.id)} />
      ))}
    </div>
  );
});

AttachedVSCodeFileChips.displayName = 'AttachedVSCodeFileChips';

export const AttachedFilesList = memo(({ onShowPopup, className, draftIdentity }: AttachedFilesListProps) => {
  const attachedFiles = useDraftAttachedFiles(draftIdentity);
  const removeAttachedFile = useInputStore((state) => state.removeAttachedFile);

  // An @-mention a failed send put back is shown by its mention in the text,
  // which decides whether it goes.
  const files = attachedFiles.filter((file) => file.source !== 'vscode'
    && !file.id.startsWith(INLINE_SERVER_ATTACHMENT_ID_PREFIX));

  if (files.length === 0) return null;

  const images = files.filter((f) => f.mimeType.startsWith('image/'));
  const otherFiles = files.filter((f) => !f.mimeType.startsWith('image/'));
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
=======
>>>>>>> upstream/main

type AttachmentImageState =
  | { kind: 'loading' }
  | { kind: 'ready'; url: string }
  | { kind: 'failed' };

const NativeAttachmentThumbnail = memo(({ part, workspaceId, runtimeKey, compact, onReady, onOpen }: {
  part: AttachmentPart;
  workspaceId: string | undefined;
  runtimeKey: string;
  compact: boolean;
  onReady: (attachmentId: string, url: string | null) => void;
  onOpen: () => void;
}) => {
  const { t } = useI18n();
  const [state, setState] = React.useState<AttachmentImageState>({ kind: 'loading' });
  const objectUrlRef = React.useRef<string | null>(null);
  const sizeText = formatFileSize(part.size);

<<<<<<< HEAD
  const fail = React.useCallback(() => {
    const url = objectUrlRef.current;
    objectUrlRef.current = null;
    if (url) {
      onReady(part.attachmentId, null);
      URL.revokeObjectURL(url);
||||||| bc50ba56aa
  if (!isVSCodeRuntime || !activeEditorFile) return null;

  const { filePath, fileName, relativePath, selection, fileSize } = activeEditorFile;

  // Normalize to forward slashes for comparison
  const isFileAttached = attachedFiles.some(
    (f) => f.source === 'vscode' && f.vscodeSource === 'file' && (f.vscodePath || '') === filePath
  )

  // Compute selection label using a compact range (single line shown as "N" not "N-N")
  let selectionRange = ''
  if (selection) {
    selectionRange = selection.startLine === selection.endLine
      ? `${selection.startLine}`
      : `${selection.startLine}-${selection.endLine}`
  }
  const selectionLabel = selection ? `${relativePath}:${selectionRange}` : ''
  const isSelectionAttached = !!selectionLabel && attachedFiles.some(
    (f) => f.source === 'vscode' && f.vscodeSource === 'selection' && f.filename === selectionLabel && f.vscodePath === filePath
  )

  // Nothing to show — file is already attached and there's no (or already-attached) selection
  if (isFileAttached && (!selection || isSelectionAttached)) return null;

  const ext = fileName.split('.').pop() || '';
  // Always show only the filename in the suggestion UI
  const displayName = fileName;

  const handleAddFile = () => {
    try {
      addVSCodeFileAttachment(filePath, fileName, fileSize);
    } catch (error) {
      // The store names the cause (a file too large to send).
      if (error instanceof Error) toast.error(error.message);
=======
  if (!isVSCodeRuntime || !activeEditorFile) return null;

  const { filePath, fileName, relativePath, selection, fileSize } = activeEditorFile;

  const isFileAttached = attachedFiles.some(
    (f) => f.source === 'vscode' && f.vscodeSource === 'file' && (f.vscodePath || '') === filePath
  )

  let selectionRange = ''
  if (selection) {
    selectionRange = selection.startLine === selection.endLine
      ? `${selection.startLine}`
      : `${selection.startLine}-${selection.endLine}`
  }
  const selectionLabel = selection ? `${relativePath}:${selectionRange}` : ''
  const isSelectionAttached = !!selectionLabel && attachedFiles.some(
    (f) => f.source === 'vscode' && f.vscodeSource === 'selection' && f.filename === selectionLabel && f.vscodePath === filePath
  )

  if (isFileAttached && (!selection || isSelectionAttached)) return null;

  const ext = fileName.split('.').pop() || '';
  const displayName = fileName;

  const handleAddFile = () => {
    try {
      addVSCodeFileAttachment(filePath, fileName, fileSize);
    } catch (error) {
      if (error instanceof Error) toast.error(error.message);
>>>>>>> upstream/main
    }
    setState({ kind: 'failed' });
  }, [onReady, part.attachmentId]);

  React.useEffect(() => {
    if (!workspaceId) {
      setState({ kind: 'failed' });
      return;
    }
    let active = true;
    setState({ kind: 'loading' });
    void canonicalClient.readAttachment(workspaceId, part.attachmentId).then((blob) => {
      if (!active || getRuntimeKey() !== runtimeKey) return;
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setState({ kind: 'ready', url });
      onReady(part.attachmentId, url);
    }).catch(() => {
      if (active && getRuntimeKey() === runtimeKey) setState({ kind: 'failed' });
    });
    return () => {
      active = false;
      const url = objectUrlRef.current;
      objectUrlRef.current = null;
      if (url) {
        onReady(part.attachmentId, null);
        URL.revokeObjectURL(url);
      }
    };
  }, [workspaceId, runtimeKey, part.attachmentId, onReady]);

<<<<<<< HEAD
  const failed = state.kind === 'failed';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={part.name}
          disabled={state.kind !== 'ready'}
          onClick={onOpen}
          title={failed ? t('filesView.error.readFileFailed') : undefined}
          className={cn(
            'relative overflow-hidden border border-border/40 bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring',
            compact
              ? 'flex-none snap-start h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 rounded-lg'
              : 'group aspect-video w-full rounded-lg',
          )}
        >
          {state.kind === 'ready' ? (
            <img
              src={state.url}
              alt={part.name}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={fail}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-muted/30 text-muted-foreground">
              <Icon name="file-image" className="h-6 w-6" />
            </span>
          )}
          {!compact && state.kind === 'ready' && (
            <>
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--surface-foreground)]/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 p-2 text-left text-[var(--surface-background)] opacity-0 transition-opacity group-hover:opacity-100">
                <span className="block truncate text-xs font-medium">{part.name}</span>
                {sizeText && <span className="block text-xs opacity-80">{sizeText}</span>}
              </span>
            </>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="typography-meta px-2 py-1">
        {failed ? t('filesView.error.readFileFailed') : `${part.name}${sizeText ? ` (${sizeText})` : ''}`}
      </TooltipContent>
    </Tooltip>
  );
});
||||||| bc50ba56aa
  // If there is a selection, prefer showing the pin-selection UI only.
  const showSelectionPin = !!selection && !isSelectionAttached;
  const showFileAdd = !showSelectionPin && !isFileAttached;
=======
  const showSelectionPin = !!selection && !isSelectionAttached;
  const showFileAdd = !showSelectionPin && !isFileAttached;
>>>>>>> upstream/main

NativeAttachmentThumbnail.displayName = 'NativeAttachmentThumbnail';

const NativeAttachmentChip = memo(({ part, compact, onOpen, onDownload }: {
  part: AttachmentPart;
  compact: boolean;
  onOpen: (part: AttachmentPart) => void;
  onDownload: (part: AttachmentPart) => void;
}) => {
  const { t } = useI18n();
  const sizeText = formatFileSize(part.size);
  const downloadLabel = t('sidebarFilesTree.menu.download');
  const extension = part.name.split('.').pop() || '';
  const isPdf = part.mediaType.includes('pdf');

  if (compact) {
    return (
      <div className="inline-flex max-w-full items-stretch overflow-hidden rounded-lg border border-border/30 bg-muted/30 typography-meta">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onOpen(part)}
              className="inline-flex min-w-0 items-center gap-1 px-2 py-0.5 text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring"
            >
              {isPdf ? (
                <Icon name="file-pdf" className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <FileTypeIcon filePath={part.name} extension={extension} className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="block max-w-[140px] truncate" title={part.name}>{part.name}</span>
              {sizeText && <span className="shrink-0 text-muted-foreground">{sizeText}</span>}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{part.name}{sizeText ? ` (${sizeText})` : ''}</p>
          </TooltipContent>
        </Tooltip>
        <button
          type="button"
          onClick={() => onDownload(part)}
          aria-label={downloadLabel}
          title={downloadLabel}
          className="flex w-5 shrink-0 items-center justify-center border-l border-border/30 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <Icon name="download" className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/10 text-left text-sm transition-colors hover:bg-muted/20">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onOpen(part)}
            className="flex min-w-0 flex-1 items-center gap-2 p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring"
          >
            <span className="flex-shrink-0">
              {isPdf ? (
                <Icon name="file-pdf" className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Icon name="file" className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{part.name}</span>
              {sizeText && <span className="block text-xs text-muted-foreground">{sizeText}</span>}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{part.name}{sizeText ? ` (${sizeText})` : ''}</p>
        </TooltipContent>
      </Tooltip>
      <button
        type="button"
        onClick={() => onDownload(part)}
        aria-label={downloadLabel}
        title={downloadLabel}
        className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon name="download" className="h-4 w-4" />
      </button>
    </div>
  );
});

<<<<<<< HEAD
NativeAttachmentChip.displayName = 'NativeAttachmentChip';
||||||| bc50ba56aa
ActiveEditorFileSuggestion.displayName = 'ActiveEditorFileSuggestion';

interface FilePart {
  type: string;
  mime?: string;
  url?: string;
  filename?: string;
  size?: number;
  source?: Record<string, unknown>;
}

const issueLinkIcon = (kind: Exclude<IssueLinkKind, 'repository-issue' | 'tracker-item'>): 'git-pull-request' | 'attachment-2' => (
  kind === 'guest-issue' ? 'attachment-2' : 'git-pull-request'
);

/** An issue or PR link chip's mark: a repository issue wears its provider's, a tracker item its tracker's. */
const IssueLinkIcon: React.FC<{ file: { mime?: string }; kind: IssueLinkKind; className?: string }> = ({ file, kind, className }) => {
  const provider = useSourceControlProvider(getRepositoryIssueLinkProvider(file));
  if (kind === 'repository-issue') return <ProviderIcon descriptor={provider} className={className} />;
  if (kind === 'tracker-item') return <Icon name={trackerPresentation(getTrackerItemLinkProvider(file)).icon} className={className} />;
  return <Icon name={issueLinkIcon(kind)} className={className} />;
};
=======
ActiveEditorFileSuggestion.displayName = 'ActiveEditorFileSuggestion';

interface FilePart {
  type: string;
  mime?: string;
  url?: string;
  filename?: string;
  size?: number;
  source?: Record<string, unknown>;
}

const issueLinkIcon = (kind: Exclude<IssueLinkKind, 'repository-issue' | 'tracker-item'>): 'git-pull-request' | 'attachment-2' => (
  kind === 'guest-issue' ? 'attachment-2' : 'git-pull-request'
);

const IssueLinkIcon: React.FC<{ file: { mime?: string }; kind: IssueLinkKind; className?: string }> = ({ file, kind, className }) => {
  const provider = useSourceControlProvider(getRepositoryIssueLinkProvider(file));
  if (kind === 'repository-issue') return <ProviderIcon descriptor={provider} className={className} />;
  if (kind === 'tracker-item') return <Icon name={trackerPresentation(getTrackerItemLinkProvider(file)).icon} className={className} />;
  return <Icon name={issueLinkIcon(kind)} className={className} />;
};
>>>>>>> upstream/main

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
  const scopeRef = React.useRef(scope);
  scopeRef.current = scope;
  const [images, setImages] = React.useState<{ scope: string; urls: Map<string, string> }>(() => ({ scope, urls: new Map() }));
  const popupUrl = React.useRef<{ attachmentId: string; url: string } | null>(null);
  const clearPopupUrl = React.useCallback(() => {
    if (popupUrl.current) URL.revokeObjectURL(popupUrl.current.url);
    popupUrl.current = null;
  }, []);
<<<<<<< HEAD
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
||||||| bc50ba56aa

  const imageFiles = fileItems.filter(f => f.mime?.startsWith('image/') && f.url);
  const otherFiles = fileItems.filter(f => !f.mime?.startsWith('image/'));

  // What a compact chip or thumbnail opens; a preview needs the message's popup.
  const resolveOpenTarget = (file: FilePart) => {
    const target = resolveAttachmentOpenTarget(file, fileItems);
    return target?.kind === 'popup' && !onShowPopup ? null : target;
=======


  const resolveOpenTarget = (file: FilePart) => {
    const target = resolveAttachmentOpenTarget(file, fileItems);
    return target?.kind === 'popup' && !onShowPopup ? null : target;
>>>>>>> upstream/main
  };
  const showFilePopup = async (part: AttachmentPart) => {
    if (!onShowPopup) return;
    if (!workspaceId) {
      toast.error(t('filesView.error.readFileFailed'));
      return;
    }
<<<<<<< HEAD
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
    } catch (error) {
      if (current()) toast.error(problemMessage(error, t('filesView.error.readFileFailed')));
||||||| bc50ba56aa

    if (isTextLikeFile(file)) {
      const text = decodeDataUrlText(file.url);
      if (text !== null) {
        onShowPopup({
          open: true,
          title: fileName,
          content: text,
          language: getLanguageFromExtension(fileName) || undefined,
        });
        return;
      }
=======

    const target = resolveAttachmentOpenTarget(file, [file]);
    if (target?.kind === 'popup' && !target.popup.image) {
      onShowPopup({ ...target.popup, title: fileName });
      return;
>>>>>>> upstream/main
    }
  };
  const downloadAttachment = React.useCallback(async (part: AttachmentPart) => {
    if (!workspaceId) {
      toast.error(t('filesView.error.readFileFailed'));
      return;
    }
    const requestScope = scope;
    const current = () => scopeRef.current === requestScope && getRuntimeKey() === runtimeKey
      && currentFiles.current.some((item) => item.type === 'attachment' && item.attachmentId === part.attachmentId);
    let url: string | null = null;
    try {
      const blob = await canonicalClient.readAttachment(workspaceId, part.attachmentId);
      if (!current()) return;
      if (isCapacitorMobileApp()) {
        await shareFileFromNativeApp(new File([blob], part.name, { type: part.mediaType || blob.type || 'application/octet-stream' }));
        return;
      }
      url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = part.name;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      if (current()) toast.error(problemMessage(error, t('filesView.toast.saveFailed')));
    } finally {
      const createdUrl = url;
      if (createdUrl) setTimeout(() => URL.revokeObjectURL(createdUrl), 0);
    }
  }, [scope, runtimeKey, t, workspaceId]);
  if (attachments.length === 0) return null;

  const renderThumbnail = (part: AttachmentPart) => (
    <NativeAttachmentThumbnail
      key={`${scope}:${part.partId}`}
      part={part}
      workspaceId={workspaceId}
      runtimeKey={runtimeKey}
      compact={compact}
      onReady={onImageReady}
      onOpen={() => openImage(part.attachmentId)}
    />
  );
  const renderChip = (part: AttachmentPart) => (
    <NativeAttachmentChip
      key={`${scope}:${part.partId}`}
      part={part}
      compact={compact}
      onOpen={(file) => { void showFilePopup(file); }}
      onDownload={(file) => { void downloadAttachment(file); }}
    />
  );

  if (compact) {
<<<<<<< HEAD
    const imageAttachments = attachments.filter((part) => part.mediaType.startsWith('image/'));
    const fileAttachments = attachments.filter((part) => !part.mediaType.startsWith('image/'));
||||||| bc50ba56aa
=======
    const tileClass = 'relative flex-none snap-start h-16 rounded-lg overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring';
>>>>>>> upstream/main
    return (
<<<<<<< HEAD
      <div className={cn('space-y-1.5', className ?? 'mt-1.5')}>
        {fileAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {fileAttachments.map(renderChip)}
          </div>
        )}
        {imageAttachments.length > 0 && (
          <div className="overflow-x-auto -mx-1 px-1 py-0.5 scrollbar-thin">
            <div className="flex snap-x snap-mandatory gap-2">
              {imageAttachments.map(renderThumbnail)}
            </div>
          </div>
        )}
      </div>
||||||| bc50ba56aa
      <div className={cn('space-y-1.5', className ?? 'mt-1.5')}>
        {otherFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {otherFiles.map((file, index) => {
              const fileName = resolveDisplayName(file);
              const ext = fileName.split('.').pop() || '';
              const sizeText = formatFileSize(file.size);
              const issueLinkKind = getIssueLinkKind(file);
              const openTarget = resolveOpenTarget(file);
              return (
                <Tooltip key={`file-${file.url || file.filename || index}`}>
                  <TooltipTrigger asChild>
                    {issueLinkKind && openTarget ? (
                      <button
                        type="button"
                        onClick={() => openAttachment(openTarget)}
                        className="inline-flex items-center bg-muted/30 border border-edge-muted typography-meta gap-1 px-2 py-0.5 rounded-lg text-foreground hover:text-primary transition-colors"
                      >
                        <IssueLinkIcon file={file} kind={issueLinkKind} className="text-muted-foreground h-3.5 w-3.5" />
                        <div className="overflow-hidden max-w-[220px]">
                          <span className="truncate block">{fileName}</span>
                        </div>
                      </button>
                    ) : openTarget ? (
                      <button
                        type="button"
                        onClick={() => openAttachment(openTarget)}
                        className="inline-flex items-center bg-muted/30 border border-edge-muted typography-meta gap-1 px-2 py-0.5 rounded-lg text-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring"
                      >
                        <FileTypeIcon filePath={fileName} extension={ext} className="text-muted-foreground h-3.5 w-3.5" />
                        <div className="overflow-hidden max-w-[140px]">
                          <span className="truncate block">{fileName}</span>
                        </div>
                      </button>
                    ) : (
                      <div className="inline-flex items-center bg-muted/30 border border-edge-muted typography-meta gap-1 px-2 py-0.5 rounded-lg">
                        {file.mime?.includes('pdf') ? (
                          <Icon name="file-pdf" className="text-muted-foreground h-3.5 w-3.5" />
                        ) : (
                          <FileTypeIcon filePath={fileName} extension={ext} className="text-muted-foreground h-3.5 w-3.5" />
                        )}
                        <div className="overflow-hidden max-w-[140px]">
                          <span className="truncate block">{fileName}</span>
                        </div>
                      </div>
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{fileName}{sizeText ? ` (${sizeText})` : ''}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}

        {imageFiles.length > 0 && (
          <ScrollableOverlay outerClassName="overlay-scrollbar-wrapper--no-gutter -mx-1 w-auto" className="px-1 py-0.5" fillContainer={false}>
            <div className="flex snap-x snap-mandatory gap-2">
              {imageFiles.map((file, index) => {
                const filename = resolveDisplayName(file) || 'Image';
                const openTarget = resolveOpenTarget(file);

                return (
                  <Tooltip key={`img-${file.url || file.filename || index}`}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          if (openTarget) openAttachment(openTarget);
                        }}
                        className="relative flex-none border border-edge-muted bg-muted/10 overflow-hidden snap-start h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring"
                        aria-label={filename}
                      >
                        {file.url ? (
                          <StatusImage
                            src={file.url}
                            alt={filename}
                            variant="thumbnail"
                            className="h-full w-full"
                            imgClassName="h-full w-full object-cover"
                            lazy
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-muted/30 text-muted-foreground">
                            <Icon name="file-image" className="h-6 w-6" />
                          </div>
                        )}
                        <span className="sr-only">{filename}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6} className="typography-meta px-2 py-1">
                      {filename}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </ScrollableOverlay>
        )}
      </div>
=======
      <ScrollableOverlay outerClassName={cn('overlay-scrollbar-wrapper--no-gutter -mx-1 w-auto', className ?? 'mt-1.5')} className="px-1 py-0.5" fillContainer={false}>
        <div className="flex snap-x snap-mandatory gap-1.5">
          {fileItems.map((file, index) => {
            const fileName = resolveDisplayName(file) || 'File';
            const openTarget = resolveOpenTarget(file);
            const issueLinkKind = getIssueLinkKind(file);
            const isImage = Boolean(file.mime?.startsWith('image/') && file.url) && !issueLinkKind;
            const sizeText = formatFileSize(file.size);
            const ext = fileName.includes('.') ? fileName.split('.').pop() ?? '' : '';
            const kindText = [issueLinkKind ? null : ext.toUpperCase() || null, sizeText || null].filter(Boolean).join(' · ');
            const open = openTarget
              ? (event: React.MouseEvent) => openAttachment(openTarget, issueLinkKind ? event : undefined)
              : undefined;
            return (
              <Tooltip key={`attachment-${file.url || file.filename || index}`}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={open}
                    disabled={!open}
                    aria-label={fileName}
                    className={cn(tileClass, isImage
                      ? 'w-16 bg-muted/10 cursor-zoom-in'
                      : 'oc-tile flex w-36 flex-col justify-between px-2 py-1 text-start enabled:hover:text-foreground disabled:cursor-default')}
                  >
                    {isImage && file.url ? (
                      <StatusImage
                        src={file.url}
                        alt={fileName}
                        variant="thumbnail"
                        className="absolute inset-0 h-full w-full"
                        imgClassName="h-full w-full object-cover"
                        lazy
                      />
                    ) : (
                      <>
                        <span dir="auto" className="line-clamp-2 [overflow-wrap:anywhere] typography-meta leading-tight text-foreground">{fileName}</span>
                        <span className="flex min-w-0 items-center gap-1">
                          {issueLinkKind ? (
                            <IssueLinkIcon file={file} kind={issueLinkKind} className="h-3 w-3 shrink-0 text-muted-foreground" />
                          ) : (
                            <FileTypeIcon filePath={fileName} extension={ext} className="h-3 w-3 shrink-0" />
                          )}
                          {kindText ? <span className="min-w-0 truncate typography-micro text-muted-foreground">{kindText}</span> : null}
                        </span>
                      </>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6} className="typography-meta px-2 py-1">
                  {fileName}{sizeText ? ` (${sizeText})` : ''}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </ScrollableOverlay>
>>>>>>> upstream/main
    );
  }

  return (
<<<<<<< HEAD
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-2', className)}>
      {attachments.map((part) => (
        part.mediaType.startsWith('image/') ? renderThumbnail(part) : renderChip(part)
      ))}
||||||| bc50ba56aa
    <div className={cn(
      "grid gap-2",
      compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
    )}>
      {fileItems.map((file, index) => {
        const fileName = resolveDisplayName(file);
        const isImage = file.mime?.startsWith('image/');
        const sizeText = formatFileSize(file.size);
        const issueLinkKind = getIssueLinkKind(file);

        if (isImage && file.url) {
          return (
            <div
              key={file.url || `${fileName}-${index}`}
              className="relative aspect-video rounded-lg border border-edge-muted bg-muted/10 overflow-hidden group"
            >
              <StatusImage
                src={file.url}
                alt={fileName}
                variant="thumbnail"
                className="h-full w-full"
                imgClassName="h-full w-full object-cover"
                lazy
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-0 inset-s-0 inset-e-0 p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-xs font-medium truncate">{fileName}</p>
                {sizeText && <p className="text-xs opacity-80">{sizeText}</p>}
              </div>
            </div>
          );
        }

        if (issueLinkKind && file.url) {
          return (
            <Tooltip key={file.url || `${fileName}-${index}`}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    void openExternalUrl(file.url || '');
                  }}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg oc-tile oc-tile-hover text-start",
                    compact ? "text-xs" : "text-sm"
                  )}
                >
                  <div className="flex-shrink-0">
                    <IssueLinkIcon file={file} kind={issueLinkKind} className={cn("text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{fileName}</p>
                    {sizeText && <p className="text-xs text-muted-foreground">{sizeText}</p>}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{fileName}{sizeText ? ` (${sizeText})` : ''}</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        const source = file.source;
        const sourceType = typeof source?.type === 'string' ? source.type : undefined;
        const sourcePath = source && typeof (source as Record<string, unknown>).path === 'string' ? (source as Record<string, unknown>).path as string : undefined;
        const filePath = sourceType === 'file' && sourcePath ? sourcePath : (file.url || '');
        const opensInDiagramEditor = filePath && (isDrawioFile(filePath) || isExcalidrawFile(filePath));

        if (opensInDiagramEditor) {
          return (
            <Tooltip key={file.url || `${fileName}-${index}`}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    const directory = useDirectoryStore.getState().currentDirectory;
                    if (directory) {
                      useUIStore.getState().openContextFile(directory, filePath);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg oc-tile oc-tile-hover text-start cursor-pointer",
                    compact ? "text-xs" : "text-sm"
                  )}
                >
                  <Icon name="file" className={cn("text-muted-foreground shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{fileName}</p>
                    <p className="text-xs text-status-info">{t('chat.fileAttachment.openInDiagram')}</p>
                  </div>
                  <Icon name="external-link" className={cn("text-muted-foreground shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('chat.fileAttachment.openInDiagram')}</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        return (
          <Tooltip key={file.url || `${fileName}-${index}`}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  showFilePopup(file, fileName);
                }}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-lg oc-tile oc-tile-hover text-start",
                  compact ? "text-xs" : "text-sm"
                )}
              >
                <div className="flex-shrink-0">
                  {file.mime?.startsWith('image/') ? (
                    <Icon name="file-image" className={cn("text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  ) : file.mime?.includes('pdf') ? (
                    <Icon name="file-pdf" className={cn("text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  ) : (
                    <Icon name="file" className={cn("text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{fileName}</p>
                  {sizeText && <p className="text-xs text-muted-foreground">{sizeText}</p>}
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{fileName}{sizeText ? ` (${sizeText})` : ''}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
=======
    <div className={cn(
      "grid gap-2",
      compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
    )}>
      {fileItems.map((file, index) => {
        const fileName = resolveDisplayName(file);
        const isImage = file.mime?.startsWith('image/');
        const sizeText = formatFileSize(file.size);
        const issueLinkKind = getIssueLinkKind(file);

        if (isImage && file.url) {
          return (
            <div
              key={file.url || `${fileName}-${index}`}
              className="relative aspect-video rounded-lg border border-edge-muted bg-muted/10 overflow-hidden group"
            >
              <StatusImage
                src={file.url}
                alt={fileName}
                variant="thumbnail"
                className="h-full w-full"
                imgClassName="h-full w-full object-cover"
                lazy
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-0 inset-s-0 inset-e-0 p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-xs font-medium truncate">{fileName}</p>
                {sizeText && <p className="text-xs opacity-80">{sizeText}</p>}
              </div>
            </div>
          );
        }

        if (issueLinkKind && file.url) {
          const issueUrl = file.url;
          return (
            <Tooltip key={file.url || `${fileName}-${index}`}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(event) => openAttachment({ kind: 'external', url: issueUrl }, event)}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg oc-tile oc-tile-hover text-start",
                    compact ? "text-xs" : "text-sm"
                  )}
                >
                  <div className="flex-shrink-0">
                    <IssueLinkIcon file={file} kind={issueLinkKind} className={cn("text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{fileName}</p>
                    {sizeText && <p className="text-xs text-muted-foreground">{sizeText}</p>}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{fileName}{sizeText ? ` (${sizeText})` : ''}</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        const source = file.source;
        const sourceType = typeof source?.type === 'string' ? source.type : undefined;
        const sourcePath = source && typeof (source as Record<string, unknown>).path === 'string' ? (source as Record<string, unknown>).path as string : undefined;
        const filePath = sourceType === 'file' && sourcePath ? sourcePath : (file.url || '');
        const opensInDiagramEditor = filePath && (isDrawioFile(filePath) || isExcalidrawFile(filePath));

        if (opensInDiagramEditor) {
          return (
            <Tooltip key={file.url || `${fileName}-${index}`}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    const directory = useDirectoryStore.getState().currentDirectory;
                    if (directory) {
                      useUIStore.getState().openContextFile(directory, filePath);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg oc-tile oc-tile-hover text-start cursor-pointer",
                    compact ? "text-xs" : "text-sm"
                  )}
                >
                  <Icon name="file" className={cn("text-muted-foreground shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{fileName}</p>
                    <p className="text-xs text-status-info">{t('chat.fileAttachment.openInDiagram')}</p>
                  </div>
                  <Icon name="external-link" className={cn("text-muted-foreground shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('chat.fileAttachment.openInDiagram')}</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        return (
          <Tooltip key={file.url || `${fileName}-${index}`}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  showFilePopup(file, fileName);
                }}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-lg oc-tile oc-tile-hover text-start",
                  compact ? "text-xs" : "text-sm"
                )}
              >
                <div className="flex-shrink-0">
                  {file.mime?.startsWith('image/') ? (
                    <Icon name="file-image" className={cn("text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  ) : file.mime?.includes('pdf') ? (
                    <Icon name="file-pdf" className={cn("text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  ) : (
                    <Icon name="file" className={cn("text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{fileName}</p>
                  {sizeText && <p className="text-xs text-muted-foreground">{sizeText}</p>}
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{fileName}{sizeText ? ` (${sizeText})` : ''}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
>>>>>>> upstream/main
    </div>
  );
});

MessageFilesDisplay.displayName = 'MessageFilesDisplay';
