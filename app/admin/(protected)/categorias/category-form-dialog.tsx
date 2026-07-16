"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Category } from "@prisma/client";

import {
  createCategory,
  updateCategory,
  type CategoryActionState,
} from "@/app/admin/categorias/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface CategoryFormDialogProps {
  category?: Category;
  trigger: React.ReactNode;
}

export function CategoryFormDialog({
  category,
  trigger,
}: CategoryFormDialogProps) {
  const isEditing = Boolean(category);
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    CategoryActionState,
    FormData
  >(isEditing ? updateCategory : createCategory, {});

  useEffect(() => {
    if (state?.success) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar categoria" : "Nova categoria"}
          </DialogTitle>
          <DialogDescription>
            O slug é gerado automaticamente a partir do nome.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEditing && (
            <input type="hidden" name="id" value={category!.id} />
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              name="name"
              defaultValue={category?.name}
              placeholder="Ex.: Cafés"
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="order">Ordem de exibição</Label>
            <Input
              id="order"
              name="order"
              type="number"
              min={0}
              defaultValue={category?.order ?? 0}
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
              {isEditing ? "Salvar alterações" : "Criar categoria"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
