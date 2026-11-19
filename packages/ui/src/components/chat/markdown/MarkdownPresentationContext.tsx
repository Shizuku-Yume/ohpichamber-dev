import React from 'react';
import type { HighlightResult } from 'streamdown';
import type { Theme } from '@/types/theme';
import type { ToolPopupContent } from '../message/types';
import type { MarkdownCodePlugin } from './streamdownCode';

export type FileReferenceSource = 'path' | 'href';

export interface MermaidControls {
  download?: boolean;
  copy?: boolean;
  showPanZoomControls?: boolean;
  toolbarSlot?: HTMLElement | null;
}

export interface MarkdownPresentation {
  directory: string;
  fileReferences: boolean;
  fileNavigation: boolean;
  settled: boolean;
  loopbackPreview: boolean;
  purpose?: 'copy' | 'image';
  uiBlocks: boolean;
  svgFences: boolean;
  settledReply: { sessionId: string; messageId: string } | null;
  disableLinkSafety?: boolean;
<<<<<<< HEAD
  /** Names the document whose tables keep the column widths the user sets; absent, columns have no grips. */
||||||| bc50ba56aa
  /** What active extensions claim in this chat message; null outside chat messages and in copies. */
  guestLinks: readonly GuestLinkRule[] | null;
  /** Names the document whose tables keep the column widths the user sets; absent, columns have no grips. */
=======
  guestLinks: readonly GuestLinkRule[] | null;
>>>>>>> upstream/main
  tableWidthScope?: string;
  theme: Theme;
  mermaidControls: MermaidControls;
  onShowPopup?: (content: ToolPopupContent) => void;
  onExportCode?: (source: string, language: string) => void;
  preparedHighlights?: ReadonlyMap<string, ReadonlyMap<string, HighlightResult>>;
  confirmFile: (source: string, inputKind?: FileReferenceSource) => Promise<string | null>;
  code: MarkdownCodePlugin;
}

export const MarkdownSvgFailureContext = React.createContext<(() => void) | null>(null);

export const MarkdownPresentationContext = React.createContext<MarkdownPresentation | null>(null);
export function useMarkdownPresentation(): MarkdownPresentation {
  const value = React.useContext(MarkdownPresentationContext);
  if (!value) throw new Error('Markdown components require MarkdownContent');
  return value;
}
