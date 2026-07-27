"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Check, Copy, CreditCard, Loader2, QrCode } from "lucide-react";
import { initMercadoPago } from "@mercadopago/sdk-react";

import {
  ensurePixForOrder,
  payOrderWithCard,
} from "@/app/checkout/actions";
import { formatPrice } from "@/lib/format";
import { OrderStatus } from "@/lib/orders/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const CardPayment = dynamic(
  () => import("@mercadopago/sdk-react").then((mod) => mod.CardPayment),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-48 items-center justify-center gap-2 text-sm text-stone-500">
        <Loader2 className="h-4 w-4 animate-spin text-coffee-600" />
        Carregando formulário seguro…
      </div>
    ),
  }
);

type Method = "pix" | "card";

type PaymentCheckoutClientProps = {
  orderId: string;
  accessToken: string;
  totalAmount: number;
  customerName: string;
  customerEmail: string;
  initialPixCopyPaste: string | null;
  initialPixQrCodeBase64: string | null;
  publicKey: string | null;
};

type CardFormData = {
  token: string;
  payment_method_id: string;
  installments: number;
  issuer_id?: string | number;
  payer?: {
    email?: string;
    identification?: { type: string; number: string };
  };
};

export function PaymentCheckoutClient({
  orderId,
  accessToken,
  totalAmount,
  customerName,
  customerEmail,
  initialPixCopyPaste,
  initialPixQrCodeBase64,
  publicKey,
}: PaymentCheckoutClientProps) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("pix");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusLabel, setStatusLabel] = useState("Escolha a forma de pagamento");
  const [pixCopyPaste, setPixCopyPaste] = useState(initialPixCopyPaste);
  const [pixQrCodeBase64, setPixQrCodeBase64] = useState(
    initialPixQrCodeBase64
  );
  const [pixLoading, startPixTransition] = useTransition();
  const [mpReady, setMpReady] = useState(false);
  const [phase, setPhase] = useState<"checkout" | "processing" | "pending">(
    "checkout"
  );

  const firstName = useMemo(
    () => customerName.split(" ")[0] || "cliente",
    [customerName]
  );

  const goSuccess = useCallback(() => {
    router.replace(
      `/pedido/${orderId}/sucesso?token=${encodeURIComponent(accessToken)}`
    );
  }, [router, orderId, accessToken]);

  const goFailure = useCallback(
    (motivo: string) => {
      router.replace(
        `/pedido/${orderId}/falha?token=${encodeURIComponent(accessToken)}&motivo=${encodeURIComponent(motivo)}`
      );
    },
    [router, orderId, accessToken]
  );

  // Inicializa o SDK do Brick (Public Key — nunca o Access Token).
  useEffect(() => {
    if (!publicKey) return;
    initMercadoPago(publicKey, { locale: "pt-BR" });
    setMpReady(true);
  }, [publicKey]);

  // Gera PIX sob demanda ao escolher a aba.
  useEffect(() => {
    if (method !== "pix" || pixCopyPaste) return;
    setError(null);
    startPixTransition(async () => {
      const result = await ensurePixForOrder({ orderId, accessToken });
      if (!result.success) {
        // Erros de credencial/gateway: tela amigável de falha com retry.
        goFailure(result.error);
        return;
      }
      setPixCopyPaste(result.pixCopyPaste);
      setPixQrCodeBase64(result.pixQrCodeBase64);
      setStatusLabel("Aguardando confirmação do PIX…");
    });
  }, [method, pixCopyPaste, orderId, accessToken, goFailure]);

  // Polling — funciona para PIX e cartão pendente.
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
      } catch {
        // ignora falha pontual
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
    if (!pixCopyPaste) return;
    try {
      await navigator.clipboard.writeText(pixCopyPaste);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copie o código PIX:", pixCopyPaste);
    }
  }

  async function handleCardSubmit(formData: CardFormData) {
    setError(null);
    setPhase("processing");
    setStatusLabel("Processando seu pagamento…");

    const result = await payOrderWithCard({
      orderId,
      accessToken,
      token: formData.token,
      paymentMethodId: formData.payment_method_id,
      installments: formData.installments,
      issuerId: formData.issuer_id ?? null,
      identificationType: formData.payer?.identification?.type || "CPF",
      identificationNumber: formData.payer?.identification?.number || "",
    });

    if (!result.success) {
      goFailure(result.error);
      throw new Error(result.error);
    }

    if (result.paid) {
      setStatusLabel("Pagamento confirmado!");
      goSuccess();
      return;
    }

    // Cartão em análise (pending/in_process): fica na tela aguardando webhook.
    setPhase("pending");
    setStatusLabel(
      "Pagamento em análise no banco. Assim que confirmar, você será redirecionado…"
    );
  }

  if (phase === "processing" || phase === "pending") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-stone-200 bg-white px-6 py-14 text-center shadow-sm">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-coffee-50 text-coffee-700">
          <Loader2 className="h-8 w-8 animate-spin" />
        </span>
        <h1 className="mt-5 font-serif text-2xl font-bold text-stone-800">
          {phase === "processing"
            ? "Registrando seu pagamento…"
            : "Quase lá — aguardando o banco"}
        </h1>
        <p className="mt-3 max-w-sm text-stone-500">
          {phase === "processing"
            ? "Estamos confirmando com o Mercado Pago. Não feche esta página."
            : "Seu pagamento está em análise. Assim que for aprovado, o pedido entra na cozinha e você verá a confirmação automaticamente."}
        </p>
        <p className="mt-6 text-sm text-stone-400">
          Pedido #{orderId.slice(-8).toUpperCase()} · {formatPrice(totalAmount)}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <p className="text-sm font-medium text-coffee-700">Pagamento seguro</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-stone-800">
          Quase lá, {firstName}!
        </h1>
        <p className="mt-2 text-stone-500">
          Escolha PIX ou cartão de crédito/débito. Assim que o pagamento for
          confirmado, esta página atualiza sozinha.
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-stone-500">Total</span>
          <span className="text-2xl font-bold text-coffee-700">
            {formatPrice(totalAmount)}
          </span>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMethod("pix");
              setError(null);
            }}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
              method === "pix"
                ? "bg-white text-coffee-800 shadow-sm"
                : "text-stone-600 hover:text-stone-800"
            )}
          >
            <QrCode className="h-4 w-4" />
            PIX
          </button>
          <button
            type="button"
            onClick={() => {
              setMethod("card");
              setError(null);
              setStatusLabel("Preencha os dados do cartão");
            }}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
              method === "card"
                ? "bg-white text-coffee-800 shadow-sm"
                : "text-stone-600 hover:text-stone-800"
            )}
          >
            <CreditCard className="h-4 w-4" />
            Crédito / Débito
          </button>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        {method === "pix" ? (
          <div className="space-y-4">
            {pixLoading && !pixCopyPaste ? (
              <div className="flex h-48 items-center justify-center gap-2 text-sm text-stone-500">
                <Loader2 className="h-4 w-4 animate-spin text-coffee-600" />
                Gerando PIX…
              </div>
            ) : pixCopyPaste ? (
              <>
                <div className="mx-auto flex aspect-square w-full max-w-[240px] items-center justify-center overflow-hidden rounded-xl border border-stone-100 bg-white p-3">
                  {pixQrCodeBase64 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:image/png;base64,${pixQrCodeBase64}`}
                      alt="QR Code PIX"
                      width={220}
                      height={220}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <p className="px-4 text-center text-sm text-stone-500">
                      Use o código Copia e Cola abaixo.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
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
              </>
            ) : (
              <p className="py-8 text-center text-sm text-stone-500">
                Não foi possível carregar o PIX. Troque de aba e tente de novo.
              </p>
            )}
          </div>
        ) : (
          <div className="min-h-[280px]">
            {!publicKey ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Falta configurar{" "}
                <code className="font-mono text-xs">
                  NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY
                </code>{" "}
                no Vercel (Public Key do mesmo modo do Access Token).
              </p>
            ) : mpReady ? (
              <CardPayment
                initialization={{
                  amount: totalAmount,
                  payer: { email: customerEmail },
                }}
                customization={{
                  paymentMethods: {
                    maxInstallments: 12,
                    types: {
                      included: ["credit_card", "debit_card"],
                    },
                  },
                }}
                onSubmit={async (formData) => {
                  await handleCardSubmit(formData as CardFormData);
                }}
                onError={(brickError) => {
                  console.error("CardPayment Brick error:", brickError);
                  setError("Não foi possível carregar o formulário de cartão.");
                }}
              />
            ) : (
              <div className="flex h-48 items-center justify-center gap-2 text-sm text-stone-500">
                <Loader2 className="h-4 w-4 animate-spin text-coffee-600" />
                Carregando formulário seguro…
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 text-sm text-stone-500">
        <Loader2 className="h-4 w-4 animate-spin text-coffee-600" />
        {statusLabel}
      </div>

      <p className="text-center text-xs text-stone-400">
        Pedido #{orderId.slice(-8).toUpperCase()} · Dados do cartão ficam só no
        Mercado Pago (PCI). A cozinha só recebe após o pagamento.
      </p>
    </div>
  );
}
