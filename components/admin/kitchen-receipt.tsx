import { formatDateTime, formatPhone, formatPrice } from "@/lib/format";
import { formatOrderId } from "@/lib/order-period";
import type { KitchenReceiptData } from "@/lib/receipt";

interface KitchenReceiptProps {
  data: KitchenReceiptData;
}

/**
 * Comanda térmica 80mm.
 *
 * Medidas (ver também `app/globals.css` @media print):
 * - Papel: 80mm (`@page { size: 80mm auto }`)
 * - Conteúdo: 72mm de largura útil + ~2.5mm de padding em cada lado
 *   (≈ 1 caractere de folga) para a Epson não cortar o texto nas bordas.
 */
export function KitchenReceipt({ data }: KitchenReceiptProps) {
  const createdAt = new Date(data.createdAt);
  const hasAdvance = (data.advancePayment ?? 0) > 0;
  const remaining = Math.max(0, data.totalAmount - (data.advancePayment ?? 0));

  return (
    <div className="kitchen-receipt-content box-border w-[72mm] bg-white px-[2.5mm] py-2 font-mono text-[10px] leading-tight text-black">
      <p className="text-center text-[12px] font-bold uppercase tracking-wide">
        Doceria Dona Lu
      </p>
      <p className="mb-2 text-center text-[10px] font-semibold uppercase">
        Comanda — Cozinha
      </p>

      <div className="my-2 border-t border-dashed border-black" />

      <p>
        <span className="font-bold">Comanda:</span> #{formatOrderId(data.orderId)}
      </p>
      <p>
        <span className="font-bold">Cliente:</span> {data.customerName}
      </p>
      {data.customerPhone && (
        <p>
          <span className="font-bold">WhatsApp:</span>{" "}
          {formatPhone(data.customerPhone)}
        </p>
      )}
      {data.waiterName && (
        <p>
          <span className="font-bold">Garçom/Mesa:</span> {data.waiterName}
        </p>
      )}
      <p>
        <span className="font-bold">Data:</span> {formatDateTime(createdAt)}
      </p>

      <div className="my-2 border-t border-dashed border-black" />

      <p className="mb-1 font-bold uppercase">Itens</p>
      <ul className="space-y-1">
        {data.items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span className="shrink-0 font-bold">{item.quantity}x</span>
            <span className="min-w-0 flex-1 break-words">{item.title}</span>
          </li>
        ))}
      </ul>

      <div className="my-2 border-t border-dashed border-black" />

      {hasAdvance ? (
        <div className="space-y-0.5">
          <div className="flex justify-between gap-2">
            <span>Total do Pedido:</span>
            <span className="shrink-0">{formatPrice(data.totalAmount)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span>Sinal Pago:</span>
            <span className="shrink-0">
              - {formatPrice(data.advancePayment)}
            </span>
          </div>
          <div className="mt-1 flex justify-between gap-2 border-t border-black pt-1 text-[11px] font-bold">
            <span>FALTA PAGAR:</span>
            <span className="shrink-0">{formatPrice(remaining)}</span>
          </div>
        </div>
      ) : (
        <p className="text-right text-[11px] font-bold">
          TOTAL: {formatPrice(data.totalAmount)}
        </p>
      )}

      <div className="mt-2 border-t border-dashed border-black" />
    </div>
  );
}
