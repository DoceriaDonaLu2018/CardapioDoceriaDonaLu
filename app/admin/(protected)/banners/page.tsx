import { Plus } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { BannerFormDialog } from "./banner-form-dialog";
import { BannersDndList } from "./banners-dnd-list";

export const dynamic = "force-dynamic";

export default async function BannersPage() {
  const [banners, products] = await Promise.all([
    prisma.banner.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        imageUrl: true,
        productId: true,
        isActive: true,
        order: true,
        startDate: true,
        endDate: true,
        product: { select: { title: true } },
      },
    }),
    prisma.product.findMany({
      where: { isDeleted: false },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-stone-800">
            Banners
          </h1>
          <p className="mt-1 text-stone-500">
            Promoções no carrossel do topo do cardápio.
          </p>
        </div>

        <BannerFormDialog
          products={products}
          trigger={
            <Button className="bg-coffee-600 text-white hover:bg-coffee-700">
              <Plus className="h-4 w-4" />
              Novo banner
            </Button>
          }
        />
      </div>

      <BannersDndList
        products={products}
        initialBanners={banners.map((banner) => ({
          id: banner.id,
          imageUrl: banner.imageUrl,
          productId: banner.productId,
          productTitle: banner.product?.title ?? null,
          isActive: banner.isActive,
          order: banner.order,
          startDate: banner.startDate?.toISOString() ?? null,
          endDate: banner.endDate?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
