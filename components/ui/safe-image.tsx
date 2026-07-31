"use client";

import { useEffect, useState } from "react";
import Image, { type ImageProps } from "next/image";
import { ImageOff } from "lucide-react";

import {
  sanitizeImageSrc,
  shouldBypassImageOptimization,
} from "@/lib/images";
import { cn } from "@/lib/utils";

type SafeImageProps = Omit<ImageProps, "src" | "alt" | "onError"> & {
  src: string | null | undefined;
  alt: string;
  containerClassName?: string;
  fallbackClassName?: string;
  fallbackIconClassName?: string;
  /** Notifica o pai quando a URL remota falha (ex.: ImageUpload). */
  onLoadError?: () => void;
};

/**
 * next/image com sanitização de src + fallback visual em onError / URL inválida.
 */
export function SafeImage({
  src,
  alt,
  containerClassName,
  fallbackClassName,
  fallbackIconClassName,
  className,
  fill,
  onLoadError,
  ...rest
}: SafeImageProps) {
  const safe = sanitizeImageSrc(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [safe]);

  if (!safe || failed) {
    return (
      <span
        className={cn(
          "flex items-center justify-center bg-stone-100 text-stone-400",
          fill && "absolute inset-0",
          !fill && containerClassName,
          fallbackClassName
        )}
        role="img"
        aria-label={alt || "Imagem indisponível"}
      >
        <ImageOff
          className={cn("h-5 w-5", fallbackIconClassName)}
          aria-hidden
        />
      </span>
    );
  }

  return (
    <Image
      {...rest}
      src={safe}
      alt={alt}
      fill={fill}
      className={className}
      unoptimized={shouldBypassImageOptimization(safe) || rest.unoptimized}
      onError={() => {
        setFailed(true);
        onLoadError?.();
      }}
    />
  );
}
