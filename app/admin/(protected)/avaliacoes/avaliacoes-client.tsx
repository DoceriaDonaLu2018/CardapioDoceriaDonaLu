"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2, Sparkles, Star, Trash2 } from "lucide-react";

import {
  createManualReview,
  deleteReview,
  toggleReviewHighlight,
  toggleReviewVisibility,
} from "@/app/admin/avaliacoes/actions";
import { formatPhone } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AdminReviewRow = {
  id: string;
  customerName: string;
  customerPhone: string;
  rating: number;
  comment: string;
  isVisible: boolean;
  isHighlighted: boolean;
  isManual: boolean;
  createdAt: string;
  productTitle: string;
};

type ProductOption = { id: string; title: string };

export function AvaliacoesAdminClient({
  reviews: initialReviews,
  products,
}: {
  reviews: AdminReviewRow[];
  products: ProductOption[];
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [productId, setProductId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isVisible, setIsVisible] = useState(true);

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createManualReview({
        productId,
        customerName,
        customerPhone: customerPhone || null,
        rating,
        comment,
        isVisible,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      window.location.reload();
    });
  }

  function handleToggle(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await toggleReviewVisibility(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setReviews((current) =>
        current.map((row) =>
          row.id === id
            ? {
                ...row,
                isVisible: !row.isVisible,
                // Ocultar remove destaque visualmente; o server pode manter o flag.
                isHighlighted: row.isVisible ? false : row.isHighlighted,
              }
            : row
        )
      );
    });
  }

  function handleToggleHighlight(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await toggleReviewHighlight(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setReviews((current) =>
        current.map((row) => {
          if (row.id !== id) return row;
          const next = !row.isHighlighted;
          return {
            ...row,
            isHighlighted: next,
            isVisible: next ? true : row.isVisible,
          };
        })
      );
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("Excluir esta avaliação?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteReview(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setReviews((current) => current.filter((row) => row.id !== id));
    });
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-5"
      >
        <h2 className="font-serif text-lg font-bold text-stone-800">
          Adicionar avaliação manual
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Produto</Label>
            <Select
              value={productId || undefined}
              onValueChange={setProductId}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="manualName">Nome</Label>
            <Input
              id="manualName"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manualPhone">WhatsApp (opcional)</Label>
            <Input
              id="manualPhone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(formatPhone(e.target.value))}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manualRating">Nota (1–5)</Label>
            <Input
              id="manualRating"
              type="number"
              min={1}
              max={5}
              value={rating}
              onChange={(e) => setRating(Number(e.target.value) || 5)}
              disabled={isPending}
            />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={isVisible}
                onChange={(e) => setIsVisible(e.target.checked)}
                disabled={isPending}
              />
              Visível no site
            </label>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="manualComment">Comentário</Label>
            <Textarea
              id="manualComment"
              required
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
        <Button
          type="submit"
          disabled={isPending || !productId}
          className="bg-coffee-600 text-white hover:bg-coffee-700"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando…
            </>
          ) : (
            "Salvar avaliação"
          )}
        </Button>
      </form>

      <div className="space-y-3">
        <h2 className="font-serif text-lg font-bold text-stone-800">
          Moderação ({reviews.length})
        </h2>
        {reviews.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white py-10 text-center text-sm text-stone-500">
            Nenhuma avaliação ainda.
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="rounded-xl border border-stone-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-stone-800">
                        {review.customerName}
                      </p>
                      <span className="text-xs text-stone-400">
                        {review.productTitle}
                      </span>
                      {review.isManual && (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase text-stone-500">
                          Manual
                        </span>
                      )}
                      <span
                        className={
                          review.isVisible
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-700"
                            : "rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-800"
                        }
                      >
                        {review.isVisible ? "Visível" : "Oculta"}
                      </span>
                      {review.isHighlighted && (
                        <span className="rounded-full bg-coffee-50 px-2 py-0.5 text-[10px] font-medium uppercase text-coffee-700">
                          Destaque home
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={index}
                          className={
                            index < review.rating
                              ? "h-3.5 w-3.5 fill-coffee-600 text-coffee-600"
                              : "h-3.5 w-3.5 text-stone-200"
                          }
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-sm text-stone-600">
                      {review.comment}
                    </p>
                    <p className="mt-1 text-xs text-stone-400">
                      {review.customerPhone !== "admin"
                        ? formatPhone(review.customerPhone)
                        : "Sem WhatsApp"}{" "}
                      · {new Date(review.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={
                        review.isHighlighted
                          ? "h-9 w-9 border-coffee-300 bg-coffee-50 text-coffee-700"
                          : "h-9 w-9"
                      }
                      disabled={isPending}
                      title="Destacar na Página Inicial"
                      aria-label={
                        review.isHighlighted
                          ? "Remover destaque da página inicial"
                          : "Destacar na página inicial"
                      }
                      onClick={() => handleToggleHighlight(review.id)}
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      disabled={isPending}
                      aria-label={
                        review.isVisible ? "Ocultar" : "Tornar visível"
                      }
                      onClick={() => handleToggle(review.id)}
                    >
                      {review.isVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 text-red-600 hover:text-red-700"
                      disabled={isPending}
                      aria-label="Excluir"
                      onClick={() => handleDelete(review.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
