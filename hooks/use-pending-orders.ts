"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PendingOrder = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  waiterName: string | null;
  createdAt: string;
  totalAmount: number;
  advancePayment: number;
  status?: string;
  source?: string;
  deliveryAddress?: string | null;
  items: {
    quantity: number;
    priceAtTime: number;
    productTitle?: string | null;
    product: { title: string };
  }[];
};

type PendingResponse = {
  count: number;
  orders: PendingOrder[];
};

export type UsePendingOrdersOptions = {
  /** Quando `false`, nenhuma requisição é feita. */
  enabled?: boolean;
  /** Intervalo de polling em ms. */
  intervalMs?: number;
  /**
   * Se `true`, consulta apenas a contagem (`?countOnly=1`).
   * Ideal para a badge da sidebar — evita carregar itens a cada ciclo.
   */
  countOnly?: boolean;
};

/**
 * Short-polling dos pedidos pendentes (sem WebSockets).
 * Consulta o endpoint a cada `intervalMs` e quando a aba volta ao foco.
 * Cancela fetch em andamento no cleanup / novo ciclo (AbortController).
 */
export function usePendingOrders(
  enabledOrOptions: boolean | UsePendingOrdersOptions = true,
  intervalMsArg = 5000
) {
  const options: UsePendingOrdersOptions =
    typeof enabledOrOptions === "boolean"
      ? { enabled: enabledOrOptions, intervalMs: intervalMsArg }
      : enabledOrOptions;

  const enabled = options.enabled ?? true;
  const intervalMs = options.intervalMs ?? 5000;
  const countOnly = options.countOnly ?? false;

  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const url = countOnly
        ? "/api/admin/orders/pending?countOnly=1"
        : "/api/admin/orders/pending";

      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) return;

      const data = (await res.json()) as PendingResponse;
      if (controller.signal.aborted) return;

      setCount(data.count ?? 0);
      if (!countOnly) {
        setOrders(data.orders ?? []);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Silencioso: tenta novamente no próximo ciclo de polling.
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [countOnly]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    refresh();
    const id = window.setInterval(refresh, intervalMs);

    const onVisibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      abortRef.current?.abort();
    };
  }, [enabled, refresh, intervalMs]);

  return { orders, count, isLoading, refresh };
}
