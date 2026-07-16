"use client";

import { useCallback, useEffect, useState } from "react";

export type PendingOrder = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  waiterName: string | null;
  createdAt: string;
  totalAmount: number;
  advancePayment: number;
  items: {
    quantity: number;
    priceAtTime: number;
    product: { title: string };
  }[];
};

type PendingResponse = {
  count: number;
  orders: PendingOrder[];
};

/**
 * Short-polling dos pedidos pendentes (sem WebSockets).
 * Consulta o endpoint a cada `intervalMs` e quando a aba volta ao foco.
 * Quando `enabled` é `false`, nenhuma requisição é feita.
 */
export function usePendingOrders(enabled = true, intervalMs = 5000) {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/orders/pending", {
        cache: "no-store",
      });
      if (!res.ok) return;

      const data = (await res.json()) as PendingResponse;
      setOrders(data.orders ?? []);
      setCount(data.count ?? 0);
    } catch {
      // Silencioso: tenta novamente no próximo ciclo de polling.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    refresh();
    const id = window.setInterval(refresh, intervalMs);

    const onVisibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, refresh, intervalMs]);

  return { orders, count, isLoading, refresh };
}
