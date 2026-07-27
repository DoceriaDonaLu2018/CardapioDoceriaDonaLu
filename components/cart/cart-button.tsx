"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { useCart } from "@/components/cart/cart-context";
import { formatPrice } from "@/lib/format";
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

export function CartButton() {
  const { items, itemCount, total, setQuantity, removeItem } = useCart();

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
            Revise os itens e pague com PIX ou cartão — sem criar conta.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone-500">
              Seu carrinho está vazio. Escolha um doce no cardápio.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.productId}
                className="flex gap-3 border-b border-stone-100 pb-4"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                  <Image
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
                        setQuantity(item.productId, item.quantity - 1)
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
                        setQuantity(item.productId, item.quantity + 1)
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
                      onClick={() => removeItem(item.productId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <SheetFooter className="mt-4 border-t border-stone-100 pt-4 sm:flex-col">
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
            <Link href="/checkout">Pagar com PIX ou cartão</Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
