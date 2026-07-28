import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { getVisibleReviewsPage } from "@/lib/reviews/queries";
import { CatalogShell } from "@/components/catalog/catalog-shell";
import { ReviewCard } from "@/components/reviews/review-cards";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

interface AvaliacoesPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function AvaliacoesPage({
  searchParams,
}: AvaliacoesPageProps) {
  const params = (await searchParams) ?? {};
  const rawPage = Number(params.page);
  const requestedPage =
    Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  const [{ reviews, page, totalPages, total }, products] = await Promise.all([
    getVisibleReviewsPage({ page: requestedPage, pageSize: PAGE_SIZE }),
    prisma.product.findMany({
      where: { isDeleted: false, isAvailable: true },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  return (
    <CatalogShell categories={[]}>
      <div className="container max-w-4xl space-y-10 py-12">
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
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-serif text-2xl font-bold text-stone-800">
              Todas as avaliações
            </h2>
            {total > 0 && (
              <p className="text-xs text-stone-400">
                {total} avaliação{total === 1 ? "" : "ões"} · página {page} de{" "}
                {totalPages}
              </p>
            )}
          </div>

          {reviews.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-300 bg-white py-10 text-center text-sm text-stone-500">
              Ainda não há avaliações publicadas.
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {reviews.map((review) => (
                <li key={review.id}>
                  <ReviewCard review={review} />
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <nav
              className="flex items-center justify-center gap-3 pt-2"
              aria-label="Paginação das avaliações"
            >
              {page > 1 ? (
                <Link
                  href={`/avaliacoes?page=${page - 1}`}
                  className="inline-flex h-10 items-center gap-1 rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 hover:border-coffee-300 hover:text-coffee-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Link>
              ) : (
                <span className="inline-flex h-10 items-center gap-1 rounded-md border border-stone-100 px-3 text-sm text-stone-300">
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </span>
              )}

              <span className="text-sm text-stone-500">
                {page} / {totalPages}
              </span>

              {page < totalPages ? (
                <Link
                  href={`/avaliacoes?page=${page + 1}`}
                  className="inline-flex h-10 items-center gap-1 rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 hover:border-coffee-300 hover:text-coffee-700"
                >
                  Próxima
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span className="inline-flex h-10 items-center gap-1 rounded-md border border-stone-100 px-3 text-sm text-stone-300">
                  Próxima
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </nav>
          )}
        </section>
      </div>
    </CatalogShell>
  );
}
