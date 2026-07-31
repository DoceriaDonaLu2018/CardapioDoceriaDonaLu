"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { getCartStoreStatus } from "@/app/checkout/store-status-action";
import { getActiveGiftsForCart } from "@/app/checkout/gifts-action";
import { useCart } from "@/components/cart/cart-context";
import { GiftThumbnail } from "@/components/gifts/gift-thumbnail";
import { SafeImage } from "@/components/ui/safe-image";
import { formatPrice } from "@/lib/format";
import { formatModifiersLines } from "@/lib/modifiers/types";
import { STORE_ADDRESS } from "@/lib/store-info";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type CartGift = {
  id: string;
  name: string;
  minPurchaseValue: number;
  imageUrl: string | null;
};

export function CartButton() {
  const { items, itemCount, total, setQuantity, removeItem } = useCart();
  const [storeOpen, setStoreOpen] = useState(true);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);
  const [gifts, setGifts] = useState<CartGift[]>([]);

  useEffect(() => {
    void getCartStoreStatus().then((status) => {
      setStoreOpen(status.isOpen);
      setClosedMessage(status.isOpen ? null : status.message);
    });
    void getActiveGiftsForCart().then(setGifts);
  }, []);

  const unlockedGift = useMemo(() => {
    const eligible = gifts.filter((g) => total >= g.minPurchaseValue);
    if (eligible.length === 0) return null;
    return eligible.reduce((best, g) =>
      g.minPurchaseValue >= best.minPurchaseValue ? g : best
    );
  }, [gifts, total]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-stone-800 hover:bg-coffee-50 hover:text-coffee-700"
          aria-label={`Carrinho com ${itemCount} itens`}
        >
          <ShoppingBag className="h-6 w-6" />
          {itemCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-coffee-600 px-1 text-[10px] font-bold text-white">
              {itemCount > 99 ? "99+" : itemCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl text-stone-800">
            Seu pedido
          </SheetTitle>
          <SheetDescription>
            Revise os itens e pague no Mercado Pago — sem criar conta.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5">
          <MapPin
            className="mt-0.5 h-4 w-4 shrink-0 text-coffee-600"
            aria-hidden
          />
          <div>
            <p className="text-xs font-medium text-stone-700">
              Retirada no local
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
              {STORE_ADDRESS}
            </p>
          </div>
        </div>

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone-500">
              Seu carrinho está vazio. Escolha um doce no cardápio.
            </p>
          ) : (
            items.map((item) => {
              const modLines = formatModifiersLines(item.modifiers);
              return (
                <div
                  key={item.lineId}
                  className="flex gap-3 border-b border-stone-100 pb-4"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                    <SafeImage
                      src={item.imageUrl}
                      alt={item.title}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-stone-800">
                      {item.title}
                    </p>
                    {modLines.length > 0 && (
                      <ul className="mt-0.5 space-y-0.5">
                        {modLines.map((line) => (
                          <li
                            key={line}
                            className="truncate text-xs text-stone-500"
                          >
                            · {line}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-sm font-semibold text-coffee-700">
                      {formatPrice(item.price)}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Diminuir"
                        onClick={() =>
                          setQuantity(item.lineId, item.quantity - 1)
                        }
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Aumentar"
                        onClick={() =>
                          setQuantity(item.lineId, item.quantity + 1)
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-8 w-8 text-stone-400 hover:text-red-600"
                        aria-label="Remover"
                        onClick={() => removeItem(item.lineId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <SheetFooter className="mt-4 border-t border-stone-100 pt-4 sm:flex-col">
          {!storeOpen && closedMessage && items.length > 0 && (
            <p className="mb-3 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {closedMessage} No checkout você pode fazer uma encomenda.
            </p>
          )}
          {unlockedGift && items.length > 0 && (
            <div className="mb-3 flex w-full items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <GiftThumbnail
                name={unlockedGift.name}
                imageUrl={unlockedGift.imageUrl}
                size="sm"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-emerald-800">
                  Brinde desbloqueado!
                </p>
                <p className="truncate text-sm font-semibold text-emerald-900">
                  {unlockedGift.name}
                </p>
              </div>
            </div>
          )}
          <div className="mb-3 flex w-full items-center justify-between text-base">
            <span className="text-stone-500">Total</span>
            <span className="font-bold text-stone-800">
              {formatPrice(total)}
            </span>
          </div>
          <Button
            asChild
            disabled={items.length === 0}
            className="w-full bg-coffee-600 text-white hover:bg-coffee-700 disabled:opacity-50"
          >
            <Link href="/checkout">Ir para o pagamento</Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
