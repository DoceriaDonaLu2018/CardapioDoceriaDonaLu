"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";

import { createOrder } from "@/app/admin/pedidos/actions";
import { formatPhone, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Converte o texto digitado no campo de sinal em número (aceita vírgula). */
function parseCurrencyInput(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export type PdvProduct = {
  id: string;
  title: string;
  price: number;
  imageUrl: string;
  categoryName: string;
};

type CartLine = {
  productId: string;
  title: string;
  price: number;
  quantity: number;
};

interface PdvClientProps {
  products: PdvProduct[];
}

export function PdvClient({ products }: PdvClientProps) {
  const [search, setSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [waiterName, setWaiterName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [advanceInput, setAdvanceInput] = useState("");
  const [showExtraInfo, setShowExtraInfo] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      product.title.toLowerCase().includes(query)
    );
  }, [products, search]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [cart]
  );

  const cartCount = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity, 0),
    [cart]
  );

  const advancePayment = useMemo(
    () => parseCurrencyInput(advanceInput),
    [advanceInput]
  );

  const advanceExceedsTotal = advancePayment > total + 0.001;
  const remaining = Math.max(0, total - advancePayment);

  function addToCart(product: PdvProduct) {
    setSuccessMessage(null);
    setError(null);
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        return current.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          title: product.title,
          price: product.price,
          quantity: 1,
        },
      ];
    });
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((current) =>
      current
        .map((line) =>
          line.productId === productId
            ? { ...line, quantity: line.quantity + delta }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  }

  function removeFromCart(productId: string) {
    setCart((current) => current.filter((line) => line.productId !== productId));
  }

  function handleFinalize() {
    setError(null);
    setSuccessMessage(null);

    if (advanceExceedsTotal) {
      setError("O sinal não pode ser maior que o total do pedido.");
      return;
    }

    startTransition(async () => {
      const result = await createOrder({
        customerName,
        customerPhone: customerPhone || undefined,
        waiterName: waiterName || undefined,
        advancePayment,
        items: cart.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccessMessage(
        "Pedido enviado para a cozinha! Aguarde a impressão na aba Pedidos."
      );
      setCart([]);
      setCustomerName("");
      setWaiterName("");
      setCustomerPhone("");
      setAdvanceInput("");
      setShowExtraInfo(false);
    });
  }

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-5">
      {/* Catálogo */}
      <section className="order-2 space-y-4 lg:order-1 lg:col-span-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            type="search"
            placeholder="Buscar produto pelo título..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-white pl-9"
          />
        </div>

        {filteredProducts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white py-12 text-center text-sm text-stone-500">
            Nenhum produto encontrado.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addToCart(product)}
                className="group flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white text-left shadow-sm transition-all hover:border-coffee-300 hover:shadow-md active:scale-[0.98]"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-stone-100">
                  <Image
                    src={product.imageUrl}
                    alt={product.title}
                    fill
                    sizes="(max-width: 640px) 50vw, 200px"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-0.5 p-2.5">
                  <span className="line-clamp-2 text-sm font-medium text-stone-800">
                    {product.title}
                  </span>
                  <span className="text-xs text-stone-400">
                    {product.categoryName}
                  </span>
                  <span className="mt-auto text-sm font-semibold text-coffee-700">
                    {formatPrice(product.price)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Comanda */}
      <aside className="order-1 lg:order-2 lg:col-span-2">
        <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 lg:sticky lg:top-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-stone-800">
              <ShoppingCart className="h-5 w-5 text-coffee-600" />
              Comanda
            </h2>
            {cartCount > 0 && (
              <span className="rounded-full bg-coffee-100 px-2.5 py-0.5 text-xs font-medium text-coffee-700">
                {cartCount} {cartCount === 1 ? "item" : "itens"}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerName">Nome do cliente</Label>
            <Input
              id="customerName"
              placeholder="Ex.: Maria Silva"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="waiterName">Garçom / Mesa (opcional)</Label>
            <Input
              id="waiterName"
              placeholder="Ex.: Mesa 5 ou João"
              value={waiterName}
              onChange={(event) => setWaiterName(event.target.value)}
              disabled={isPending}
            />
          </div>

          {/* Seção expansível para encomendas (WhatsApp + sinal). */}
          <div className="rounded-lg border border-stone-200">
            <button
              type="button"
              onClick={() => setShowExtraInfo((open) => !open)}
              aria-expanded={showExtraInfo}
              aria-controls="extra-info-panel"
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
            >
              <span className="flex items-center gap-2">
                <PackagePlus className="h-4 w-4 text-coffee-600" />
                Informações Adicionais / Encomenda
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-stone-400 transition-transform",
                  showExtraInfo && "rotate-180"
                )}
              />
            </button>

            {showExtraInfo && (
              <div
                id="extra-info-panel"
                className="space-y-3 border-t border-stone-100 p-3"
              >
                <div className="space-y-2">
                  <Label htmlFor="customerPhone">WhatsApp (opcional)</Label>
                  <Input
                    id="customerPhone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="(11) 99999-9999"
                    value={customerPhone}
                    onChange={(event) =>
                      setCustomerPhone(formatPhone(event.target.value))
                    }
                    disabled={isPending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="advancePayment">
                    Valor pago como sinal (R$)
                  </Label>
                  <Input
                    id="advancePayment"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={advanceInput}
                    onChange={(event) => setAdvanceInput(event.target.value)}
                    disabled={isPending}
                    aria-invalid={advanceExceedsTotal}
                  />
                  {advanceExceedsTotal && (
                    <p className="text-xs text-red-600">
                      O sinal não pode ser maior que o total do pedido.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {successMessage && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {successMessage}
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="max-h-64 space-y-2 overflow-y-auto">
            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-stone-400">
                Clique em um produto para adicionar à comanda.
              </p>
            ) : (
              cart.map((line) => (
                <div
                  key={line.productId}
                  className="flex items-center gap-2 rounded-lg border border-stone-100 bg-stone-50 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-stone-800">
                      {line.title}
                    </p>
                    <p className="text-xs text-coffee-700">
                      {formatPrice(line.price)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateQuantity(line.productId, -1)}
                      disabled={isPending}
                      aria-label="Diminuir quantidade"
                      className="rounded-md p-1 text-stone-500 hover:bg-stone-200"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-medium">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(line.productId, 1)}
                      disabled={isPending}
                      aria-label="Aumentar quantidade"
                      className="rounded-md p-1 text-stone-500 hover:bg-stone-200"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromCart(line.productId)}
                      disabled={isPending}
                      aria-label="Remover item"
                      className="rounded-md p-1 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-1.5 border-t border-stone-200 pt-3">
            {advancePayment > 0 ? (
              <>
                <div className="flex items-center justify-between text-sm text-stone-600">
                  <span>Valor Total</span>
                  <span className="font-medium">{formatPrice(total)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-emerald-700">
                  <span>Sinal</span>
                  <span className="font-medium">
                    - {formatPrice(advancePayment)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-stone-100 pt-1.5">
                  <span className="text-sm font-medium text-stone-600">
                    Restante a Pagar
                  </span>
                  <span className="text-xl font-bold text-coffee-700">
                    {formatPrice(remaining)}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-stone-600">
                  Total
                </span>
                <span className="text-xl font-bold text-coffee-700">
                  {formatPrice(total)}
                </span>
              </div>
            )}
          </div>

          <Button
            type="button"
            onClick={handleFinalize}
            disabled={
              isPending ||
              cart.length === 0 ||
              !customerName.trim() ||
              advanceExceedsTotal
            }
            className={cn(
              "w-full bg-coffee-600 text-white hover:bg-coffee-700",
              "disabled:opacity-50"
            )}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar Pedido"
            )}
          </Button>
        </div>
      </aside>
    </div>
  );
}
