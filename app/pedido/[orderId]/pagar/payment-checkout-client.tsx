"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  CreditCard,
  ExternalLink,
  Loader2,
  Lock,
  QrCode,
  ShieldCheck,
} from "lucide-react";

import { startCheckoutProPayment } from "@/app/checkout/actions";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PaymentChoice = "pix" | "card";

type Props = {
  orderId: string;
  accessToken: string;
  totalAmount: number;
  customerName: string;
};

export function PaymentCheckoutClient({
  orderId,
  accessToken,
  totalAmount,
  customerName,
}: Props) {
  const [choice, setChoice] = useState<PaymentChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function goToMercadoPago() {
    if (!choice) {
      setError("Escolha PIX ou cartão para continuar.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await startCheckoutProPayment({
        orderId,
        accessToken,
        paymentChoice: choice,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      window.location.assign(result.checkoutUrl);
    });
  }

  const firstName = customerName.split(" ")[0] || "cliente";
  const shortId = orderId.slice(-8).toUpperCase();

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-coffee-50 text-coffee-700">
            <Lock className="h-7 w-7" />
          </span>
          <p className="mt-4 text-sm font-medium text-coffee-700">
            Pagamento seguro
          </p>
          <h1 className="mt-1 font-serif text-2xl font-bold text-stone-800">
            Como você quer pagar?
          </h1>
          <p className="mt-3 text-stone-500">
            Olá, {firstName}. Escolha o meio de pagamento e continue no Mercado
            Pago. Depois você volta automaticamente para cá.
          </p>
        </div>

        <div className="mt-6 space-y-2 rounded-xl bg-stone-50 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-stone-500">Pedido</span>
            <span className="font-semibold text-stone-800">#{shortId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Total</span>
            <span className="font-semibold text-coffee-700">
              {formatPrice(totalAmount)}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setChoice("pix");
              setError(null);
            }}
            className={cn(
              "flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition",
              choice === "pix"
                ? "border-coffee-600 bg-coffee-50 ring-1 ring-coffee-600"
                : "border-stone-200 bg-white hover:border-stone-300"
            )}
          >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <QrCode className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-semibold text-stone-800">PIX</span>
              <span className="mt-0.5 block text-sm text-stone-500">
                Pagamento instantâneo no app do seu banco.
              </span>
            </span>
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setChoice("card");
              setError(null);
            }}
            className={cn(
              "flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition",
              choice === "card"
                ? "border-coffee-600 bg-coffee-50 ring-1 ring-coffee-600"
                : "border-stone-200 bg-white hover:border-stone-300"
            )}
          >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <CreditCard className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-semibold text-stone-800">
                Cartão de crédito ou débito
              </span>
              <span className="mt-0.5 block text-sm text-stone-500">
                Você informa os dados com segurança no Mercado Pago.
              </span>
            </span>
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-3">
          <Button
            type="button"
            disabled={isPending || !choice}
            onClick={goToMercadoPago}
            className="h-12 w-full bg-coffee-600 text-white hover:bg-coffee-700 disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Abrindo Mercado Pago…
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4" />
                Continuar no Mercado Pago
              </>
            )}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-stone-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            O pagamento é feito no site do Mercado Pago.
          </p>
          <Button asChild variant="outline" className="h-11 w-full">
            <Link href="/">Voltar ao cardápio</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
