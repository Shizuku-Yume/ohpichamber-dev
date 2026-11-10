import React from 'react';
import {
 DndContext,
 KeyboardSensor,
 MouseSensor,
 TouchSensor,
 closestCenter,
 useSensor,
 useSensors,
 type Announcements,
 type DragEndEvent,
} from '@dnd-kit/core';
import {
 SortableContext,
 arrayMove,
 sortableKeyboardCoordinates,
 useSortable,
 verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon } from '@/components/icon/Icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';
<<<<<<< HEAD
import { SettingsCheckboxRow } from '@/components/sections/shared/SettingsSection';
=======
import { selectWorkflowsShown } from '@/lib/workflows/availability';
import { SettingsSortableVisibilityList } from '@/components/sections/shared/SettingsSortableVisibilityList';
>>>>>>> bc50ba56a
import { Button } from '@/components/ui/button';
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';
import { useGuestSurfaces } from '@/hooks/useGuestSurfaces';
import { contextSurfaceGroup, sortContextSurfaces } from '@/lib/surfaces/registry';
<<<<<<< HEAD
import { cn } from '@/lib/utils';
=======
>>>>>>> bc50ba56a

interface SortableSurfaceItem {
 id: string;
 label: string;
 visible: boolean;
 groupStart?: boolean;
}

const SortableVisibilityRow: React.FC<{
 item: SortableSurfaceItem;
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
    label={item.label}
    ariaLabel={item.label}
    className="min-w-0 flex-1"
   />
  </div>
 );
};
/**
 * Which surfaces the context rail shows. Everything is on by default and the
 * choice is stored as the *hidden* set, so a surface added in a later release
 * appears for everyone rather than staying invisible to whoever had saved
 * settings before it existed. Hidden surfaces also leave the digit shortcuts
 * (the rail and the shortcut share one visibility filter).
 */
