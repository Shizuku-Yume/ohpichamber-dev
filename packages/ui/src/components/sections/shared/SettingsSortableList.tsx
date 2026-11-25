import React from 'react';
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { SettingsDialogDragContext } from '@/components/sections/shared/settingsDialogDrag';

export interface SettingsSortableListItem {
  id: string;
  label: string;
  /** Opens a new group: a divider sits above it. */
  groupStart?: boolean;
}

const SortableListRow: React.FC<{
  item: SettingsSortableListItem;
  disabled: boolean;
  rowClassName?: string;
  children: React.ReactNode;
}> = ({ item, disabled, rowClassName, children }) => {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative flex items-center gap-2', rowClassName, isDragging && 'z-10 opacity-60')}
    >
      {item.groupStart ? <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-px h-px bg-edge-muted" /> : null}
      {/* Closed during a drag: an open tooltip takes Escape, which cancels a keyboard drag. */}
      <Tooltip open={isDragging ? false : undefined}>
        <TooltipTrigger asChild>
          <Button
            ref={setActivatorNodeRef}
            variant="ghost"
            size="icon"
            disabled={disabled}
            {...attributes}
            {...listeners}
            aria-label={t('contextRail.configure.reorder', { label: item.label })}
            className="shrink-0 touch-none select-none cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          >
            <Icon name="draggable" className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('contextRail.configure.reorder', { label: item.label })}</TooltipContent>
      </Tooltip>
      {children}
    </div>
  );
};

/**
 * A vertical list the user orders by dragging a handle. Mouse drags after a
 * small move, touch after a long press (a swipe still scrolls the page), and
 * the keyboard picks a row up with Space and moves it with the arrow keys.
 * Each row supplies its own content through `renderRow`.
 */
export const SettingsSortableList = <Item extends SettingsSortableListItem>({
  items,
  onReorder,
  dragInstructions,
  disabled = false,
  onDraggingChange,
  renderRow,
  listClassName,
  rowClassName,
}: {
  items: Item[];
  /** The new order of every listed id, after a drop that moved something. */
  onReorder: (ids: string[]) => void;
  /** What a screen reader hears about picking a row up with the keyboard. */
  dragInstructions: string;
  /** Rows cannot be picked up while a write is in flight. */
  disabled?: boolean;
  /** For a host that must not close or steal arrow keys mid-drag, such as a dialog. */
  onDraggingChange?: (dragging: boolean) => void;
  renderRow: (item: Item, index: number) => React.ReactNode;
  listClassName?: string;
  rowClassName?: string;
}) => {
  const { t } = useI18n();
  const reportDialogDrag = React.useContext(SettingsDialogDragContext);
  const setDragging = (dragging: boolean) => {
    onDraggingChange?.(dragging);
    reportDialogDrag?.(dragging);
  };
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(false);
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to).map((item) => item.id));
  };
  const accessibility = React.useMemo(() => {
    const position = (activeId: string | number, overId: string | number = activeId) => {
      const item = items.find((entry) => entry.id === activeId);
      if (!item) return undefined;
      return t('contextRail.configure.position', {
        label: item.label,
        position: items.findIndex((entry) => entry.id === overId) + 1,
        count: items.length,
      });
    };
    const announcements: Announcements = {
      onDragStart: ({ active }) => position(active.id),
      onDragOver: ({ active, over }) => over ? position(active.id, over.id) : undefined,
      onDragEnd: ({ active, over }) => over ? position(active.id, over.id) : t('contextRail.configure.dragCancelled'),
      onDragCancel: () => t('contextRail.configure.dragCancelled'),
    };
    return { screenReaderInstructions: { draggable: dragInstructions }, announcements };
  }, [dragInstructions, items, t]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => setDragging(true)}
      onDragCancel={() => setDragging(false)}
      onDragEnd={handleDragEnd}
      accessibility={accessibility}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className={cn('flex flex-col', listClassName)}>
          {items.map((item, index) => (
            <SortableListRow key={item.id} item={item} disabled={disabled} rowClassName={rowClassName}>
              {renderRow(item, index)}
            </SortableListRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
