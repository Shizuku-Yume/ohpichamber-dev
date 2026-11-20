import { Icon } from '@/components/icon/Icon';
import { GuestIcon } from '@/components/layout/GuestRailIcon';
import { resolveGuestToolIcon } from '@/lib/guests/icon';
import type { GuestToolRule } from '@/lib/guests/tool-presentation';
import { getRuntimeUrlResolver } from '@/lib/runtime-url';
import { toolPresentation } from '@/lib/toolPresentation';

export const getToolIcon = (toolName: string, presentation?: GuestToolRule | null) => {
    const iconClass = 'h-3.5 w-3.5 flex-shrink-0';
    const guestIcon = presentation
        ? resolveGuestToolIcon(presentation.guestId, presentation.icon, getRuntimeUrlResolver().authenticatedAsset)
        : null;
    if (guestIcon) {
        return <GuestIcon icon={guestIcon.icon} iconSrc={guestIcon.iconSrc} className={iconClass} />;
    }
    return <Icon name={toolPresentation(toolName).icon} className={iconClass} />;
};
