import React from 'react';
import { Icon } from "@/components/icon/Icon";
import { GuestIcon } from '@/components/layout/GuestRailIcon';
import { resolveGuestToolIcon } from '@/lib/guests/icon';
import { opencodeNamespaceTool } from '@/lib/opencode/tools';
import type { GuestToolRule } from '@/lib/guests/tool-presentation';
import { getRuntimeUrlResolver } from '@/lib/runtime-url';

/**
 * Icon for a tool row, dialog header, or error fallback. An extension rule
 * with an icon wins: a package SVG drawn as a currentColor mask, or a
 * Remixicon the sprite knows; otherwise native names select the built-in icon
 * and custom tools receive the generic wrench.
 */
export const getToolIcon = (toolName: string, presentation?: GuestToolRule | null) => {
    const iconClass = 'h-3.5 w-3.5 flex-shrink-0';
    const guestIcon = presentation
        ? resolveGuestToolIcon(presentation.guestId, presentation.icon, getRuntimeUrlResolver().authenticatedAsset)
        : null;
    if (guestIcon) {
        return <GuestIcon icon={guestIcon.icon} iconSrc={guestIcon.iconSrc} className={iconClass} />;
    }
<<<<<<< HEAD
    const tool = toolName;
=======
    const tool = toolName.toLowerCase();
    // OpenCode managing itself: sessions, worktrees, models, schedules, artifacts.
    if (tool === 'opencode' || opencodeNamespaceTool(tool)) {
        return <Icon name="opencode" className={iconClass} />;
    }
>>>>>>> bc50ba56a

    if (tool === 'reasoning') {
        return <Icon name="brain-ai-3" className={iconClass} />;
    }
    if (tool === 'image-preview') {
        return <Icon name="file-image" className={iconClass} />;
    }
    if (tool === 'mermaid-preview') {
        return <Icon name="file-list-2" className={iconClass} />;
    }
    if (tool === 'edit') {
        return <Icon name="pencil" className={iconClass} />;
    }
    if (tool === 'write') {
        return <Icon name="file-edit" className={iconClass} />;
    }
    if (tool === 'read') {
        return <Icon name="file-text" className={iconClass} />;
    }
    if (tool === 'bash') {
        return <Icon name="terminal-box" className={iconClass} />;
    }
    if (tool === 'grep' || tool === 'find') {
        return <Icon name="menu-search" className={iconClass} />;
    }
    if (tool === 'glob') {
        return <Icon name="file-search" className={iconClass} />;
    }
    if (tool === 'fetch') {
        return <Icon name="global" className={iconClass} />;
    }
    if (tool === 'web_search') {
        return <Icon name="global" className={iconClass} />;
    }
    if (tool === 'task') {
        return <Icon name="ai-agent" className={iconClass} />;
    }
    if (tool === 'openchamber') {
        return <Icon name="openchamber" className={iconClass} />;
    }
    if (tool === 'openchamber_web') {
        return <Icon name="global" className={iconClass} />;
    }
    if (tool === 'openchamber_notify') {
        return <Icon name="notification-3" className={iconClass} />;
    }
<<<<<<< HEAD
=======
    if (tool === 'openchamber_usage') {
        return <Icon name="bar-chart-2" className={iconClass} />;
    }
    if (tool === 'openchamber_render') {
        return <Icon name="bar-chart-box" className={iconClass} />;
    }
    if (tool === 'openchamber_image') {
        return <Icon name="image" className={iconClass} />;
    }
    if (tool === 'openchamber_secret') {
        return <Icon name="shield-keyhole" className={iconClass} />;
    }
    if (tool === 'openchamber_knowledge') {
        return <Icon name="sticky-note" className={iconClass} />;
    }
>>>>>>> bc50ba56a
    if (tool === 'openchamber_memory') {
        return <Icon name="brain-4" className={iconClass} />;
    }
    if (tool === 'ask') {
        return <Icon name="survey" className={iconClass} />;
    }
    if (tool.startsWith('git')) {
        return <Icon name="git-branch" className={iconClass} />;
    }
    return <Icon name="tools" className={iconClass} />;
};
