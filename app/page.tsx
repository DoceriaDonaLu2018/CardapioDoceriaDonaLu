import { prisma } from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/ProductCard";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Busca as categorias com seus produtos disponíveis, direto do banco.
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: {
      products: {
        where: { isAvailable: true, isDeleted: false },
        orderBy: { title: "asc" },
      },
    },
  });

  // Mantém no menu apenas categorias que tenham ao menos um produto.
  const visibleCategories = categories.filter(
    (category) => category.products.length > 0
  );

  const headerCategories = visibleCategories.map((category) => ({
    id: category.slug,
    label: category.name,
  }));

  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      <Header categories={headerCategories} />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-stone-200 bg-white">
          <div className="container flex flex-col items-center gap-4 py-16 text-center">
            <span className="rounded-full bg-coffee-100 px-4 py-1 text-sm font-medium text-coffee-700">
              Doceria Artesanal
            </span>
            <h1 className="font-serif text-4xl font-bold text-stone-800 sm:text-5xl">
              Doceria Dona Lu
            </h1>
            <p className="max-w-xl text-base text-stone-500">
              Doces preparados com carinho. Explore nosso cardápio e descubra
              bolos, tortas, doces finos e sobremesas irresistíveis.
            </p>
          </div>
        </section>

        {/* Seções por categoria */}
        <div className="container py-12">
          {visibleCategories.length === 0 ? (
            <p className="py-20 text-center text-stone-500">
              O cardápio está sendo preparado. Volte em breve!
            </p>
          ) : (
            visibleCategories.map((category) => (
              <section
                key={category.id}
                id={category.slug}
                className="scroll-mt-20 py-10"
              >
                <div className="mb-6 flex items-center gap-4">
                  <h2 className="font-serif text-3xl font-bold text-stone-800">
                    {category.name}
                  </h2>
                  <span className="h-px flex-1 bg-stone-200" />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
                  {category.products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
