"use client";

import { Printer } from "lucide-react";

import { formatPrice, formatDateTime } from "@/lib/format";
import { formatOrderId, formatOrderSummary } from "@/lib/order-period";
import { toKitchenReceiptData } from "@/lib/receipt";
import { useReceiptPrint } from "@/hooks/use-receipt-print";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type HistoricoOrderRow = {
  id: string;
  customerName: string;
  waiterName?: string | null;
  createdAt: string;
  totalAmount: number;
  items: {
    quantity: number;
    priceAtTime: number;
    product: { title: string };
  }[];
};

interface HistoricoTableProps {
  orders: HistoricoOrderRow[];
}

export function HistoricoTable({ orders }: HistoricoTableProps) {
  const { printReceipt, printMessage, clearPrintMessage, canPrint, ReceiptLayer } =
    useReceiptPrint();

  return (
    <>
      {ReceiptLayer}

      {printMessage && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {printMessage}
          <button
            type="button"
            onClick={clearPrintMessage}
            className="ml-2 underline"
          >
            Ok
          </button>
        </p>
      )}

      <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Comanda</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Data e Hora</TableHead>
              <TableHead>Produtos</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-16 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-stone-500"
                >
                  Nenhum pedido encontrado neste período.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const createdAt = new Date(order.createdAt);
                const receipt = toKitchenReceiptData({
                  ...order,
                  createdAt,
                });

                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs font-medium text-stone-500">
                      #{formatOrderId(order.id)}
                    </TableCell>
                    <TableCell className="font-medium text-stone-800">
                      {order.customerName}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-stone-600">
                      {formatDateTime(createdAt)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-stone-500">
                      {formatOrderSummary(order.items)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-coffee-700">
                      {formatPrice(order.totalAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => printReceipt(receipt)}
                        disabled={!canPrint}
                        title={
                          canPrint
                            ? "Reimprimir comanda"
                            : "Reimpressão disponível no PC do caixa"
                        }
                        aria-label="Reimprimir comanda"
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
