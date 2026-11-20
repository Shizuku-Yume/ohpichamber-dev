
import React from 'react';
import { AnimatePresence } from 'motion/react';

import { EmojiAutocomplete, type EmojiAutocompleteHandle } from '@/components/emoji/EmojiAutocomplete';
import { CommandAutocomplete, type CommandAutocompleteHandle, type CommandInfo } from '../../CommandAutocomplete';
import { FileMentionAutocomplete, type FileMentionHandle } from '../../FileMentionAutocomplete';
import { SkillAutocomplete, type SkillAutocompleteHandle } from '../../SkillAutocomplete';
import type { AutocompleteKind } from '../language/triggers';
import { GlassPopupMotion } from './GlassPopupMotion';

export interface AutocompleteOverlayPosition {
 top: number;
 left: number;
 place: 'above' | 'below';
 maxHeight: number;
}

const CARET_PLACED_WIDTH: Record<AutocompleteKind, number> = {
 mention: 520,
 command: 450,
 skill: 360,
 emoji: 360,
};

function caretStyle(
 kind: AutocompleteKind,
 position: AutocompleteOverlayPosition | null,
): React.CSSProperties | undefined {
 if (!position) return undefined;
 return {
  left: `${position.left}px`,
  right: 'auto',
  top: `${position.top}px`,
  bottom: 'auto',
  width: `min(${CARET_PLACED_WIDTH[kind]}px, calc(100% - ${position.left + 8}px))`,
  maxHeight: `${position.maxHeight}px`,
  transform: position.place === 'above' ? 'translateY(-100%)' : undefined,
 };
}

interface ComposerAutocompletePopupsProps {
 /** Which picker is open, if any. */
 open: AutocompleteKind | null;
 query: string;
 /** Caret placement in focus mode; null when the picker anchors itself. */
 overlayPosition: AutocompleteOverlayPosition | null;
 commandRef: React.RefObject<CommandAutocompleteHandle | null>;
 skillRef: React.RefObject<SkillAutocompleteHandle | null>;
 mentionRef: React.RefObject<FileMentionHandle | null>;
 emojiRef: React.RefObject<EmojiAutocompleteHandle | null>;
 onCommandSelect: (command: CommandInfo) => void;
 onSkillSelect: (skillName: string) => void;
 onFileSelect: (file: { name: string; path: string; relativePath?: string }) => void;
 onEmojiSelect: (emoji: string) => void;
 onClose: () => void;
}
function ComposerAutocompletePopupsView(props: ComposerAutocompletePopupsProps) {
    const { open } = props;
    return (
        <AnimatePresence>
            {open ? (
                <GlassPopupMotion key={open} pace="brief" className="absolute inset-x-0 top-0 z-[100] h-0 origin-top-left rtl:origin-top-right">
                    <AutocompletePopup {...props} open={open} />
                </GlassPopupMotion>
            ) : null}
        </AnimatePresence>
    );
}

function AutocompletePopup(props: ComposerAutocompletePopupsProps & { open: AutocompleteKind }) {
 const { open, query, overlayPosition, onClose } = props;

 const style = caretStyle(open, overlayPosition);

 switch (open) {
  case 'command':
   return (
    <CommandAutocomplete
     ref={props.commandRef}
     searchQuery={query}
     onCommandSelect={props.onCommandSelect}
     onClose={onClose}
     style={style}
    />
   );
  case 'skill':
   return (
    <SkillAutocomplete
     ref={props.skillRef}
     searchQuery={query}
     onSkillSelect={props.onSkillSelect}
     onClose={onClose}
     style={style}
    />
   );
  case 'mention':
   return (
    <FileMentionAutocomplete
     ref={props.mentionRef}
     searchQuery={query}
     onFileSelect={props.onFileSelect}
     onClose={onClose}
     style={style}
    />
   );
  case 'emoji':
   return (
    <EmojiAutocomplete
     ref={props.emojiRef}
     searchQuery={query}
     onEmojiSelect={props.onEmojiSelect}
     onClose={onClose}
     style={style}
    />
   );
 }
}

export const ComposerAutocompletePopups = React.memo(ComposerAutocompletePopupsView);
