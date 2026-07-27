"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Props = {
  orderId: string;
  accessToken: string;
};

export function PendingPaymentPoller({ orderId, accessToken }: Props) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function poll() {
      try {
        const res = await fetch(
          `/api/orders/${orderId}/status?token=${encodeURIComponent(accessToken)}`,
          { signal: controller.signal, cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { paid?: boolean };
        if (data.paid) {
          router.replace(
            `/pedido/${orderId}/sucesso?token=${encodeURIComponent(accessToken)}`
          );
        }
      } catch {
        // abort / rede — tenta de novo no próximo intervalo
      }
    }

    void poll();
    const id = window.setInterval(poll, 4000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(id);
    };
  }, [orderId, accessToken, router]);

  return (
    <p className="mt-5 flex items-center justify-center gap-2 text-sm text-stone-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      Verificando confirmação automaticamente…
    </p>
  );
}
