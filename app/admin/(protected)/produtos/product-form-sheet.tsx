"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Category, Product } from "@prisma/client";

import {
  createProduct,
  updateProduct,
  type ProductActionState,
} from "@/app/admin/produtos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ImageUpload } from "@/components/admin/image-upload";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface ProductFormSheetProps {
  product?: Product;
  categories: Category[];
  trigger: React.ReactNode;
}

export function ProductFormSheet({
  product,
  categories,
  trigger,
}: ProductFormSheetProps) {
  const isEditing = Boolean(product);
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    ProductActionState,
    FormData
  >(isEditing ? updateProduct : createProduct, {});

  useEffect(() => {
    if (state?.success) setOpen(false);
  }, [state]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Editar produto" : "Novo produto"}
          </SheetTitle>
          <SheetDescription>
            Preencha os dados do item do cardápio.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="mt-6 space-y-4">
          {isEditing && <input type="hidden" name="id" value={product!.id} />}

          <div className="space-y-2">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              name="title"
              defaultValue={product?.title}
              placeholder="Ex.: Cappuccino Cremoso"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (ingredientes)</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={product?.description}
              placeholder="Espresso, leite vaporizado e canela."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Preço de venda (R$)</Label>
              <Input
                id="price"
                name="price"
                inputMode="decimal"
                defaultValue={product?.price?.toString()}
                placeholder="12,00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="costPrice">Custo (R$)</Label>
              <Input
                id="costPrice"
                name="costPrice"
                inputMode="decimal"
                defaultValue={product?.costPrice?.toString() ?? "0"}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="categoryId">Categoria</Label>
            <Select
              name="categoryId"
              defaultValue={product?.categoryId ?? categories[0]?.id}
            >
              <SelectTrigger id="categoryId">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Imagem do produto</Label>
            <ImageUpload name="imageUrl" defaultValue={product?.imageUrl} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-stone-200 p-3">
            <div>
              <Label htmlFor="isAvailable">Disponível</Label>
              <p className="text-xs text-stone-500">
                Produtos indisponíveis não aparecem no cardápio.
              </p>
            </div>
            <Switch
              id="isAvailable"
              name="isAvailable"
              defaultChecked={product?.isAvailable ?? true}
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}

          <SheetFooter>
            <Button
              type="submit"
              disabled={isPending}
              className="w-full bg-coffee-600 text-white hover:bg-coffee-700"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? "Salvar alterações" : "Criar produto"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
