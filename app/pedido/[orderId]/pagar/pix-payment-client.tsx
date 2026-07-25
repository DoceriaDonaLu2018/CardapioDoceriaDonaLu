"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";

import { formatPrice } from "@/lib/format";
import { OrderStatus } from "@/lib/orders/constants";
import { Button } from "@/components/ui/button";

type PixPaymentClientProps = {
  orderId: string;
  accessToken: string;
  totalAmount: number;
  pixCopyPaste: string;
  pixQrCodeBase64: string | null;
  customerName: string;
};

export function PixPaymentClient({
  orderId,
  accessToken,
  totalAmount,
  pixCopyPaste,
  pixQrCodeBase64,
  customerName,
}: PixPaymentClientProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [statusLabel, setStatusLabel] = useState("Aguardando pagamento…");

  const goSuccess = useCallback(() => {
    router.replace(
      `/pedido/${orderId}/sucesso?token=${encodeURIComponent(accessToken)}`
    );
  }, [router, orderId, accessToken]);

  // Polling leve 4s — o webhook atualiza PAID no banco; aqui só lemos o status.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const res = await fetch(
          `/api/orders/${orderId}/status?token=${encodeURIComponent(accessToken)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          status?: string;
          paid?: boolean;
        };
        if (cancelled) return;

        if (data.paid || data.status === OrderStatus.PAID) {
          setStatusLabel("Pagamento confirmado!");
          goSuccess();
          return;
        }

        if (data.status === OrderStatus.CANCELED) {
          setStatusLabel("Este pedido foi cancelado.");
          return;
        }

        setStatusLabel("Aguardando confirmação do PIX…");
      } catch {
        // Mantém polling mesmo com falha pontual de rede.
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(poll, 4000);
        }
      }
    }

    poll();

    const onVisibility = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [orderId, accessToken, goSuccess]);

  async function copyPix() {
    try {
      await navigator.clipboard.writeText(pixCopyPaste);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: seleciona via prompt em ambientes sem clipboard API.
      window.prompt("Copie o código PIX:", pixCopyPaste);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <p className="text-sm font-medium text-coffee-700">Pagamento PIX</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-stone-800">
          Quase lá, {customerName.split(" ")[0]}!
        </h1>
        <p className="mt-2 text-stone-500">
          Escaneie o QR Code ou use o Copia e Cola. Assim que o pagamento for
          confirmado, esta página atualiza sozinha.
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-stone-500">Total</span>
          <span className="text-2xl font-bold text-coffee-700">
            {formatPrice(totalAmount)}
          </span>
        </div>

        <div className="mx-auto flex aspect-square w-full max-w-[260px] items-center justify-center overflow-hidden rounded-xl border border-stone-100 bg-white p-3">
          {pixQrCodeBase64 ? (
            // eslint-disable-next-line @next/next/no-img-element -- QR base64 do gateway
            <img
              src={`data:image/png;base64,${pixQrCodeBase64}`}
              alt="QR Code PIX"
              width={240}
              height={240}
              className="h-full w-full object-contain"
            />
          ) : (
            <p className="px-4 text-center text-sm text-stone-500">
              Use o código Copia e Cola abaixo no app do seu banco.
            </p>
          )}
        </div>

        <div className="mt-5 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
            PIX Copia e Cola
          </p>
          <div className="break-all rounded-lg bg-stone-50 p-3 font-mono text-xs text-stone-700">
            {pixCopyPaste}
          </div>
          <Button
            type="button"
            onClick={copyPix}
            className="h-11 w-full bg-coffee-600 text-white hover:bg-coffee-700"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Código copiado
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copiar código PIX
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-sm text-stone-500">
        <Loader2 className="h-4 w-4 animate-spin text-coffee-600" />
        {statusLabel}
      </div>

      <p className="text-center text-xs text-stone-400">
        Pedido #{orderId.slice(-8).toUpperCase()} · A cozinha só recebe após o
        pagamento.
      </p>
    </div>
  );
}
