"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";

import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ProductCardData {
  title: string;
  description: string;
  imageUrl: string;
  price: number;
}

interface ProductCardProps {
  product: ProductCardData;
  className?: string;
}

export function ProductCard({ product, className }: ProductCardProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const dialogId = useId();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <article
        className={cn(
          "group flex h-full min-h-[44px] cursor-pointer flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm outline-none transition-all duration-300",
          "hover:-translate-y-0.5 hover:border-coffee-200 hover:shadow-md",
          "focus-visible:ring-2 focus-visible:ring-coffee-500 focus-visible:ring-offset-2",
          "active:scale-[0.98]",
          className
        )}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        aria-labelledby={titleId}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {/* Card fechado: foto + título curto */}
        <div className="relative aspect-square w-full overflow-hidden bg-stone-100">
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        </div>

        <div className="flex min-h-11 items-center px-2.5 py-2.5 sm:px-3 sm:py-3">
          <h3
            id={titleId}
            className="line-clamp-2 text-left text-sm font-semibold leading-snug text-stone-800 sm:text-base"
          >
            {product.title}
          </h3>
        </div>
      </article>

      {/* Detalhe expandido em modal */}
      <DialogContent
        id={dialogId}
        showCloseButton={false}
        className="max-h-[90dvh] w-[min(100%,28rem)] gap-0 overflow-y-auto border-stone-200 bg-white p-0 sm:rounded-2xl"
      >
        <div className="relative">
          {/* 1º Foto do produto */}
          <div className="relative aspect-square w-full overflow-hidden rounded-t-lg bg-stone-100 sm:aspect-[4/3] sm:rounded-t-2xl">
            <Image
              src={product.imageUrl}
              alt={product.title}
              fill
              sizes="(max-width: 448px) 100vw, 28rem"
              className="object-cover"
              priority
            />
          </div>

          <DialogClose
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-stone-700 shadow-md backdrop-blur-sm transition-colors hover:bg-white hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-coffee-500"
            aria-label="Fechar detalhes do produto"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </DialogClose>
        </div>

        <div className="flex flex-col gap-3 px-5 pb-6 pt-4 sm:px-6 sm:pb-7 sm:pt-5">
          {/* 2º Nome */}
          <DialogTitle className="text-left text-lg font-bold leading-tight text-stone-800 sm:text-xl">
            {product.title}
          </DialogTitle>

          {/* 3º Descrição */}
          <DialogDescription className="text-left text-sm leading-relaxed text-stone-500 sm:text-base">
            {product.description}
          </DialogDescription>

          {/* 4º Preço */}
          <p className="mt-1 text-left text-lg font-bold text-coffee-700 sm:text-xl">
            {formatPrice(product.price)}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
