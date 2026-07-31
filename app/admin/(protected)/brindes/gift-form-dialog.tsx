"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  createGift,
  updateGift,
  type PromoActionState,
} from "@/app/admin/promocoes/actions";
import { ImageUpload } from "@/components/admin/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type GiftFormValues = {
  id: string;
  name: string;
  minPurchaseValue: number;
  isActive: boolean;
  imageUrl: string | null;
};

export function GiftFormDialog({
  gift,
  trigger,
}: {
  gift?: GiftFormValues;
  trigger: React.ReactNode;
}) {
  const isEditing = Boolean(gift);
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    PromoActionState,
    FormData
  >(isEditing ? updateGift : createGift, {});

  useEffect(() => {
    if (state?.success) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar brinde" : "Novo brinde"}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {isEditing && <input type="hidden" name="id" value={gift!.id} />}

          <div className="space-y-2">
            <Label>Foto do brinde (opcional)</Label>
            <ImageUpload
              name="imageUrl"
              defaultValue={gift?.imageUrl ?? ""}
            />
            <p className="text-xs text-stone-400">
              Miniatura exibida no carrinho e no checkout quando o cliente
              desbloquear o brinde.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              name="name"
              defaultValue={gift?.name}
              placeholder="Ex.: Brigadeirinho"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="minPurchaseValue">Valor mínimo (R$)</Label>
            <Input
              id="minPurchaseValue"
              name="minPurchaseValue"
              inputMode="decimal"
              defaultValue={gift?.minPurchaseValue?.toString() ?? "50"}
              required
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-stone-200 p-3">
            <Label htmlFor="isActive">Ativo</Label>
            <Switch
              id="isActive"
              name="isActive"
              defaultChecked={gift?.isActive ?? true}
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
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
