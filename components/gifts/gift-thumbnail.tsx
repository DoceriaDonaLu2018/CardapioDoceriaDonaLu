"use client";

import Image from "next/image";
import { Gift } from "lucide-react";

import { cn } from "@/lib/utils";

type GiftThumbnailProps = {
  name: string;
  imageUrl?: string | null;
  /** w-12 h-12 por padrão; use "md" para w-16 h-16. */
  size?: "sm" | "md";
  className?: string;
};

/**
 * Miniatura de brinde — Next/Image quando há URL; ícone Gift no fallback.
 */
export function GiftThumbnail({
  name,
  imageUrl,
  size = "sm",
  className,
}: GiftThumbnailProps) {
  const box =
    size === "md" ? "h-16 w-16" : "h-12 w-12";

  if (imageUrl) {
    return (
      <span
        className={cn(
          "relative shrink-0 overflow-hidden rounded-md bg-stone-100 ring-1 ring-stone-200/80",
          box,
          className
        )}
      >
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes={size === "md" ? "64px" : "48px"}
          className="object-cover object-center"
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
        box,
        className
      )}
      aria-hidden
    >
      <Gift className={size === "md" ? "h-7 w-7" : "h-5 w-5"} />
    </span>
  );
}