export const ContextRailSurfacesDialog: React.FC<{
 open: boolean;
 onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
 const { t } = useI18n();
 const contextRailOrder = useUIStore((state) => state.contextRailOrder);
 const hidden = useUIStore((state) => state.contextRailHiddenSurfaces);
 const setSurfaceVisible = useUIStore((state) => state.setContextRailSurfaceVisible);
 const setSurfaceOrder = useUIStore((state) => state.setContextRailOrder);
 const setHiddenSurfaces = useUIStore((state) => state.setContextRailHiddenSurfaces);
 const workflowsAvailable = useUIStore((state) => state.agentWorkflowFeatureAvailable);

<<<<<<< HEAD
 // The full registry in the user's rail order — including surfaces a runtime
 // filter currently drops, so a choice made on desktop is editable anywhere.
 const guestSurfaces = useGuestSurfaces();
 const surfaces = React.useMemo(
  () => sortContextSurfaces(contextRailOrder, guestSurfaces).filter((surface) => workflowsAvailable || surface.id !== 'workflows'),
  [contextRailOrder, guestSurfaces, workflowsAvailable],
 );

 const allVisible = hidden.length === 0;
 const noneVisible = surfaces.every((surface) => hidden.includes(surface.id));
 const dragging = React.useRef(false);
 const items = React.useMemo(() => surfaces.map((surface, index) => ({
  id: surface.id,
  label: surface.label ?? t(surface.labelKey),
  visible: !hidden.includes(surface.id),
  groupStart: index > 0 && contextSurfaceGroup(surfaces[index - 1]) !== contextSurfaceGroup(surface),
 })), [hidden, surfaces, t]);

 const handleReorder = React.useCallback((next: string[]) => {
  const grouped = sortContextSurfaces(next, guestSurfaces).map((surface) => surface.id).filter((id) => next.includes(id));
  const shown = new Set<string>(grouped);
  setSurfaceOrder([...grouped, ...contextRailOrder.filter((id) => !shown.has(id))]);
 }, [contextRailOrder, guestSurfaces, setSurfaceOrder]);

 const sensors = useSensors(
  useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
 );

 const handleDragEnd = React.useCallback(({ active, over }: DragEndEvent) => {
  dragging.current = false;
  if (!over || active.id === over.id) return;
  const from = items.findIndex((item) => item.id === active.id);
  const to = items.findIndex((item) => item.id === over.id);
  if (from < 0 || to < 0) return;
  handleReorder(arrayMove(items, from, to).map((item) => item.id));
 }, [handleReorder, items]);

 const dragInstructions = t('contextRail.configure.dragInstructions');
 const accessibility = React.useMemo(() => {
  const position = (activeId: string | number, overId: string | number = activeId) => {
   const item = items.find((entry) => entry.id === activeId);
   if (!item) return undefined;
   return t('contextRail.configure.position', {
    label: item.label,
    position: items.findIndex((entry) => entry.id === overId) + 1,
    count: items.length,
   });
=======
  // The full registry in the user's rail order — including surfaces a runtime
  // filter currently drops, so a choice made on desktop is editable anywhere.
  const guestSurfaces = useGuestSurfaces();
  // While workflows are not shown the surface is not offered.
  const workflowsAvailable = useUIStore(selectWorkflowsShown);
  const surfaces = React.useMemo(
    () => sortContextSurfaces(contextRailOrder, guestSurfaces).filter((surface) => workflowsAvailable || surface.id !== 'workflows'),
    [contextRailOrder, guestSurfaces, workflowsAvailable],
  );

  const allVisible = hidden.length === 0;
  const noneVisible = surfaces.every((surface) => hidden.includes(surface.id));
  const dragging = React.useRef(false);
  const items = React.useMemo(() => surfaces.map((surface, index) => ({
    id: surface.id,
    label: surface.label ?? t(surface.labelKey),
    visible: !hidden.includes(surface.id),
    groupStart: index > 0 && contextSurfaceGroup(surfaces[index - 1]) !== contextSurfaceGroup(surface),
  })), [hidden, surfaces, t]);
  // The rail's groups stay together: a surface dropped inside its own group
  // moves there, and one dropped ahead of another group carries its whole
  // group along (sortContextSurfaces). The saved order is that grouped order.
  const handleReorder = (next: string[]) => {
    const grouped = sortContextSurfaces(next, guestSurfaces).map((surface) => surface.id).filter((id) => next.includes(id));
    const shown = new Set<string>(grouped);
    // Keep saved entries for extensions that are temporarily unavailable.
    setSurfaceOrder([...grouped, ...contextRailOrder.filter((id) => !shown.has(id))]);
>>>>>>> bc50ba56a
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
  <Dialog open={open} onOpenChange={onOpenChange}>
   <DialogContent className="max-w-md">
    <DialogHeader>
     <DialogTitle>{t('contextRail.configure.dialogTitle')}</DialogTitle>
     <DialogDescription>{t('contextRail.configure.dialogDescription')}</DialogDescription>
    </DialogHeader>

    <DndContext
     sensors={sensors}
     collisionDetection={closestCenter}
     onDragStart={() => { dragging.current = true; }}
     onDragCancel={() => { dragging.current = false; }}
     onDragEnd={handleDragEnd}
     accessibility={accessibility}
    >
     <SortableContext items={items} strategy={verticalListSortingStrategy}>
      <div className="flex flex-col">
       {items.map((item) => (
        <SortableVisibilityRow
         key={item.id}
         item={item}
         settingsItem={`layout.context-rail.surface.${item.id}`}
         onVisibleChange={(visible) => setSurfaceVisible(item.id, visible)}
        />
       ))}
      </div>
     </SortableContext>
    </DndContext>

    {!allVisible ? (
     <div className="flex items-center justify-between border-t pt-3">
      {noneVisible ? (
       <span className="text-xs text-destructive">{t('contextRail.configure.noneWarning')}</span>
      ) : <span />}
      <Button
       variant="link"
       size="xs"
       onClick={() => setHiddenSurfaces([])}
       className="normal-case text-muted-foreground hover:text-foreground"
      >
       {t('contextRail.configure.showAll')}
      </Button>
     </div>
    ) : null}
   </DialogContent>
  </Dialog>
 );
};
