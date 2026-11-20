import React from 'react';

import { useDeviceInfo } from '@/lib/device';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';
import { turnHeaderCanStick } from '../lib/turns/stickyPrompt';
import type { ChatMessageEntry, Turn } from '../lib/turns/types';

interface TurnItemProps {
 turn: Turn;
 renderMessage: (message: ChatMessageEntry) => React.ReactNode;
 /** The list's own sticky-header decision for this turn; the stored setting when absent. */
 stickyUserHeader?: boolean;
 /** Keeps the gap between the turn and the row after it, when the turn is nothing but its prompt. */
 gapBelow?: boolean;
}

const stickyHeaderBackground = (fadeRem: string): React.CSSProperties => ({
 backgroundImage:
  `linear-gradient(to bottom, var(--surface-background) calc(100% - ${fadeRem}), transparent)`,
});
const STICKY_HEADER_BACKGROUND_DESKTOP = stickyHeaderBackground('2.25rem');
const STICKY_HEADER_BACKGROUND_MOBILE = stickyHeaderBackground('0.75rem');

const TurnItem: React.FC<TurnItemProps> = ({ turn, renderMessage, stickyUserHeader: stickyOverride, gapBelow = false }) => {
 const { isMobile } = useDeviceInfo();
 const stickySetting = useUIStore((state) => state.stickyUserHeader);
 const headerSticks = React.useMemo(
  () => (stickyOverride ?? stickySetting) && turnHeaderCanStick(turn.userMessage),
  [stickyOverride, stickySetting, turn.userMessage]
 );

 return (
  <section
   className={cn(
    'relative w-full',
    gapBelow && 'pb-2',
    headerSticks && isMobile && 'pointer-events-none [&>*]:pointer-events-auto',
    headerSticks && isMobile && '[&>[data-turn-sticky-header]+*]:mt-4',
   )}
   id={`turn-${turn.turnId}`}
   data-turn-id={turn.turnId}
   data-scroll-spy-id={turn.turnId}
  >
   {headerSticks ? (
    <div
     className="sticky top-0 z-20 [overflow-anchor:none]"
     data-turn-sticky-header=""
     style={isMobile ? STICKY_HEADER_BACKGROUND_MOBILE : STICKY_HEADER_BACKGROUND_DESKTOP}
    >
     <div className="relative z-10">
      {renderMessage(turn.userMessage)}
     </div>
    </div>
   ) : (
    renderMessage(turn.userMessage)
   )}

  </section>
 );
};

export default React.memo(TurnItem);
