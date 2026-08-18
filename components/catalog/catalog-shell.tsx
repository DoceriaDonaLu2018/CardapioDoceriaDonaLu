"use client";

import type { ReactNode } from "react";

import { CartProvider } from "@/components/cart/cart-context";
import { Header, type HeaderCategory } from "@/components/layout/Header";

export function CatalogShell({
  categories,
  children,
  footer,
}: {
  categories: HeaderCategory[];
  children: ReactNode;
  /**
   * Rodapé renderizado no servidor e passado como prop.
   * NÃO importar o Footer aqui: ele é um Server Component assíncrono que usa
   * Prisma; importá-lo dentro deste Client Component arrastaria o Prisma para
   * o bundle do navegador e quebraria a hidratação (carrinho para de funcionar).
   */
  footer?: ReactNode;
}) {
  return (
    <CartProvider>
      <div className="flex min-h-screen flex-col bg-stone-50">
        <Header categories={categories} showCart />
        <main className="flex-1">{children}</main>
        {footer}
      </div>
    </CartProvider>
  );
}
