import Link from "next/link";
import { Star } from "lucide-react";

import type { PublicReviewCard } from "@/lib/reviews/queries";
import { cn } from "@/lib/utils";

export function ReviewStars({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={
            index < rating
              ? "h-4 w-4 fill-coffee-600 text-coffee-600"
              : "h-4 w-4 text-stone-200"
          }
        />
      ))}
    </div>
  );
}

export function ReviewCard({
  review,
  className,
}: {
  review: PublicReviewCard;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-sm",
        className
      )}
    >
      <ReviewStars rating={review.rating} />
      <p className="mt-3 flex-1 text-sm leading-relaxed text-stone-600">
        “{review.comment}”
      </p>
      <div className="mt-4 border-t border-stone-100 pt-3">
        <p className="font-medium text-stone-800">{review.customerName}</p>
        <p className="mt-0.5 text-xs text-stone-400">{review.productTitle}</p>
      </div>
    </article>
  );
}

export function HighlightedReviewsSection({
  reviews,
}: {
  reviews: PublicReviewCard[];
}) {
  if (reviews.length === 0) return null;

  return (
    <section className="border-t border-stone-200 bg-stone-50/80">
      <div className="container py-14">
        <div className="mb-8 text-center">
          <h2 className="font-serif text-3xl font-bold text-stone-800">
            O que nossos clientes dizem
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            Avaliações em destaque de clientes verificados.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/avaliacoes"
            className="text-sm font-medium text-coffee-700 hover:underline"
          >
            Ver todas as avaliações
          </Link>
        </div>
      </div>
    </section>
  );
}
