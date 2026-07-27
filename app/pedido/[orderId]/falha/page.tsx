import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertCircle, CreditCard, QrCode, RotateCcw } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/orders/constants";
import { formatPrice } from "@/lib/format";
import { parseMercadoPagoReturnParams } from "@/lib/payments/mp-return";
import { Button } from "@/components/ui/button";

import { failureMotivoSchema } from "@/lib/validation/safe-input";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function friendlyReason(motivo?: string | null): string {
  const capped = failureMotivoSchema.safeParse(motivo ?? "");
  const raw = capped.success ? capped.data.trim() : "";
  if (!raw) {
    return "Não conseguimos confirmar o pagamento. Nenhuma cobrança definitiva foi registrada neste pedido, ou o banco recusou a operação.";
  }

  const lower = raw.toLowerCase();
  if (lower.includes("limite") || lower.includes("insufficient")) {
    return "O banco recusou por limite insuficiente. Tente outro cartão ou pague com PIX.";
  }
  if (lower.includes("cvv") || lower.includes("security")) {
    return "O código de segurança (CVV) parece incorreto. Revise os dados e tente novamente.";
  }
  if (lower.includes("validade") || lower.includes("date")) {
    return "A data de validade do cartão parece incorreta. Revise e tente de novo.";
  }
  if (lower.includes("credencial") || lower.includes("unauthorized")) {
    return "Houve um problema na configuração do pagamento. Se o erro continuar, fale com a doceria.";
  }
  if (lower.includes("rejected") || lower.includes("recus")) {
    return "O pagamento foi recusado. Tente novamente com outro meio no Mercado Pago.";
  }
  if (lower.includes("cancelled") || lower.includes("canceled")) {
    return "O pagamento foi cancelado antes de concluir.";
  }
  return raw;
}

export default async function PedidoFalhaPage({
  params,
  searchParams,
}: PageProps) {
  const { orderId } = await params;
  const qs = await searchParams;
  const token = typeof qs.token === "string" ? qs.token : null;
  if (!token) notFound();

  const mp = parseMercadoPagoReturnParams(qs);
  if (mp.externalReference && mp.externalReference !== orderId) {
    notFound();
  }

  // Se o MP redirecionou para failure mas o status veio approved/pending, corrige a rota.
  if (mp.status === "approved") {
    redirect(
      `/pedido/${orderId}/sucesso?token=${encodeURIComponent(token)}${
        mp.paymentId ? `&payment_id=${encodeURIComponent(mp.paymentId)}` : ""
      }`
    );
  }
  if (mp.status === "pending" || mp.status === "in_process") {
    redirect(
      `/pedido/${orderId}/pendente?token=${encodeURIComponent(token)}${
        mp.paymentId ? `&payment_id=${encodeURIComponent(mp.paymentId)}` : ""
      }`
    );
  }

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      paymentAccessToken: token,
      source: "ONLINE",
    },
    select: {
      id: true,
      status: true,
      customerName: true,
      totalAmount: true,
      paymentAccessToken: true,
    },
  });

  if (!order || !order.paymentAccessToken) notFound();

  if (
    order.status === OrderStatus.PAID ||
    order.status === OrderStatus.COMPLETED
  ) {
    redirect(
      `/pedido/${order.id}/sucesso?token=${encodeURIComponent(order.paymentAccessToken)}`
    );
  }

  const firstName = order.customerName.split(" ")[0] || "cliente";
  const shortId = order.id.slice(-8).toUpperCase();
  const payUrl = `/pedido/${order.id}/pagar?token=${encodeURIComponent(order.paymentAccessToken)}`;
  const motivoFromQs = typeof qs.motivo === "string" ? qs.motivo : null;
  const reason = friendlyReason(
    motivoFromQs || (mp.status ? `Pagamento ${mp.status}` : null)
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertCircle className="h-9 w-9" />
          </span>
          <p className="mt-4 text-sm font-medium text-red-700">
            Pagamento não concluído
          </p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-stone-800">
            Seu pedido ainda não foi efetuado
          </h1>
          <p className="mt-3 max-w-sm text-stone-500">
            Olá, {firstName}. O pagamento no Mercado Pago não foi finalizado —
            você pode tentar de novo com segurança.
          </p>
        </div>

        <div className="mt-6 rounded-xl border border-red-100 bg-red-50/70 px-4 py-3 text-sm text-red-900">
          <p className="font-medium">O que aconteceu</p>
          <p className="mt-1 text-red-800/90">{reason}</p>
        </div>

        <div className="mt-5 space-y-2 rounded-xl bg-stone-50 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-stone-500">Pedido</span>
            <span className="font-semibold text-stone-800">#{shortId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Valor</span>
            <span className="font-semibold text-coffee-700">
              {formatPrice(order.totalAmount)}
            </span>
          </div>
        </div>

        <div className="mt-6 space-y-2 text-sm text-stone-600">
          <p className="font-medium text-stone-800">O que você pode fazer</p>
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <QrCode className="mt-0.5 h-4 w-4 shrink-0 text-coffee-600" />
              <span>Pagar com PIX no Mercado Pago.</span>
            </li>
            <li className="flex items-start gap-2">
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-coffee-600" />
              <span>
                Tentar crédito ou débito na mesma tela do Mercado Pago.
              </span>
            </li>
          </ul>
        </div>

        <div className="mt-8 space-y-3">
          {order.status === OrderStatus.AWAITING_PAYMENT ? (
            <Button
              asChild
              className="h-12 w-full bg-coffee-600 text-white hover:bg-coffee-700"
            >
              <Link href={payUrl}>
                <RotateCcw className="h-4 w-4" />
                Tentar pagar novamente
              </Link>
            </Button>
          ) : (
            <Button
              asChild
              className="h-12 w-full bg-coffee-600 text-white hover:bg-coffee-700"
            >
              <Link href="/checkout">Voltar ao checkout</Link>
            </Button>
          )}
          <Button asChild variant="outline" className="h-11 w-full">
            <Link href="/">Voltar ao cardápio</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
