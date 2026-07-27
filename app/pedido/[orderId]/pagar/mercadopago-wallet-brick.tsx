"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { initMercadoPago } from "@mercadopago/sdk-react";
import { ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

const Wallet = dynamic(
  () => import("@mercadopago/sdk-react").then((mod) => mod.Wallet),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-12 items-center justify-center gap-2 text-sm text-stone-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando botão do Mercado Pago…
      </div>
    ),
  }
);

type Props = {
  publicKey: string;
  preferenceId: string;
  /** Fallback se o Brick falhar (init_point / sandbox_init_point). */
  checkoutUrl: string;
};

/**
 * Wallet Brick (Checkout Pro) — SDK MercadoPago.js no frontend.
 * Renderiza o botão oficial; o comprador vai ao ambiente do Mercado Pago.
 */
export function MercadoPagoWalletBrick({
  publicKey,
  preferenceId,
  checkoutUrl,
}: Props) {
  const [ready, setReady] = useState(false);
  const [brickError, setBrickError] = useState(false);

  useEffect(() => {
    try {
      initMercadoPago(publicKey, { locale: "pt-BR" });
      setReady(true);
      setBrickError(false);
    } catch (error) {
      console.error("initMercadoPago:", error);
      setBrickError(true);
    }
  }, [publicKey]);

  if (brickError) {
    return (
      <div className="space-y-3">
        <p className="text-center text-sm text-amber-800">
          Não foi possível carregar o botão oficial. Use o link abaixo.
        </p>
        <Button asChild className="h-12 w-full bg-coffee-600 text-white hover:bg-coffee-700">
          <a href={checkoutUrl}>
            <ExternalLink className="h-4 w-4" />
            Abrir Mercado Pago
          </a>
        </Button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-12 items-center justify-center gap-2 text-sm text-stone-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparando pagamento…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Container do botão oficial do Mercado Pago (Wallet Brick) */}
      <div id="walletBrick_container" className="min-h-[48px] w-full">
        <Wallet
          key={preferenceId}
          initialization={{ preferenceId }}
          onError={(error) => {
            console.error("Wallet Brick error:", error);
            setBrickError(true);
          }}
        />
      </div>
      <p className="text-center text-xs text-stone-400">
        Ou{" "}
        <a
          href={checkoutUrl}
          className="underline underline-offset-2 hover:text-stone-600"
        >
          abrir o Mercado Pago em nova página
        </a>
      </p>
    </div>
  );
}
