"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil } from "lucide-react";

import { reorderCategories } from "@/app/admin/categorias/actions";
import { deleteCategory } from "@/app/admin/categorias/actions";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/admin/delete-confirm-dialog";
import { CategoryFormDialog } from "./category-form-dialog";
import { cn } from "@/lib/utils";

export type CategoryListItem = {
  id: string;
  name: string;
  slug: string;
  order: number;
  productCount: number;
};

export function CategoriesDndList({
  initialCategories,
}: {
  initialCategories: CategoryListItem[];
}) {
  const [items, setItems] = useState(initialCategories);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const ids = useMemo(() => items.map((item) => item.id), [items]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = items;
    const next = arrayMove(items, oldIndex, newIndex).map((item, index) => ({
      ...item,
      order: index,
    }));
    setItems(next);
    setError(null);

    startTransition(async () => {
      const result = await reorderCategories(next.map((item) => item.id));
      if (result.error) {
        setItems(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">
        Arraste pelo ícone{" "}
        <GripVertical className="inline h-3.5 w-3.5 align-text-bottom" /> para
        reordenar as seções do cardápio.
        {isPending && (
          <span className="ml-2 text-coffee-700">Salvando ordem…</span>
        )}
      </p>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white py-10 text-center text-stone-500">
          Nenhuma categoria cadastrada.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {items.map((category) => (
                <SortableCategoryRow key={category.id} category={category} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableCategoryRow({ category }: { category: CategoryListItem }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3 shadow-sm",
        isDragging && "z-10 border-coffee-300 shadow-md"
      )}
    >
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-md text-stone-400 hover:bg-stone-50 hover:text-stone-700 active:cursor-grabbing"
        aria-label={`Arrastar ${category.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-stone-800">{category.name}</p>
        <p className="truncate text-xs text-stone-500">
          <code className="rounded bg-stone-100 px-1 py-0.5">{category.slug}</code>
          <span className="mx-1.5">·</span>
          {category.productCount} produto(s)
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <CategoryFormDialog
          category={{
            id: category.id,
            name: category.name,
          }}
          trigger={
            <Button variant="ghost" size="icon" aria-label="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
          }
        />
        <DeleteConfirmDialog
          title="Excluir categoria"
          description={`Tem certeza que deseja excluir "${category.name}"?`}
          onConfirm={deleteCategory.bind(null, category.id)}
        />
      </div>
    </li>
  );
}
