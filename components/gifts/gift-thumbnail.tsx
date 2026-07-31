"use client";

import { useState } from "react";
import Image from "next/image";
import { Gift } from "lucide-react";

import {
  sanitizeImageSrc,
  shouldBypassImageOptimization,
} from "@/lib/images";
import { cn } from "@/lib/utils";

type GiftThumbnailProps = {
  name: string;
  imageUrl?: string | null;
  /** w-12 h-12 por padrão; use "md" para w-16 h-16. */
  size?: "sm" | "md";
  className?: string;
};

function GiftFallback({
  size,
  className,
}: {
  size: "sm" | "md";
  className?: string;
}) {
  const box = size === "md" ? "h-16 w-16" : "h-12 w-12";
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

/**
 * Miniatura de brinde — Next/Image quando há URL válida; ícone Gift no fallback.
 */
export function GiftThumbnail({
  name,
  imageUrl,
  size = "sm",
  className,
}: GiftThumbnailProps) {
  const safe = sanitizeImageSrc(imageUrl);
  const [failed, setFailed] = useState(false);
  const box = size === "md" ? "h-16 w-16" : "h-12 w-12";

  if (!safe || failed) {
    return <GiftFallback size={size} className={className} />;
  }

  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden rounded-md bg-stone-100 ring-1 ring-stone-200/80",
        box,
        className
      )}
    >
      <Image
        src={safe}
        alt={name}
        fill
        sizes={size === "md" ? "64px" : "48px"}
        className="object-cover object-center"
        unoptimized={shouldBypassImageOptimization(safe)}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
