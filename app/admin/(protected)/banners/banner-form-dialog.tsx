"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  createBanner,
  updateBanner,
  type BannerActionState,
} from "@/app/admin/banners/actions";
import { ImageUpload } from "@/components/admin/image-upload";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type BannerFormProduct = {
  id: string;
  title: string;
};

export type BannerFormValues = {
  id: string;
  imageUrl: string;
  productId: string | null;
  isActive: boolean;
};

interface BannerFormDialogProps {
  banner?: BannerFormValues;
  products: BannerFormProduct[];
  trigger: React.ReactNode;
}

export function BannerFormDialog({
  banner,
  products,
  trigger,
}: BannerFormDialogProps) {
  const isEditing = Boolean(banner);
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState(
    banner?.productId ?? "__none__"
  );
  const [state, formAction, isPending] = useActionState<
    BannerActionState,
    FormData
  >(isEditing ? updateBanner : createBanner, {});

  useEffect(() => {
    if (state?.success) setOpen(false);
  }, [state]);

  useEffect(() => {
    if (open) {
      setProductId(banner?.productId ?? "__none__");
    }
  }, [open, banner?.productId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar banner" : "Novo banner"}
          </DialogTitle>
          <DialogDescription>
            Imagem promocional no topo do cardápio. Opcionalmente vincule a um
            produto.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEditing && <input type="hidden" name="id" value={banner!.id} />}
          <input type="hidden" name="productId" value={productId} />

          <div className="space-y-2">
            <Label>Imagem do banner</Label>
            <ImageUpload name="imageUrl" defaultValue={banner?.imageUrl} />
            <p className="text-xs text-stone-500">
              Preferível landscape (ex.: 1200×500). Máx. 4 MB.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="productId">Produto vinculado (opcional)</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="productId">
                <SelectValue placeholder="Nenhum produto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum (só imagem)</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-stone-200 p-3">
            <div>
              <Label htmlFor="isActive">Ativo na vitrine</Label>
              <p className="text-xs text-stone-500">
                Banners inativos não aparecem no site.
              </p>
            </div>
            <Switch
              id="isActive"
              name="isActive"
              defaultChecked={banner?.isActive ?? true}
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}

          <DialogFooter>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-coffee-600 text-white hover:bg-coffee-700"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar banner"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
