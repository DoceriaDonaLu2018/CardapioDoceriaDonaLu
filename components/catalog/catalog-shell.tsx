"use client";

import { CartProvider } from "@/components/cart/cart-context";
import { Header, type HeaderCategory } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export function CatalogShell({
  categories,
  children,
}: {
  categories: HeaderCategory[];
  children: React.ReactNode;
}) {
  return (
    <CartProvider>
      <div className="flex min-h-screen flex-col bg-stone-50">
        <Header categories={categories} showCart />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </CartProvider>
  );
}
