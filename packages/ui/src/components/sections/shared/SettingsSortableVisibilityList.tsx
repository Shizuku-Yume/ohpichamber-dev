import React from 'react';
import { SettingsCheckboxRow } from './SettingsSection';
import { SettingsSortableList } from './SettingsSortableList';

interface SortableVisibilityItem {
  id: string;
  label: string;
  visible: boolean;
  locked?: boolean;
  groupStart?: boolean;
}

/**
 * A list the user orders by dragging and filters with checkboxes: the rail's
 * panels on desktop, the workspace tabs on a phone. The drag mechanics live in
 * `SettingsSortableList`; this adds the visibility checkbox to each row.
 */
export const SettingsSortableVisibilityList: React.FC<{
  items: SortableVisibilityItem[];
  onVisibleChange: (id: string, visible: boolean) => void;
  onReorder: (ids: string[]) => void;
  settingsItemPrefix: string;
  dragInstructions: string;
  onDraggingChange?: (dragging: boolean) => void;
}> = ({ items, onVisibleChange, onReorder, settingsItemPrefix, dragInstructions, onDraggingChange }) => (
  <SettingsSortableList
    items={items}
    onReorder={onReorder}
    dragInstructions={dragInstructions}
    onDraggingChange={onDraggingChange}
    renderRow={(item) => (
      <SettingsCheckboxRow
        settingsItem={`${settingsItemPrefix}${item.id}`}
        checked={item.visible}
        onChange={(visible) => onVisibleChange(item.id, visible)}
        disabled={item.locked}
        label={item.label}
        ariaLabel={item.label}
        className="min-w-0 flex-1"
      />
    )}
  />
);
