"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

interface DeleteConfirmDialogProps {
  title: string;
  description: string;
  onConfirm: () => Promise<{ error?: string; success?: boolean }>;
  confirmLabel?: string;
  pendingLabel?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  triggerVariant?: "ghost" | "outline" | "destructive" | "default";
  triggerSize?: "icon" | "default" | "sm";
  showTrashIcon?: boolean;
}

export function DeleteConfirmDialog({
  title,
  description,
  onConfirm,
  confirmLabel = "Excluir",
  pendingLabel = "Excluindo...",
  triggerLabel,
  triggerClassName = "text-red-600 hover:bg-red-50 hover:text-red-700",
  triggerVariant = "ghost",
  triggerSize = "icon",
  showTrashIcon = true,
}: DeleteConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await onConfirm();
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={triggerVariant}
          size={triggerSize}
          className={triggerClassName}
          aria-label={triggerLabel ?? confirmLabel}
        >
          {showTrashIcon && triggerSize === "icon" ? (
            <Trash2 className="h-4 w-4" />
          ) : (
            triggerLabel ?? confirmLabel
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              Voltar
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {pendingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
