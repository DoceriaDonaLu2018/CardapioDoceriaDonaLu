import { prisma } from "@/lib/prisma";

export type PublicReviewCard = {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  productTitle: string;
  createdAt: Date;
};

const reviewSelect = {
  id: true,
  customerName: true,
  rating: true,
  comment: true,
  createdAt: true,
  product: { select: { title: true } },
} as const;

function mapReview(row: {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  createdAt: Date;
  product: { title: string };
}): PublicReviewCard {
  return {
    id: row.id,
    customerName: row.customerName,
    rating: row.rating,
    comment: row.comment,
    productTitle: row.product.title,
    createdAt: row.createdAt,
  };
}

/** Até 3 avaliações em destaque na home (visíveis + highlighted). */
export async function getHighlightedReviews(
  limit = 3
): Promise<PublicReviewCard[]> {
  const rows = await prisma.review.findMany({
    where: {
      isVisible: true,
      isHighlighted: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: reviewSelect,
  });

  return rows.map(mapReview);
}

/** Lista paginada de todas as avaliações visíveis. */
export async function getVisibleReviewsPage(params: {
  page: number;
  pageSize?: number;
}): Promise<{
  reviews: PublicReviewCard[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const pageSize = Math.min(Math.max(params.pageSize ?? 12, 1), 50);
  const page = Math.max(1, Math.floor(params.page) || 1);
  const skip = (page - 1) * pageSize;

  const where = { isVisible: true };

  const [total, rows] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: reviewSelect,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    reviews: rows.map(mapReview),
    total,
    page: Math.min(page, totalPages),
    pageSize,
    totalPages,
  };
}
