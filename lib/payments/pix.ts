import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { OrderSource, OrderStatus } from "@/lib/orders/constants";
import {
  cancelMercadoPagoPayment,
  createPixPayment,
  mapMercadoPagoError,
} from "@/lib/payments/mercadopago";
import { PaymentAuditEvent, recordPaymentAudit } from "@/lib/payments/audit";
import {
  isPixReusable,
  mapMercadoPagoStatusToPix,
  PixPaymentStatus,
  splitPayerName,
} from "@/lib/payments/pix-status";
import { isValidCpf, normalizeCpf } from "@/lib/validation/cpf";

const DEFAULT_PIX_MINUTES = 30;
const PIX_MIN_MINUTES = 30;
const PIX_MAX_MINUTES = 30 * 24 * 60;

export type PixPublicPayload = {
  status: string;
  paymentId: string;
  expiresAt: string | null;
  qrCode: string | null;
  qrCodeBase64?: string;
};

function pixExpirationDate(): Date {
  const raw = Number(process.env.MERCADOPAGO_PIX_EXPIRATION_MINUTES ?? DEFAULT_PIX_MINUTES);
  const minutes = Number.isFinite(raw)
    ? Math.min(PIX_MAX_MINUTES, Math.max(PIX_MIN_MINUTES, Math.round(raw)))
    : DEFAULT_PIX_MINUTES;
  // +60s evita rejeição do MP na borda de 30 minutos por skew de relógio.
  return new Date(Date.now() + minutes * 60 * 1000 + 60_000);
}

function toPublicPix(
  row: {
    providerPaymentId: string;
    status: string;
    expiresAt: Date | null;
    qrCode: string | null;
    qrCodeBase64: string | null;
  },
  includeQr: boolean
): PixPublicPayload {
  return {
    status: row.status,
    paymentId: row.providerPaymentId,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    qrCode: row.qrCode,
    ...(includeQr && row.qrCodeBase64
      ? { qrCodeBase64: row.qrCodeBase64 }
      : {}),
  };
}

async function markExpiredIfNeeded(params: {
  id: string;
  status: string;
  expiresAt: Date | null;
}): Promise<boolean> {
  if (!isPixReusable({ status: params.status, expiresAt: params.expiresAt })) {
    if (
      params.status === PixPaymentStatus.PENDING &&
      params.expiresAt &&
      params.expiresAt.getTime() <= Date.now()
    ) {
      await prisma.payment.updateMany({
        where: { id: params.id, status: PixPaymentStatus.PENDING },
        data: { status: PixPaymentStatus.EXPIRED },
      });
      return true;
    }
  }
  return false;
}

/**
 * Cancela PIX pendentes no gateway e marca como cancelled.
 * Usado ao gerar novo PIX, ao ir para Checkout Pro, e após o pedido ser pago.
 */
