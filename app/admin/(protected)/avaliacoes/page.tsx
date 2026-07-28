import { prisma } from "@/lib/prisma";
import { AvaliacoesAdminClient } from "./avaliacoes-client";

export const dynamic = "force-dynamic";

export default async function AvaliacoesAdminPage() {
  const [reviews, products] = await Promise.all([
    prisma.review.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        rating: true,
        comment: true,
        isVisible: true,
        isManual: true,
        createdAt: true,
        product: { select: { title: true } },
      },
    }),
    prisma.product.findMany({
      where: { isDeleted: false },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-800">
          Avaliações
        </h1>
        <p className="mt-1 text-stone-500">
          Modere feedbacks verificados e publique avaliações manuais.
        </p>
      </div>

      <AvaliacoesAdminClient
        products={products}
        reviews={reviews.map((review) => ({
          id: review.id,
          customerName: review.customerName,
          customerPhone: review.customerPhone,
          rating: review.rating,
          comment: review.comment,
          isVisible: review.isVisible,
          isManual: review.isManual,
          createdAt: review.createdAt.toISOString(),
          productTitle: review.product.title,
        }))}
      />
    </div>
  );
}
