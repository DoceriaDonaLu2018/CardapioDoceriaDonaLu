"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Lock, MapPin } from "lucide-react";

import { createOnlineOrder } from "@/app/checkout/actions";
import { useCart } from "@/components/cart/cart-context";
import { formatPhone, formatPrice } from "@/lib/format";
import { STORE_ADDRESS } from "@/lib/store-info";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FulfillmentMode = "pickup" | "scheduled";

export function CheckoutForm({
  pickupSlots,
  hoursLabel,
}: {
  pickupSlots: string[];
  hoursLabel: string;
}) {
  const router = useRouter();
  const { items, total, clear } = useCart();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [fulfillmentMode, setFulfillmentMode] =
    useState<FulfillmentMode>("pickup");
  const [pickupTime, setPickupTime] = useState(pickupSlots[0] ?? "");
  const [deliveryDate, setDeliveryDate] = useState("");

  const minDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const canSubmit = useMemo(() => {
    if (items.length === 0 || isPending || !pickupTime) return false;
    if (fulfillmentMode === "scheduled" && !deliveryDate) return false;
    return true;
  }, [
    items.length,
    isPending,
    pickupTime,
    fulfillmentMode,
    deliveryDate,
  ]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);

    startTransition(async () => {
      const result = await createOnlineOrder({
        customerName,
        customerPhone,
        customerEmail,
        deliveryNotes,
        fulfillmentMode,
        pickupTime,
        deliveryDate:
          fulfillmentMode === "scheduled" ? deliveryDate : undefined,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      clear();
      router.push(
        `/pedido/${result.orderId}/pagar?token=${encodeURIComponent(result.accessToken)}`
      );
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
        <p className="text-stone-600">Seu carrinho está vazio.</p>
        <Button
          asChild
          className="mt-4 bg-coffee-600 text-white hover:bg-coffee-700"
        >
          <Link href="/">Voltar ao cardápio</Link>
        </Button>
      </div>
    );
  }

  if (pickupSlots.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <p className="text-amber-900">
          Nenhum horário de retirada configurado no momento. Tente novamente
          mais tarde ou fale conosco pelo WhatsApp.
        </p>
        <Button asChild className="mt-4 bg-coffee-600 text-white hover:bg-coffee-700">
          <Link href="/">Voltar ao cardápio</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]"
    >
      <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
        <div>
          <h2 className="font-serif text-xl font-bold text-stone-800">
            Dados do pedido
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Sem cadastro e sem senha — retirada no local.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-coffee-100 bg-coffee-50/70 px-4 py-3">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-coffee-700" />
          <div>
            <p className="text-sm font-semibold text-coffee-800">
              Retirada no local
            </p>
            <p className="mt-0.5 text-sm font-medium text-coffee-800/90">
              {STORE_ADDRESS}
            </p>
            <p className="mt-1 text-sm text-coffee-700/80">{hoursLabel}</p>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Tipo do pedido</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setFulfillmentMode("pickup")}
              className={cn(
                "rounded-xl border px-3 py-3 text-left text-sm transition",
                fulfillmentMode === "pickup"
                  ? "border-coffee-600 bg-coffee-50 ring-1 ring-coffee-600"
                  : "border-stone-200 bg-white hover:border-stone-300"
              )}
            >
              <span className="block font-semibold text-stone-800">
                Retirada
              </span>
              <span className="mt-0.5 block text-stone-500">
                Escolha o horário para buscar hoje.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFulfillmentMode("scheduled")}
              className={cn(
                "rounded-xl border px-3 py-3 text-left text-sm transition",
                fulfillmentMode === "scheduled"
                  ? "border-coffee-600 bg-coffee-50 ring-1 ring-coffee-600"
                  : "border-stone-200 bg-white hover:border-stone-300"
              )}
            >
              <span className="block font-semibold text-stone-800">
                Encomenda
              </span>
              <span className="mt-0.5 block text-stone-500">
                Agende data e horário de retirada.
              </span>
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {fulfillmentMode === "scheduled" && (
            <div className="space-y-2">
              <Label htmlFor="deliveryDate">Data da encomenda</Label>
              <Input
                id="deliveryDate"
                type="date"
                required
                min={minDate}
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                disabled={isPending}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Horário de retirada</Label>
            <Select
              value={pickupTime || undefined}
              onValueChange={setPickupTime}
              disabled={isPending}
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {pickupSlots.map((slot) => (
                  <SelectItem key={slot} value={slot}>
                    {slot}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="customerName">Nome completo</Label>
          <Input
            id="customerName"
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Maria Silva"
            autoComplete="name"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customerPhone">WhatsApp</Label>
            <Input
              id="customerPhone"
              required
              inputMode="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(formatPhone(e.target.value))}
              placeholder="(11) 96486-2693"
              autoComplete="tel"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerEmail">E-mail</Label>
            <Input
              id="customerEmail"
              type="email"
              required
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="voce@email.com"
              autoComplete="email"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="deliveryNotes">Observações (opcional)</Label>
          <Textarea
            id="deliveryNotes"
            rows={2}
            value={deliveryNotes}
            onChange={(e) => setDeliveryNotes(e.target.value)}
            placeholder="Detalhes do pedido…"
          />
        </div>
      </div>

      <aside className="h-fit space-y-4 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 lg:sticky lg:top-24">
        <h2 className="font-serif text-xl font-bold text-stone-800">Resumo</h2>
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.productId} className="flex gap-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-stone-100">
                <Image
                  src={item.imageUrl}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-800">
                  {item.quantity}× {item.title}
                </p>
                <p className="text-sm text-coffee-700">
                  {formatPrice(item.price * item.quantity)}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-1 border-t border-stone-100 pt-3 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-stone-500">Modalidade</span>
            <span className="font-medium text-stone-800">
              {fulfillmentMode === "scheduled" ? "Encomenda" : "Retirada"}
            </span>
          </div>
          {fulfillmentMode === "scheduled" && deliveryDate && (
            <div className="flex justify-between gap-2">
              <span className="text-stone-500">Data</span>
              <span className="font-medium text-stone-800">
                {deliveryDate.split("-").reverse().join("/")}
              </span>
            </div>
          )}
          {pickupTime && (
            <div className="flex justify-between gap-2">
              <span className="text-stone-500">Horário</span>
              <span className="font-medium text-stone-800">{pickupTime}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-stone-100 pt-3">
          <span className="text-stone-500">Total</span>
          <span className="text-xl font-bold text-stone-800">
            {formatPrice(total)}
          </span>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={!canSubmit}
          className="h-12 w-full bg-coffee-600 text-base text-white hover:bg-coffee-700"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparando pagamento…
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" />
              Escolher forma de pagamento
            </>
          )}
        </Button>

        <p className="text-center text-xs text-stone-400">
          Na próxima tela você escolhe PIX ou cartão e paga no Mercado Pago. O
          pedido só vai para a cozinha após a confirmação do pagamento.
        </p>
      </aside>
    </form>
  );
}