export async function cancelPendingPixForOrder(
  orderId: string,
  keepProviderPaymentId?: string
): Promise<void> {
  const pending = await prisma.payment.findMany({
    where: {
      orderId,
      method: "pix",
      status: { in: [PixPaymentStatus.PENDING, PixPaymentStatus.EXPIRED] },
      ...(keepProviderPaymentId
        ? { providerPaymentId: { not: keepProviderPaymentId } }
        : {}),
    },
    select: { id: true, providerPaymentId: true },
  });

  for (const row of pending) {
    try {
      await cancelMercadoPagoPayment(row.providerPaymentId);
    } catch (error) {
      console.error("pix cancel gateway failed", {
        orderId,
        paymentId: row.providerPaymentId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }

    await prisma.payment.updateMany({
      where: {
        id: row.id,
        status: { in: [PixPaymentStatus.PENDING, PixPaymentStatus.EXPIRED] },
      },
      data: { status: PixPaymentStatus.CANCELLED },
    });
  }
}

export async function getPixStatusForOrder(params: {
  orderId: string;
  accessToken: string;
  includeQr: boolean;
}): Promise<
  | { ok: true; paid: boolean; orderStatus: string; pix: PixPublicPayload | null }
  | { ok: false; error: string; httpStatus: number }
> {
  const order = await prisma.order.findFirst({
    where: {
      id: params.orderId,
      paymentAccessToken: params.accessToken,
      source: OrderSource.ONLINE,
    },
    select: { id: true, status: true },
  });

  if (!order) {
    return { ok: false, error: "Pedido não encontrado.", httpStatus: 404 };
  }

  const paid =
    order.status === OrderStatus.PAID || order.status === OrderStatus.COMPLETED;

  const latest = await prisma.payment.findFirst({
    where: { orderId: order.id, method: "pix" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      providerPaymentId: true,
      status: true,
      expiresAt: true,
      qrCode: true,
      qrCodeBase64: true,
    },
  });

  if (!latest) {
    return {
      ok: true,
      paid,
      orderStatus: order.status,
      pix: null,
    };
  }

  if (paid) {
    return {
      ok: true,
      paid,
      orderStatus: order.status,
      pix: {
        status: PixPaymentStatus.APPROVED,
        paymentId: latest.providerPaymentId,
        expiresAt: latest.expiresAt?.toISOString() ?? null,
        qrCode: null,
      },
    };
  }

  const expiredNow = await markExpiredIfNeeded(latest);
  if (expiredNow) {
    return {
      ok: true,
      paid,
      orderStatus: order.status,
      pix: {
        status: PixPaymentStatus.EXPIRED,
        paymentId: latest.providerPaymentId,
        expiresAt: latest.expiresAt?.toISOString() ?? null,
        qrCode: null,
      },
    };
  }

  return {
    ok: true,
    paid,
    orderStatus: order.status,
    pix: toPublicPix(latest, params.includeQr && latest.status === PixPaymentStatus.PENDING),
  };
}

export async function createPixForOrder(params: {
  orderId: string;
  accessToken: string;
  cpf: string;
}): Promise<
  | { ok: true; paid: false; pix: PixPublicPayload }
  | { ok: true; paid: true; orderStatus: string }
  | { ok: false; error: string; httpStatus: number }
> {
  const cpf = normalizeCpf(params.cpf);
  if (!isValidCpf(cpf)) {
    return { ok: false, error: "Informe um CPF válido.", httpStatus: 400 };
  }

  const order = await prisma.order.findFirst({
    where: {
      id: params.orderId,
      paymentAccessToken: params.accessToken,
      source: OrderSource.ONLINE,
    },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      customerName: true,
      customerEmail: true,
    },
  });

  if (!order) {
    return { ok: false, error: "Pedido não encontrado.", httpStatus: 404 };
  }

  if (
    order.status === OrderStatus.PAID ||
    order.status === OrderStatus.COMPLETED
  ) {
    return { ok: true, paid: true, orderStatus: order.status };
  }

  if (order.status !== OrderStatus.AWAITING_PAYMENT) {
    return {
      ok: false,
      error: "Este pedido não está disponível para pagamento PIX.",
      httpStatus: 409,
    };
  }

  if (!Number.isFinite(order.totalAmount) || order.totalAmount < 0.01) {
    return { ok: false, error: "O total do pedido é inválido.", httpStatus: 400 };
  }

  const existing = await prisma.payment.findFirst({
    where: {
      orderId: order.id,
      method: "pix",
      status: PixPaymentStatus.PENDING,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      providerPaymentId: true,
      status: true,
      expiresAt: true,
      qrCode: true,
      qrCodeBase64: true,
    },
  });

  if (
    existing &&
    isPixReusable({ status: existing.status, expiresAt: existing.expiresAt })
  ) {
    console.info("pix reused existing pending", {
      orderId: order.id,
      paymentId: existing.providerPaymentId,
    });
    return {
      ok: true,
      paid: false,
      pix: toPublicPix(existing, true),
    };
  }

  if (existing) {
    try {
      await cancelMercadoPagoPayment(existing.providerPaymentId);
    } catch (error) {
      console.error("pix cancel previous failed", {
        orderId: order.id,
        paymentId: existing.providerPaymentId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
    await prisma.payment.updateMany({
      where: {
        id: existing.id,
        status: { in: [PixPaymentStatus.PENDING, PixPaymentStatus.EXPIRED] },
      },
      data: { status: PixPaymentStatus.CANCELLED },
    });
  }

  await cancelPendingPixForOrder(order.id);

  const { firstName, lastName } = splitPayerName(order.customerName);
  const payerEmail =
    order.customerEmail?.trim().toLowerCase() || "cliente@doceriadonalu.com";
  const expiresAt = pixExpirationDate();
  const idempotencyKey = `ddl-pix-${order.id}-${randomUUID()}`;
  const shortId = order.id.slice(-8).toUpperCase();

  console.info("pix requested", { orderId: order.id });

  let created;
  try {
    created = await createPixPayment({
      orderId: order.id,
      amount: order.totalAmount,
      description: `Pedido Dona Lu #${shortId}`,
      payerEmail,
      payerFirstName: firstName,
      payerLastName: lastName,
      cpf,
      idempotencyKey,
      expiresAt,
    });
  } catch (error) {
    console.error("pix create failed", {
      orderId: order.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? mapMercadoPagoError(error.message)
          : "Não foi possível gerar o PIX. Tente novamente.",
      httpStatus: 502,
    };
  }

  const pixStatus = mapMercadoPagoStatusToPix(created.status);

  try {
    const row = await prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: {
          id: order.id,
          status: OrderStatus.AWAITING_PAYMENT,
        },
        data: { paymentMethod: "pix" },
      });

      return tx.payment.create({
        data: {
          orderId: order.id,
          provider: "mercadopago",
          providerPaymentId: created.paymentId,
          method: "pix",
          status: pixStatus,
          statusDetail: created.statusDetail,
          amount: order.totalAmount,
          externalReference: order.id,
          qrCode: created.qrCode,
          qrCodeBase64: created.qrCodeBase64,
          expiresAt: created.expiresAt,
        },
        select: {
          providerPaymentId: true,
          status: true,
          expiresAt: true,
          qrCode: true,
          qrCodeBase64: true,
        },
      });
    });

    console.info("pix generated", {
      orderId: order.id,
      paymentId: created.paymentId,
      expiresAt: created.expiresAt?.toISOString() ?? null,
    });

    await recordPaymentAudit({
      event: PaymentAuditEvent.PAYMENT_CREATED,
      origin: "pix",
      result: "PIX gerado — pedido permanece AWAITING_PAYMENT",
      orderId: order.id,
      paymentId: created.paymentId,
    });
    await recordPaymentAudit({
      event: PaymentAuditEvent.PAYMENT_PENDING,
      origin: "pix",
      result: pixStatus,
      orderId: order.id,
      paymentId: created.paymentId,
    });

    return { ok: true, paid: false, pix: toPublicPix(row, true) };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Corrida: outro request gravou o PIX pendente. Cancela o nosso no gateway.
      try {
        await cancelMercadoPagoPayment(created.paymentId);
      } catch {
        /* best-effort */
      }

      const winner = await prisma.payment.findFirst({
        where: {
          orderId: order.id,
          method: "pix",
          status: PixPaymentStatus.PENDING,
        },
        orderBy: { createdAt: "desc" },
        select: {
          providerPaymentId: true,
          status: true,
          expiresAt: true,
          qrCode: true,
          qrCodeBase64: true,
        },
      });

      if (
        winner &&
        isPixReusable({ status: winner.status, expiresAt: winner.expiresAt })
      ) {
        console.info("pix idempotent loser cancelled", {
          orderId: order.id,
          paymentId: created.paymentId,
          keptPaymentId: winner.providerPaymentId,
        });
        return { ok: true, paid: false, pix: toPublicPix(winner, true) };
      }
    }

    console.error("pix persist failed", {
      orderId: order.id,
      paymentId: created.paymentId,
      error: error instanceof Error ? error.message : "unknown",
    });

    try {
      await cancelMercadoPagoPayment(created.paymentId);
    } catch {
      /* best-effort */
    }

    return {
      ok: false,
      error: "Não foi possível salvar o PIX. Tente novamente.",
      httpStatus: 500,
    };
  }
}

/** Sincroniza a linha Payment após consulta oficial ao gateway (webhook / apply). */
export async function syncPixPaymentRecord(params: {
  providerPaymentId: string;
  mpStatus: string;
  statusDetail?: string | null;
  orderId?: string | null;
}): Promise<void> {
  const status = mapMercadoPagoStatusToPix(params.mpStatus);
  const data: Prisma.PaymentUpdateManyMutationInput = {
    status,
    statusDetail: params.statusDetail ?? undefined,
    ...(status === PixPaymentStatus.APPROVED ? { approvedAt: new Date() } : {}),
  };

  const updated = await prisma.payment.updateMany({
    where: { providerPaymentId: params.providerPaymentId },
    data,
  });

  if (updated.count === 0 && params.orderId) {
    // Checkout Pro não cria Payment — ok. Só loga se era PIX conhecido.
    return;
  }
}
