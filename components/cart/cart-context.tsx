"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { ModifierSelectionSnapshot } from "@/lib/modifiers/types";
import { extrasUnitPrice } from "@/lib/modifiers/types";

export type CartItem = {
  /** Linha única — mesmo produto com mods diferentes não mescla. */
  lineId: string;
  productId: string;
  title: string;
  /** Preço unitário já com extras de modificadores. */
  price: number;
  basePrice: number;
  imageUrl: string;
  quantity: number;
  modifiers: ModifierSelectionSnapshot[];
};

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  total: number;
  /** Adiciona produto simples (sem mods) — compatível com fluxo antigo. */
  addItem: (
    item: {
      productId: string;
      title: string;
      price: number;
      imageUrl: string;
    },
    quantity?: number
  ) => void;
  /** Adiciona produto configurado (com ou sem mods). */
  addConfiguredItem: (item: {
    productId: string;
    title: string;
    basePrice: number;
    imageUrl: string;
    modifiers: ModifierSelectionSnapshot[];
    quantity?: number;
  }) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "ddl:cart:v2";

const CartContext = createContext<CartContextValue | null>(null);

function newLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.productId === "string" &&
          typeof item.title === "string" &&
          typeof item.price === "number" &&
          typeof item.quantity === "number" &&
          item.quantity > 0
      )
      .map((item) => ({
        ...item,
        lineId: item.lineId || newLineId(),
        basePrice:
          typeof item.basePrice === "number" ? item.basePrice : item.price,
        modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
      }));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(loadCart());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const addConfiguredItem = useCallback(
    (item: {
      productId: string;
      title: string;
      basePrice: number;
      imageUrl: string;
      modifiers: ModifierSelectionSnapshot[];
      quantity?: number;
    }) => {
      const qty = Math.max(1, Math.floor(item.quantity ?? 1));
      const extras = extrasUnitPrice(item.modifiers);
      const unitPrice = Math.round((item.basePrice + extras) * 100) / 100;
      const hasMods = item.modifiers.length > 0;

      setItems((prev) => {
        // Sem mods: mescla por productId (comportamento antigo).
        if (!hasMods) {
          const existing = prev.find(
            (line) =>
              line.productId === item.productId && line.modifiers.length === 0
          );
          if (existing) {
            return prev.map((line) =>
              line.lineId === existing.lineId
                ? { ...line, quantity: Math.min(50, line.quantity + qty) }
                : line
            );
          }
        }

        return [
          ...prev,
          {
            lineId: newLineId(),
            productId: item.productId,
            title: item.title,
            basePrice: item.basePrice,
            price: unitPrice,
            imageUrl: item.imageUrl,
            quantity: qty,
            modifiers: item.modifiers,
          },
        ];
      });
    },
    []
  );

  const addItem = useCallback(
    (
      item: {
        productId: string;
        title: string;
        price: number;
        imageUrl: string;
      },
      quantity = 1
    ) => {
      addConfiguredItem({
        productId: item.productId,
        title: item.title,
        basePrice: item.price,
        imageUrl: item.imageUrl,
        modifiers: [],
        quantity,
      });
    },
    [addConfiguredItem]
  );

  const setQuantity = useCallback((lineId: string, quantity: number) => {
    const qty = Math.floor(quantity);
    setItems((prev) => {
      if (qty <= 0) return prev.filter((line) => line.lineId !== lineId);
      return prev.map((line) =>
        line.lineId === lineId
          ? { ...line, quantity: Math.min(50, qty) }
          : line
      );
    });
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setItems((prev) => prev.filter((line) => line.lineId !== lineId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((sum, line) => sum + line.quantity, 0);
    const total =
      Math.round(
        items.reduce((sum, line) => sum + line.price * line.quantity, 0) * 100
      ) / 100;
    return {
      items,
      itemCount,
      total,
      addItem,
      addConfiguredItem,
      setQuantity,
      removeItem,
      clear,
    };
  }, [items, addItem, addConfiguredItem, setQuantity, removeItem, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart deve ser usado dentro de CartProvider.");
  }
  return ctx;
}
