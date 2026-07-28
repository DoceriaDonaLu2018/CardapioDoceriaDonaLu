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
      className="relative w-full overflow-hidden bg-stone-900"
      aria-label="Promoções"
    >
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {banners.map((banner) => {
            const content = (
              <div className="relative aspect-[21/9] min-h-[160px] w-full sm:min-h-[220px] md:min-h-[280px]">
                <Image
                  src={banner.imageUrl}
                  alt="Promoção Doceria Dona Lu"
                  fill
                  priority
                  sizes="100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
              </div>
            );

            return (
              <div key={banner.id} className="min-w-0 flex-[0_0_100%]">
                {banner.productId ? (
                  <Link
                    href={`/produto/${banner.productId}`}
                    className="block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-coffee-400"
                  >
                    {content}
                  </Link>
                ) : (
                  content
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
            className="absolute left-2 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-white/90 text-stone-800 shadow hover:bg-white"
            aria-label="Banner anterior"
            onClick={() => emblaApi?.scrollPrev()}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-white/90 text-stone-800 shadow hover:bg-white"
            aria-label="Próximo banner"
            onClick={() => emblaApi?.scrollNext()}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>

          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {banners.map((banner, index) => (
              <button
                key={banner.id}
                type="button"
                aria-label={`Ir para banner ${index + 1}`}
                className={cn(
                  "h-2 w-2 rounded-full transition-colors",
                  selected === index ? "bg-white" : "bg-white/50"
                )}
                onClick={() => emblaApi?.scrollTo(index)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
