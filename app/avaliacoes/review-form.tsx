"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Star } from "lucide-react";

import {
  submitVerifiedReview,
  verifyPurchaseByPhone,
} from "@/app/avaliacoes/actions";
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

type ProductOption = { id: string; title: string };

export function ReviewForm({ products }: { products: ProductOption[] }) {
  const [step, setStep] = useState<"phone" | "form" | "done">("phone");
  const [phone, setPhone] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [productId, setProductId] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmitForm = useMemo(
    () =>
      Boolean(verifiedPhone && productId && customerName.trim() && comment.trim()),
    [verifiedPhone, productId, customerName, comment]
  );

  function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyPurchaseByPhone(phone);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setVerifiedPhone(result.phone);
      if (result.customerName) setCustomerName(result.customerName);
      setStep("form");
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmitForm) return;
    setError(null);
    startTransition(async () => {
      const result = await submitVerifiedReview({
        productId,
        customerName,
        customerPhone: verifiedPhone,
        rating,
        comment,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setStep("done");
    });
  }

  if (step === "done") {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h3 className="mt-3 font-serif text-xl font-bold text-stone-800">
          Avaliação enviada!
        </h3>
        <p className="mt-2 text-sm text-stone-600">
          Obrigado. Sua avaliação será publicada após moderação da Doceria.
        </p>
      </div>
    );
  }

  if (step === "phone") {
    return (
      <form
        onSubmit={handleVerify}
        className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6"
      >
        <div>
          <h2 className="font-serif text-xl font-bold text-stone-800">
            Deixe sua avaliação
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Informe o WhatsApp usado na compra para validarmos seu pedido.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reviewPhone">WhatsApp</Label>
          <Input
            id="reviewPhone"
            required
            inputMode="tel"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            disabled={isPending}
          />
        </div>
        {error && (
          <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Button
          type="submit"
          disabled={isPending || phone.replace(/\D/g, "").length < 10}
          className="w-full bg-coffee-600 text-white hover:bg-coffee-700"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Verificando…
            </>
          ) : (
            "Validar compra"
          )}
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6"
    >
      <div>
        <h2 className="font-serif text-xl font-bold text-stone-800">
          Sua opinião
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Compra verificada · WhatsApp {formatPhone(verifiedPhone)}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reviewName">Seu nome</Label>
        <Input
          id="reviewName"
          required
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label>Produto</Label>
        <Select
          value={productId || undefined}
          onValueChange={setProductId}
          disabled={isPending}
        >
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Selecione o doce..." />
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
        <Label>Nota</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`${value} estrela${value > 1 ? "s" : ""}`}
              onClick={() => setRating(value)}
              className="rounded-md p-1.5 transition hover:bg-coffee-50"
              disabled={isPending}
            >
              <Star
                className={
                  value <= rating
                    ? "h-6 w-6 fill-coffee-600 text-coffee-600"
                    : "h-6 w-6 text-stone-300"
                }
              />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reviewComment">Comentário</Label>
        <Textarea
          id="reviewComment"
          required
          rows={4}
          maxLength={800}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={isPending}
          placeholder="Conte como foi sua experiência..."
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={isPending || !canSubmitForm}
        className="w-full bg-coffee-600 text-white hover:bg-coffee-700"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enviando…
          </>
        ) : (
          "Enviar avaliação"
        )}
      </Button>
    </form>
  );
}
