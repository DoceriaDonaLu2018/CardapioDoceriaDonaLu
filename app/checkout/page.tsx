import Link from "next/link";

import { CartProvider } from "@/components/cart/cart-context";
import { CheckoutForm } from "./checkout-form";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Checkout — Doceria Dona Lu",
  description: "Finalize seu pedido e pague no Mercado Pago.",
};

export default function CheckoutPage() {
  return (
    <CartProvider>
      <div className="min-h-screen bg-stone-50">
        <header className="border-b border-stone-200 bg-white">
          <div className="container flex h-16 items-center justify-between">
            <Link
              href="/"
              className="font-serif text-xl font-semibold text-stone-800"
            >
              Doceria Dona Lu
            </Link>
            <Button asChild variant="ghost" className="text-stone-600">
              <Link href="/">Continuar comprando</Link>
            </Button>
          </div>
        </header>

        <main className="container max-w-5xl py-8 sm:py-12">
          <div className="mb-8">
            <h1 className="font-serif text-3xl font-bold text-stone-800">
              Checkout
            </h1>
            <p className="mt-1 text-stone-500">
              PIX, crédito ou débito · retirada no local. Sem login, sem SMS.
            </p>
          </div>
          <CheckoutForm />
        </main>
      </div>
    </CartProvider>
  );
}
