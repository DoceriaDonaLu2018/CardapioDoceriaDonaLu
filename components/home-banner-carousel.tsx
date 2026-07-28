"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type HomeBannerSlide = {
  id: string;
  imageUrl: string;
  productId: string | null;
};

/**
 * Banner promocional compacto (padrão delivery/e-commerce).
 * Altura limitada no mobile (~144px) e no desktop (máx. ~224px).
 */
export function HomeBannerCarousel({ banners }: { banners: HomeBannerSlide[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: banners.length > 1,
    align: "start",
  });
  const [selected, setSelected] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi || banners.length <= 1) return;
    const id = window.setInterval(() => {
      emblaApi.scrollNext();
    }, 5500);
    return () => window.clearInterval(id);
  }, [emblaApi, banners.length]);

  if (banners.length === 0) return null;

  return (
    <section
      className="container px-4 pt-4 sm:px-6 sm:pt-5"
      aria-label="Promoções"
    >
      <div className="relative overflow-hidden rounded-xl bg-stone-200 shadow-sm">
        {/* Altura reservada evita layout shift enquanto a imagem carrega */}
        <div
          className="relative h-36 w-full overflow-hidden sm:h-44 md:h-52 lg:h-56"
          ref={emblaRef}
        >
          <div className="flex h-full">
            {banners.map((banner, index) => {
              const slide = (
                <div className="relative h-full w-full bg-stone-200">
                  <Image
                    src={banner.imageUrl}
                    alt="Promoção Doceria Dona Lu"
                    fill
                    priority={index === 0}
                    sizes="(max-width: 768px) 100vw, 1200px"
                    className="h-full w-full object-cover object-center"
                  />
                </div>
              );

              return (
                <div key={banner.id} className="min-w-0 flex-[0_0_100%]">
                  {banner.productId ? (
                    <Link
                      href={`/produto/${banner.productId}`}
                      className="block h-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-coffee-400"
                    >
                      {slide}
                    </Link>
                  ) : (
                    slide
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {banners.length > 1 && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute left-1.5 top-1/2 z-10 h-8 w-8 -translate-y-1/2 rounded-full bg-white/90 text-stone-800 shadow-sm hover:bg-white sm:left-2 sm:h-9 sm:w-9"
              aria-label="Banner anterior"
              onClick={() => emblaApi?.scrollPrev()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1.5 top-1/2 z-10 h-8 w-8 -translate-y-1/2 rounded-full bg-white/90 text-stone-800 shadow-sm hover:bg-white sm:right-2 sm:h-9 sm:w-9"
              aria-label="Próximo banner"
              onClick={() => emblaApi?.scrollNext()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
              {banners.map((banner, index) => (
                <button
                  key={banner.id}
                  type="button"
                  aria-label={`Ir para banner ${index + 1}`}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-colors sm:h-2 sm:w-2",
                    selected === index ? "bg-white" : "bg-white/50"
                  )}
                  onClick={() => emblaApi?.scrollTo(index)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
