import {
  CalendarDays,
  CalendarRange,
  CircleDollarSign,
  CreditCard,
  TrendingUp,
} from "lucide-react";

import { getDashboardData } from "@/lib/dashboard-metrics";
import { formatPercent, formatPrice } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CategorySalesList } from "@/components/admin/category-sales-list";
import {
  PaymentMethodsChart,
  TopProductsChart,
  WeeklyEvolutionChart,
} from "@/components/admin/dashboard-charts-lazy";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  const preferredLabel =
    data.preferredPaymentMethod.label ?? "Sem dados ainda";
  const preferredHint =
    data.preferredPaymentMethod.count > 0
      ? `${data.preferredPaymentMethod.count} pedido${data.preferredPaymentMethod.count === 1 ? "" : "s"} com forma registrada`
      : "Pedidos antigos sem forma de pagamento são ignorados";

  const kpiCards = [
    {
      label: "Faturamento do Dia",
      value: formatPrice(data.today.revenue),
      hint: `${data.today.orderCount} pedido${data.today.orderCount === 1 ? "" : "s"} concluído${data.today.orderCount === 1 ? "" : "s"}`,
      icon: CircleDollarSign,
    },
    {
      label: "Faturamento da Semana",
      value: formatPrice(data.week.revenue),
      hint: `Últimos 7 dias · lucro ${formatPrice(data.week.profit)}`,
      icon: CalendarRange,
    },
    {
      label: "Faturamento do Mês",
      value: formatPrice(data.month.revenue),
      hint: `Lucro ${formatPrice(data.month.profit)} · margem ${formatPercent(data.month.margin)}`,
      icon: CalendarDays,
      highlight: true,
    },
    {
      label: "Método de Pagamento Preferido",
      value: preferredLabel,
      hint: preferredHint,
      icon: CreditCard,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-800">
          Dashboard
        </h1>
        <p className="mt-1 text-stone-500">
          Visão financeira das vendas concluídas (faturamento e lucro).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-stone-500">
                  {card.label}
                </CardTitle>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-coffee-100 text-coffee-700">
                  <Icon className="h-4 w-4" />
                </span>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tracking-tight text-stone-800 sm:text-3xl">
                  {card.value}
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-stone-500">
                  {card.highlight && (
                    <TrendingUp className="h-3.5 w-3.5 text-coffee-600" />
                  )}
                  {card.hint}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg text-stone-800">
              Top 7 Produtos Mais Vendidos
            </CardTitle>
            <CardDescription>
              Quantidade vendida no mês civil atual (pedidos concluídos).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TopProductsChart data={data.topProducts} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg text-stone-800">
              Evolução Semanal
            </CardTitle>
            <CardDescription>
              Receita diária dos últimos 7 dias.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <WeeklyEvolutionChart data={data.weeklyEvolution} />

            <div>
              <h3 className="mb-3 text-sm font-semibold text-stone-700">
                Vendas por categoria (30 dias)
              </h3>
              <CategorySalesList data={data.categorySales} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-stone-800">
            Top 3 Formas de Pagamento
          </CardTitle>
          <CardDescription>
            Pedidos e valor total por método (Pix, cartões e dinheiro
            normalizados). Pedidos sem forma registrada são ignorados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentMethodsChart data={data.topPaymentMethods} />
        </CardContent>
      </Card>
    </div>
  );
}
