import { type NextRequest, NextResponse } from "next/server";

import { closeReceptionIfPastHours } from "@/lib/reception";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Persiste o fechamento da recepção quando o horário (Brasília) já encerrou.
 * Não depende da aba Pedidos. Autorização: Bearer CRON_SECRET
 * (header enviado pelo Cron da Vercel).
 *
 * Agenda em vercel.json: 03:00 UTC = 00:00 em Brasília (Hobby só aceita cron
 * diário). O fechamento no horário configurado é aplicado na hora por
 * `syncReceptionState` em cada leitura no servidor (checkout, badge admin,
 * painel de Pedidos). Em plano Pro, a agenda pode ser `* * * * *`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const result = await closeReceptionIfPastHours();
    return NextResponse.json({
      ok: true,
      closed: result.closed,
      snapshot: result.snapshot,
    });
  } catch (error) {
    console.error("cron close-reception:", error);
    return NextResponse.json(
      { error: "Falha ao sincronizar a recepção." },
      { status: 500 }
    );
  }
}
