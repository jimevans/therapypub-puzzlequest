import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ReactNode, useId } from "react";
import styles from "./SortableList.module.css";

interface SortableListProps<Item> {
  items: readonly Item[];
  /** Stays the same for an item as it moves. */
  getId: (item: Item) => string;
  /** Names an item, for the handle and for screen readers. */
  label: (item: Item) => string;
  /**
   * How many items at the start are fixed: they can't move, and nothing can be
   * put before them.
   */
  fixedCount?: number;
  onMove: (from: number, to: number) => void;
  /**
   * Shows an item. Its handle, for dragging it, is null for a fixed item.
   */
  renderItem: (item: Item, index: number, handle: ReactNode) => ReactNode;
  className?: string;
}

function SortableItem({
  id,
  label,
  isFixed,
  describedBy,
  children,
}: {
  id: string;
  label: string;
  isFixed: boolean;
  describedBy: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: isFixed });

  const handle = isFixed ? null : (
    <button
      ref={setActivatorNodeRef}
      type="button"
      className={styles.handle}
      {...attributes}
      {...listeners}
      aria-describedby={describedBy}
      aria-label={`Move ${label}`}
    >
      <span aria-hidden="true">⠿</span>
    </button>
  );

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? styles.dragging : undefined}
      // Set through the DOM's style object, which the Content Security Policy
      // allows, unlike a style attribute written into the page.
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {children(handle)}
    </li>
  );
}

/**
 * A list whose items can be put in order by dragging their handles, with a
 * mouse, a finger, or the keyboard.
 */
export function SortableList<Item>({
  items,
  getId,
  label,
  fixedCount = 0,
  onMove,
  renderItem,
  className,
}: SortableListProps<Item>) {
  const instructions = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const ids = items.map(getId);
  const labelOf = (id: string | number) => {
    const index = ids.indexOf(String(id));
    return index === -1 ? "The item" : label(items[index]!);
  };
  const positionOf = (id: string | number | undefined) =>
    id === undefined ? 0 : ids.indexOf(String(id)) + 1;
  // Says where things are by their names and places, not by internal IDs.
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${labelOf(active.id)}, at position ${positionOf(active.id)} of ${ids.length}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${labelOf(active.id)} is over position ${positionOf(over.id)} of ${ids.length}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${labelOf(active.id)} dropped at position ${Math.max(positionOf(over.id), fixedCount + 1)} of ${ids.length}.`
        : `${labelOf(active.id)} dropped.`,
    onDragCancel: ({ active }) =>
      `Moving ${labelOf(active.id)} was cancelled. It's back at position ${positionOf(active.id)}.`,
  };

  const finish = ({ active, over }: DragEndEvent) => {
    if (!over) {
      return;
    }
    const from = ids.indexOf(String(active.id));
    const to = Math.max(ids.indexOf(String(over.id)), fixedCount);
    if (from !== -1 && from !== to) {
      onMove(from, to);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={finish}
      accessibility={{ announcements }}
    >
      <p id={instructions} className={styles.instructions}>
        To move an item with the keyboard, press Space on its handle, then the
        arrow keys, then Space again to drop it. Escape cancels.
      </p>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className={className}>
          {items.map((item, index) => (
            <SortableItem
              key={ids[index]}
              id={ids[index]!}
              label={label(item)}
              isFixed={index < fixedCount}
              describedBy={instructions}
            >
              {(handle) => renderItem(item, index, handle)}
            </SortableItem>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
