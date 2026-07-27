"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Lock, ShieldCheck } from "lucide-react";

import { startCheckoutProPayment } from "@/app/checkout/actions";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";

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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [autoStarted, setAutoStarted] = useState(false);

  function goToMercadoPago() {
    setError(null);
    startTransition(async () => {
      const result = await startCheckoutProPayment({ orderId, accessToken });
      if (!result.success) {
        setError(result.error);
        return;
      }
      window.location.assign(result.checkoutUrl);
    });
  }

  useEffect(() => {
    if (autoStarted) return;
    setAutoStarted(true);
    goToMercadoPago();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redireciona uma vez ao montar
  }, []);

  const firstName = customerName.split(" ")[0] || "cliente";
  const shortId = orderId.slice(-8).toUpperCase();

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-coffee-50 text-coffee-700">
            {isPending ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : (
              <Lock className="h-7 w-7" />
            )}
          </span>
          <p className="mt-4 text-sm font-medium text-coffee-700">
            Pagamento seguro
          </p>
          <h1 className="mt-1 font-serif text-2xl font-bold text-stone-800">
            {isPending
              ? "Abrindo o Mercado Pago…"
              : "Pague no Mercado Pago"}
          </h1>
          <p className="mt-3 text-stone-500">
            Olá, {firstName}. Você será redirecionado para a página oficial do
            Mercado Pago para pagar com PIX, crédito ou débito. Depois volta
            automaticamente para cá.
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

        {error && (
          <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-3">
          <Button
            type="button"
            disabled={isPending}
            onClick={goToMercadoPago}
            className="h-12 w-full bg-coffee-600 text-white hover:bg-coffee-700"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecionando…
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4" />
                Ir para o Mercado Pago
              </>
            )}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-stone-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Você paga no site do Mercado Pago — não digitamos dados do cartão
            aqui.
          </p>
          <Button asChild variant="outline" className="h-11 w-full">
            <Link href="/">Voltar ao cardápio</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
