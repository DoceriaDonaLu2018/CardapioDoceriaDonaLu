"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  createCoupon,
  updateCoupon,
  type PromoActionState,
} from "@/app/admin/promocoes/actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toDatetimeLocalBrasilia } from "@/lib/timezone";

export type CouponFormValues = {
  id: string;
  code: string;
  discountType: "PERCENTAGE" | "FIXED";
  value: number;
  minPurchaseValue: number;
  isActive: boolean;
  expiresAt: string | null;
};

function toDatetimeLocal(iso: string | null): string {
  return toDatetimeLocalBrasilia(iso);
}

export function CouponFormDialog({
  coupon,
  trigger,
}: {
  coupon?: CouponFormValues;
  trigger: React.ReactNode;
}) {
  const isEditing = Boolean(coupon);
  const [open, setOpen] = useState(false);
  const [discountType, setDiscountType] = useState(
    coupon?.discountType ?? "FIXED"
  );
  const [state, formAction, isPending] = useActionState<
    PromoActionState,
    FormData
  >(isEditing ? updateCoupon : createCoupon, {});

  useEffect(() => {
    if (state?.success) setOpen(false);
  }, [state]);

  useEffect(() => {
    if (open) setDiscountType(coupon?.discountType ?? "FIXED");
  }, [open, coupon?.discountType]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar cupom" : "Novo cupom"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {isEditing && <input type="hidden" name="id" value={coupon!.id} />}
          <input type="hidden" name="discountType" value={discountType} />

          <div className="space-y-2">
            <Label htmlFor="code">Código</Label>
            <Input
              id="code"
              name="code"
              defaultValue={coupon?.code}
              placeholder="DONALU10"
              required
              className="uppercase"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={discountType}
                onValueChange={(v) =>
                  setDiscountType(v as "PERCENTAGE" | "FIXED")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Valor fixo (R$)</SelectItem>
                  <SelectItem value="PERCENTAGE">Percentual (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">Valor</Label>
              <Input
                id="value"
                name="value"
                inputMode="decimal"
                defaultValue={coupon?.value?.toString() ?? "10"}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="minPurchaseValue">Compra mínima (R$)</Label>
            <Input
              id="minPurchaseValue"
              name="minPurchaseValue"
              inputMode="decimal"
              defaultValue={coupon?.minPurchaseValue?.toString() ?? "0"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiresAt">Expira em (opcional)</Label>
            <Input
              id="expiresAt"
              name="expiresAt"
              type="datetime-local"
              defaultValue={toDatetimeLocal(coupon?.expiresAt ?? null)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-stone-200 p-3">
            <Label htmlFor="isActive">Ativo</Label>
            <Switch
              id="isActive"
              name="isActive"
              defaultChecked={coupon?.isActive ?? true}
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
