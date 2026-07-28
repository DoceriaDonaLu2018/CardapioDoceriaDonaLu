import Link from "next/link";
import { Star } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { CatalogShell } from "@/components/catalog/catalog-shell";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

export default async function AvaliacoesPage() {
  const [reviews, products] = await Promise.all([
    prisma.review.findMany({
      where: { isVisible: true },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        customerName: true,
        rating: true,
        comment: true,
        createdAt: true,
        product: { select: { title: true } },
      },
    }),
    prisma.product.findMany({
      where: { isDeleted: false, isAvailable: true },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  return (
    <CatalogShell categories={[]}>
      <div className="container max-w-3xl space-y-10 py-12">
        <div className="text-center">
          <h1 className="font-serif text-3xl font-bold text-stone-800 sm:text-4xl">
            Avaliações
          </h1>
          <p className="mt-2 text-stone-500">
            Feedback de clientes com compra verificada pelo WhatsApp.
          </p>
          <Link
            href="/"
            className="mt-3 inline-block text-sm font-medium text-coffee-700 hover:underline"
          >
            Voltar ao cardápio
          </Link>
        </div>

        <ReviewForm products={products} />

        <section className="space-y-4">
          <h2 className="font-serif text-2xl font-bold text-stone-800">
            O que nossos clientes dizem
          </h2>
          {reviews.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-300 bg-white py-10 text-center text-sm text-stone-500">
              Ainda não há avaliações publicadas.
            </p>
          ) : (
            <ul className="space-y-3">
              {reviews.map((review) => (
                <li
                  key={review.id}
                  className="rounded-xl border border-stone-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-stone-800">
                      {review.customerName}
                    </p>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={index}
                          className={
                            index < review.rating
                              ? "h-4 w-4 fill-coffee-600 text-coffee-600"
                              : "h-4 w-4 text-stone-200"
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-stone-400">
                    {review.product.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">
                    {review.comment}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </CatalogShell>
  );
}
