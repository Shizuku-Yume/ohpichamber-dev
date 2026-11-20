import React from 'react';
import { createPortal } from 'react-dom';
import { ContextPanelHeaderSlotContext } from './contextPanelHeaderSlotContext';

export function ContextPanelHeaderSlotProvider({ value, children }: { value: HTMLElement | null; children: React.ReactNode }): React.ReactNode {
  return <ContextPanelHeaderSlotContext.Provider value={value}>{children}</ContextPanelHeaderSlotContext.Provider>;
}

/**
 * Renders `children` into the panel header when a slot is provided, otherwise
 * in place. The header hides its own mode label while a toolbar is present
 * (`data-context-panel-toolbar`), so a surface that renders no toolbar — an
 * empty or loading state — still leaves the header named.
 */
export function ContextPanelHeaderToolbar({ children }: { children: React.ReactNode }): React.JSX.Element | null {
  const slot = React.useContext(ContextPanelHeaderSlotContext);
  if (!slot) {
    return <>{children}</>;
  }
  return (createPortal(
    // Stretched to the header's height, so a tab strip's active underline
    // sits on the header's bottom edge like the panel's own tabs.
    <div data-context-panel-toolbar="" className="flex min-w-0 flex-1 items-stretch">
      {children}
    </div>,
    slot,
  ) ?? null) as React.JSX.Element | null;
}
