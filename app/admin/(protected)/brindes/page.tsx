import { Plus } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { deleteGift } from "@/app/admin/promocoes/actions";
import { GiftThumbnail } from "@/components/gifts/gift-thumbnail";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/admin/delete-confirm-dialog";
import { GiftFormDialog } from "./gift-form-dialog";

export const dynamic = "force-dynamic";

export default async function BrindesPage() {
  const gifts = await prisma.gift.findMany({
    orderBy: { minPurchaseValue: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-stone-800">
            Brindes
          </h1>
          <p className="mt-1 text-stone-500">
            Liberados automaticamente ao atingir o valor mínimo. Inclua uma
            foto para destacar no carrinho.
          </p>
        </div>
        <GiftFormDialog
          trigger={
            <Button className="bg-coffee-600 text-white hover:bg-coffee-700">
              <Plus className="h-4 w-4" />
              Novo brinde
            </Button>
          }
        />
      </div>

      <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
        {gifts.length === 0 ? (
          <li className="py-10 text-center text-sm text-stone-500">
            Nenhum brinde cadastrado.
          </li>
        ) : (
          gifts.map((gift) => (
            <li
              key={gift.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <GiftThumbnail name={gift.name} imageUrl={gift.imageUrl} />
                <div>
                  <p className="font-medium text-stone-800">{gift.name}</p>
                  <p className="text-xs text-stone-500">
                    A partir de R$ {gift.minPurchaseValue.toFixed(2)}
                    {gift.isActive ? "" : " · inativo"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <GiftFormDialog
                  gift={{
                    id: gift.id,
                    name: gift.name,
                    minPurchaseValue: gift.minPurchaseValue,
                    isActive: gift.isActive,
                    imageUrl: gift.imageUrl,
                  }}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      Editar
                    </Button>
                  }
                />
                <DeleteConfirmDialog
                  title="Excluir brinde"
                  description={`Excluir o brinde "${gift.name}"?`}
                  onConfirm={deleteGift.bind(null, gift.id)}
                />
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
