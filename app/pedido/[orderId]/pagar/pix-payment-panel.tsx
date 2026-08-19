"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, QrCode } from "lucide-react";

import { formatPrice } from "@/lib/format";
import { formatCpfMask, normalizeCpf } from "@/lib/validation/cpf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PixViewState =
  | { kind: "loading" }
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "awaiting"; qrCode: string; qrCodeBase64: string; expiresAt: string | null }
  | { kind: "approved" }
  | { kind: "expired" }
  | { kind: "error"; message: string };

type StatusResponse = {
  paid?: boolean;
  orderStatus?: string;
  pix?: {
    status?: string;
    paymentId?: string;
    expiresAt?: string | null;
    qrCode?: string | null;
    qrCodeBase64?: string;
  } | null;
  error?: string;
};

type CreateResponse = {
  paid?: boolean;
  paymentId?: string;
  status?: string;
  qrCode?: string | null;
  qrCodeBase64?: string | null;
  expiresAt?: string | null;
  error?: string;
};

type Props = {
  orderId: string;
  accessToken: string;
  totalAmount: number;
};

function remainingLabel(expiresAt: string | null, nowMs: number): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return "Expirado";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export function PixPaymentPanel({ orderId, accessToken, totalAmount }: Props) {
  const router = useRouter();
  const [cpf, setCpf] = useState("");
  const [view, setView] = useState<PixViewState>({ kind: "loading" });
  const [copied, setCopied] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const inFlight = useRef(false);
  const pollTimer = useRef<number | null>(null);

  const goToSuccess = useCallback(() => {
    setView({ kind: "approved" });
    router.replace(
      `/pedido/${orderId}/sucesso?token=${encodeURIComponent(accessToken)}`
    );
  }, [accessToken, orderId, router]);

  const applyPaidOrTerminal = useCallback(
    (data: StatusResponse): boolean => {
      if (data.paid || data.orderStatus === "PAID" || data.orderStatus === "COMPLETED") {
        goToSuccess();
        return true;
      }
      if (
        data.orderStatus === "REQUIRES_REFUND" ||
        data.orderStatus === "CANCELED"
      ) {
        const motivo =
          data.orderStatus === "REQUIRES_REFUND"
            ? "Pagamento recebido, mas o item esgotou. Nossa equipe entrará em contato para reembolso ou ajuste."
            : "Pedido cancelado";
        router.replace(
          `/pedido/${orderId}/falha?token=${encodeURIComponent(accessToken)}&motivo=${encodeURIComponent(motivo)}`
        );
        return true;
      }
      if (data.pix?.status === "expired") {
        setView({ kind: "expired" });
        return true;
      }
      return false;
    },
    [accessToken, goToSuccess, orderId, router]
  );

  const fetchStatus = useCallback(
    async (includeQr: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const qs = new URLSearchParams({
          orderId,
          token: accessToken,
        });
        if (includeQr) qs.set("includeQr", "1");
        const res = await fetch(`/api/payment/pix?${qs.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as StatusResponse;
        if (applyPaidOrTerminal(data)) return;

        if (data.pix?.status === "expired") {
          setView({ kind: "expired" });
          return;
        }

        if (
          data.pix?.status === "pending" &&
          data.pix.qrCode &&
          (includeQr ? Boolean(data.pix.qrCodeBase64) : true)
        ) {
          setView((current) => {
            if (current.kind === "awaiting" && !includeQr) {
              return current;
            }
            const qrCodeBase64 =
              data.pix?.qrCodeBase64 ||
              (current.kind === "awaiting" ? current.qrCodeBase64 : "");
            if (!data.pix?.qrCode || !qrCodeBase64) {
              return current.kind === "loading" ? { kind: "idle" } : current;
            }
            return {
              kind: "awaiting",
              qrCode: data.pix.qrCode,
              qrCodeBase64,
              expiresAt: data.pix.expiresAt ?? null,
            };
          });
          return;
        }

        setView((current) =>
          current.kind === "loading" || current.kind === "generating"
            ? { kind: "idle" }
            : current
        );
      } catch {
        setView((current) =>
          current.kind === "loading" ? { kind: "idle" } : current
        );
      } finally {
        inFlight.current = false;
      }
    },
    [accessToken, applyPaidOrTerminal, orderId]
  );

  useEffect(() => {
    void fetchStatus(true);
  }, [fetchStatus]);

  useEffect(() => {
    if (view.kind !== "awaiting") {
      if (pollTimer.current != null) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }

    pollTimer.current = window.setInterval(() => {
      void fetchStatus(false);
    }, 4000);

    return () => {
      if (pollTimer.current != null) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [fetchStatus, view.kind]);

  useEffect(() => {
    if (view.kind !== "awaiting" || !view.expiresAt) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [view]);

  useEffect(() => {
    if (view.kind !== "awaiting" || !view.expiresAt) return;
    if (new Date(view.expiresAt).getTime() <= nowMs) {
      setView({ kind: "expired" });
    }
  }, [nowMs, view]);

  async function generatePix() {
    setView({ kind: "generating" });
    setCopied(false);
    try {
      const res = await fetch("/api/payment/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          accessToken,
          cpf: normalizeCpf(cpf),
        }),
      });
      const data = (await res.json()) as CreateResponse;

      if (res.status === 409 && data.paid) {
        goToSuccess();
        return;
      }

      if (!res.ok || !data.qrCode || !data.qrCodeBase64) {
        setView({
          kind: "error",
          message: data.error || "Não foi possível gerar o PIX.",
        });
        return;
      }

      setView({
        kind: "awaiting",
        qrCode: data.qrCode,
        qrCodeBase64: data.qrCodeBase64,
        expiresAt: data.expiresAt ?? null,
      });
    } catch {
      setView({
        kind: "error",
        message: "Não foi possível gerar o PIX. Verifique sua conexão e tente novamente.",
      });
    }
  }

  async function copyCode(qrCode: string) {
    try {
      await navigator.clipboard.writeText(qrCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const countdown =
    view.kind === "awaiting" ? remainingLabel(view.expiresAt, nowMs) : null;

  return (
    <div className="mt-5 space-y-4">
      {view.kind === "loading" && (
        <div
          role="status"
          className="flex flex-col items-center gap-2 py-8 text-stone-600"
        >
          <Loader2 className="h-6 w-6 animate-spin text-coffee-600" />
          <p className="text-sm font-medium">Carregando PIX...</p>
        </div>
      )}

      {view.kind === "idle" || view.kind === "error" || view.kind === "expired" ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pix-cpf">CPF do pagador</Label>
            <Input
              id="pix-cpf"
              name="cpf"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(event) => setCpf(formatCpfMask(event.target.value))}
              aria-describedby="pix-cpf-help"
              className="h-11"
            />
            <p id="pix-cpf-help" className="text-xs text-stone-500">
              Usado só para gerar o PIX no Mercado Pago. Não armazenamos o CPF.
            </p>
          </div>

          {view.kind === "error" && (
            <div
              role="alert"
              className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {view.message}
            </div>
          )}

          {view.kind === "expired" && (
            <div
              role="status"
              className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              Este PIX expirou. Gere um novo código para continuar.
            </div>
          )}

          <Button
            type="button"
            onClick={() => void generatePix()}
            disabled={normalizeCpf(cpf).length !== 11}
            className="h-12 w-full bg-coffee-600 text-white hover:bg-coffee-700 disabled:opacity-50"
          >
            <QrCode className="h-4 w-4" />
            {view.kind === "expired" ? "Gerar novo PIX" : "Gerar PIX"}
          </Button>
        </div>
      ) : null}

      {view.kind === "generating" && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-2 py-8 text-stone-600"
        >
          <Loader2 className="h-6 w-6 animate-spin text-coffee-600" />
          <p className="text-sm font-medium">Gerando seu PIX...</p>
        </div>
      )}

      {view.kind === "approved" && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-green-100 bg-green-50 px-4 py-5 text-center text-sm text-green-900"
        >
          <p className="font-semibold">Pagamento confirmado!</p>
          <p className="mt-1">
            Seu pedido foi recebido e já está sendo preparado.
          </p>
        </div>
      )}

      {view.kind === "awaiting" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-center">
            <p className="text-sm font-semibold text-emerald-900">
              Pagamento via PIX
            </p>
            <p className="mt-1 text-lg font-bold text-coffee-700">
              {formatPrice(totalAmount)}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${view.qrCodeBase64}`}
              alt="QR Code PIX para pagamento deste pedido. Use também o código copia e cola abaixo."
              width={220}
              height={220}
              className="mx-auto mt-3 h-52 w-52 rounded-lg bg-white p-2 shadow-sm sm:h-56 sm:w-56"
            />
            <p className="mt-3 text-sm text-stone-600">
              Escaneie o QR Code com o aplicativo do seu banco.
            </p>
            {countdown && (
              <p className="mt-1 text-xs text-stone-500" aria-live="polite">
                Expira em {countdown}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-center text-xs font-medium uppercase tracking-wide text-stone-400">
              ou
            </p>
            <Label htmlFor="pix-copy">PIX Copia e Cola</Label>
            <textarea
              id="pix-copy"
              readOnly
              value={view.qrCode}
              rows={3}
              className="w-full resize-none rounded-md border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Código PIX copia e cola"
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => void copyCode(view.qrCode)}
              aria-label="Copiar código PIX"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600" />
                  Código copiado
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copiar código
                </>
              )}
            </Button>
          </div>

          <p
            role="status"
            aria-live="polite"
            className="flex items-center justify-center gap-2 text-sm text-stone-500"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coffee-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-coffee-600" />
            </span>
            Aguardando confirmação do pagamento...
          </p>
          <p className="text-center text-xs text-stone-400">
            Verificando pagamento automaticamente. Não feche esta página.
          </p>
        </div>
      )}
    </div>
  );
}
