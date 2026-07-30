"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
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

import {
  deleteBanner,
  reorderBanners,
  toggleBannerActive,
} from "@/app/admin/banners/actions";
import { DeleteConfirmDialog } from "@/components/admin/delete-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  BannerFormDialog,
  type BannerFormProduct,
} from "./banner-form-dialog";

export type BannerListItem = {
  id: string;
  imageUrl: string;
  productId: string | null;
  productTitle: string | null;
  isActive: boolean;
  order: number;
  startDate: string | null;
  endDate: string | null;
};

export function BannersDndList({
  initialBanners,
  products,
}: {
  initialBanners: BannerListItem[];
  products: BannerFormProduct[];
}) {
  const [items, setItems] = useState(initialBanners);
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
      const result = await reorderBanners(next.map((item) => item.id));
      if (result.error) {
        setItems(previous);
        setError(result.error);
      }
    });
  }

  function handleToggle(id: string, isActive: boolean) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, isActive } : item
      )
    );
    setError(null);
    startTransition(async () => {
      const result = await toggleBannerActive(id, isActive);
      if (result.error) {
        setItems((current) =>
          current.map((item) =>
            item.id === id ? { ...item, isActive: !isActive } : item
          )
        );
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">
        Arraste para reordenar o carrossel da página inicial.
        {isPending && (
          <span className="ml-2 text-coffee-700">Salvando…</span>
        )}
      </p>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white py-10 text-center text-stone-500">
          Nenhum banner cadastrado.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {items.map((banner) => (
                <SortableBannerRow
                  key={banner.id}
                  banner={banner}
                  products={products}
                  onToggle={handleToggle}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableBannerRow({
  banner,
  products,
  onToggle,
}: {
  banner: BannerListItem;
  products: BannerFormProduct[];
  onToggle: (id: string, isActive: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: banner.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm",
        isDragging && "z-10 border-coffee-300 shadow-md",
        !banner.isActive && "opacity-70"
      )}
    >
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-md text-stone-400 hover:bg-stone-50 hover:text-stone-700 active:cursor-grabbing"
        aria-label="Arrastar banner"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-stone-100">
        <Image
          src={banner.imageUrl}
          alt=""
          fill
          sizes="96px"
          className="object-cover"
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-stone-800">
          {banner.productTitle
            ? `→ ${banner.productTitle}`
            : "Sem produto vinculado"}
        </p>
        <p className="text-xs text-stone-500">
          {banner.isActive ? "Ativo na vitrine" : "Inativo"}
        </p>
      </div>

      <Switch
        checked={banner.isActive}
        onCheckedChange={(checked) => onToggle(banner.id, checked)}
        aria-label="Ativar banner"
      />

      <div className="flex shrink-0 items-center gap-1">
        <BannerFormDialog
          banner={{
            id: banner.id,
            imageUrl: banner.imageUrl,
            productId: banner.productId,
            isActive: banner.isActive,
            startDate: banner.startDate,
            endDate: banner.endDate,
          }}
          products={products}
          trigger={
            <Button variant="ghost" size="icon" aria-label="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
          }
        />
        <DeleteConfirmDialog
          title="Excluir banner"
          description="Tem certeza que deseja excluir este banner?"
          onConfirm={deleteBanner.bind(null, banner.id)}
        />
      </div>
    </li>
  );
}
