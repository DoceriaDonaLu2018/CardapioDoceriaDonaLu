"use client";

import nextDynamic from "next/dynamic";

/**
 * Wrapper client para carregar o Recharts só no navegador (ssr: false).
 * O `dynamic({ ssr: false })` precisa viver dentro de um Client Component —
 * não é permitido em Server Components no App Router.
 */
export const TopProductsChart = nextDynamic(
  () =>
    import("@/components/admin/dashboard-charts").then(
      (mod) => mod.TopProductsChart
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[280px] items-center justify-center text-sm text-stone-400">
        Carregando gráfico…
      </div>
    ),
  }
);

export const WeeklyEvolutionChart = nextDynamic(
  () =>
    import("@/components/admin/dashboard-charts").then(
      (mod) => mod.WeeklyEvolutionChart
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[180px] items-center justify-center text-sm text-stone-400">
        Carregando gráfico…
      </div>
    ),
  }
);
