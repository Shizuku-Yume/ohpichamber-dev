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

<<<<<<< HEAD
/**
 * A list the user orders by dragging and filters with checkboxes: the rail's
 * panels on desktop, the workspace tabs on a phone. The drag mechanics live in
 * `SettingsSortableList`; this adds the visibility checkbox to each row.
 */
||||||| bc50ba56aa
const SortableVisibilityRow: React.FC<{
  item: SortableVisibilityItem;
  settingsItem: string;
  onVisibleChange: (visible: boolean) => void;
}> = ({ item, settingsItem, onVisibleChange }) => {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative flex items-center gap-2', isDragging && 'z-10 opacity-60')}
    >
      {item.groupStart ? <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-px h-px bg-edge-muted" /> : null}
      {/* Closed during a drag: an open tooltip takes Escape, which cancels a keyboard drag. */}
      <Tooltip open={isDragging ? false : undefined}>
        <TooltipTrigger asChild>
          <Button
            ref={setActivatorNodeRef}
            variant="ghost"
            size="icon"
            {...attributes}
            {...listeners}
            aria-label={t('contextRail.configure.reorder', { label: item.label })}
            className="shrink-0 touch-none select-none cursor-grab text-muted-foreground hover:bg-transparent active:cursor-grabbing"
          >
            <Icon name="draggable" className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('contextRail.configure.reorder', { label: item.label })}</TooltipContent>
      </Tooltip>
      <SettingsCheckboxRow
        settingsItem={settingsItem}
        checked={item.visible}
        onChange={onVisibleChange}
        disabled={item.locked}
        label={item.label}
        ariaLabel={item.label}
        className="min-w-0 flex-1"
      />
    </div>
  );
};

/**
 * A list the user orders by dragging and filters with checkboxes: the rail's
 * panels on desktop, the workspace tabs on a phone. Mouse drags after a small
 * move, touch after a long press (a swipe still scrolls the page), and the
 * keyboard picks a row up with Space.
 */
=======
const SortableVisibilityRow: React.FC<{
  item: SortableVisibilityItem;
  settingsItem: string;
  onVisibleChange: (visible: boolean) => void;
}> = ({ item, settingsItem, onVisibleChange }) => {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative flex items-center gap-2', isDragging && 'z-10 opacity-60')}
    >
      {item.groupStart ? <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-px h-px bg-edge-muted" /> : null}
      <Tooltip open={isDragging ? false : undefined}>
        <TooltipTrigger asChild>
          <Button
            ref={setActivatorNodeRef}
            variant="ghost"
            size="icon"
            {...attributes}
            {...listeners}
            aria-label={t('contextRail.configure.reorder', { label: item.label })}
            className="shrink-0 touch-none select-none cursor-grab text-muted-foreground hover:bg-transparent active:cursor-grabbing"
          >
            <Icon name="draggable" className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('contextRail.configure.reorder', { label: item.label })}</TooltipContent>
      </Tooltip>
      <SettingsCheckboxRow
        settingsItem={settingsItem}
        checked={item.visible}
        onChange={onVisibleChange}
        disabled={item.locked}
        label={item.label}
        ariaLabel={item.label}
        className="min-w-0 flex-1"
      />
    </div>
  );
};

>>>>>>> upstream/main
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
