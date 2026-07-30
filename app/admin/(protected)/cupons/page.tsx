import { Plus } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { deleteCoupon } from "@/app/admin/promocoes/actions";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/admin/delete-confirm-dialog";
import { CouponFormDialog } from "./coupon-form-dialog";

export const dynamic = "force-dynamic";

export default async function CuponsPage() {
  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-stone-800">
            Cupons
          </h1>
          <p className="mt-1 text-stone-500">
            Descontos recalculados com segurança no checkout.
          </p>
        </div>
        <CouponFormDialog
          trigger={
            <Button className="bg-coffee-600 text-white hover:bg-coffee-700">
              <Plus className="h-4 w-4" />
              Novo cupom
            </Button>
          }
        />
      </div>

      <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
        {coupons.length === 0 ? (
          <li className="py-10 text-center text-sm text-stone-500">
            Nenhum cupom cadastrado.
          </li>
        ) : (
          coupons.map((coupon) => (
            <li
              key={coupon.id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-mono text-sm font-semibold text-stone-800">
                  {coupon.code}
                </p>
                <p className="text-xs text-stone-500">
                  {coupon.discountType === "PERCENTAGE"
                    ? `${coupon.value}%`
                    : `R$ ${coupon.value.toFixed(2)}`}
                  {" · "}mín. R$ {coupon.minPurchaseValue.toFixed(2)}
                  {coupon.expiresAt
                    ? ` · expira ${coupon.expiresAt.toLocaleDateString("pt-BR")}`
                    : ""}
                  {coupon.isActive ? "" : " · inativo"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <CouponFormDialog
                  coupon={{
                    id: coupon.id,
                    code: coupon.code,
                    discountType: coupon.discountType,
                    value: coupon.value,
                    minPurchaseValue: coupon.minPurchaseValue,
                    isActive: coupon.isActive,
                    expiresAt: coupon.expiresAt?.toISOString() ?? null,
                  }}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      Editar
                    </Button>
                  }
                />
                <DeleteConfirmDialog
                  title="Excluir cupom"
                  description={`Excluir o cupom ${coupon.code}?`}
                  onConfirm={deleteCoupon.bind(null, coupon.id)}
                />
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
