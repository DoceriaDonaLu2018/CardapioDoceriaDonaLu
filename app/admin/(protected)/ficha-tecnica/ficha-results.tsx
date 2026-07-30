"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Lightbulb,
  TrendingUp,
} from "lucide-react";

import { formatPercent, formatPrice } from "@/lib/format";
import {
  buildAlerts,
  buildProjection,
  buildSimulation,
  type PricingResult,
} from "@/lib/pricing";
import type { SheetPricingResult } from "@/lib/ficha-tecnica/engine";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const alertStyles = {
  danger: { box: "border-red-200 bg-red-50 text-red-800", Icon: AlertTriangle },
  warning: {
    box: "border-amber-200 bg-amber-50 text-amber-800",
    Icon: Lightbulb,
  },
  info: { box: "border-sky-200 bg-sky-50 text-sky-800", Icon: Info },
  success: {
    box: "border-green-200 bg-green-50 text-green-800",
    Icon: CheckCircle2,
  },
} as const;

function toPricingResult(result: SheetPricingResult): PricingResult {
  const costliest = result.lineCosts.reduce<(typeof result.lineCosts)[number] | null>(
    (max, item) => (max === null || item.lineCost > max.lineCost ? item : max),
    null
  );
  return {
    recipeCost: result.recipeCost,
    additionalFixedCost: result.additionalFixedCost,
    additionalPercentRate: result.additionalPercentRate,
    additionalPercentCost: result.additionalPercentCost,
    packagingCost: 0,
    totalCost: result.totalCost,
    sellingPrice: result.sellingPrice,
    netProfit: result.netProfit,
    marginPercent: result.marginPercent,
    markupPercent: result.markupPercent,
    ingredientCosts: result.lineCosts.map((line) => ({
      name: line.name,
      cost: line.lineCost,
      sharePercent: line.sharePercent,
    })),
    costliestIngredient:
      costliest && costliest.lineCost > 0 ? costliest.name : null,
    isValid: result.isValid,
  };
}

interface FichaResultsProps {
  result: SheetPricingResult;
}

export function FichaResults({ result }: FichaResultsProps) {
  const legacy = useMemo(() => toPricingResult(result), [result]);
  const baseCost = result.recipeCost + result.additionalFixedCost;

  const simulation = useMemo(
    () => buildSimulation(baseCost, result.additionalPercentRate),
    [baseCost, result.additionalPercentRate]
  );

  const projection = useMemo(
    () => buildProjection(result.sellingPrice, result.netProfit),
    [result.sellingPrice, result.netProfit]
  );

  const alerts = useMemo(() => buildAlerts(legacy), [legacy]);

  const additionalCostTotal =
    result.additionalFixedCost + result.additionalPercentCost;

  const kpis = [
    { label: "Custo da Receita", value: formatPrice(result.recipeCost) },
    { label: "Custo Adicional", value: formatPrice(additionalCostTotal) },
    { label: "Custo Total", value: formatPrice(result.totalCost) },
    {
      label: "Lucro Líquido",
      value: formatPrice(result.netProfit),
      tone: result.netProfit > 0 ? "profit" : "loss",
    },
  ] as const;

  return (
    <div className="space-y-4">
      <Card className="border-coffee-200 bg-coffee-50">
        <CardContent className="flex flex-wrap items-end justify-between gap-4 p-6">
          <div>
            <p className="text-sm font-medium text-coffee-700">
              Preço de Venda (estratégia)
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-coffee-800">
              {formatPrice(result.sellingPrice)}
            </p>
            {result.suggestedPriceByDesiredMarkup != null &&
              result.suggestedPriceByDesiredMarkup > 0 && (
                <p className="mt-2 text-sm text-coffee-700">
                  Sugestão pelo markup desejado:{" "}
                  <strong>
                    {formatPrice(result.suggestedPriceByDesiredMarkup)}
                  </strong>
                </p>
              )}
          </div>
          <div className="flex gap-6">
            <div className="text-right">
              <p className="text-xs text-coffee-600">Margem</p>
              <p className="text-lg font-semibold text-coffee-800">
                {formatPercent(result.marginPercent)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-coffee-600">Markup</p>
              <p className="text-lg font-semibold text-coffee-800">
                {formatPercent(result.markupPercent)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <p className="text-xs text-stone-500">{kpi.label}</p>
              <p
                className={cn(
                  "mt-1 text-lg font-semibold text-stone-800",
                  "tone" in kpi &&
                    kpi.tone === "profit" &&
                    "text-emerald-700",
                  "tone" in kpi && kpi.tone === "loss" && "text-red-700"
                )}
              >
                {kpi.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {alerts.map((alert) => {
        const style = alertStyles[alert.level];
        const Icon = style.Icon;
        return (
          <div
            key={alert.message}
            className={cn(
              "flex gap-2 rounded-lg border px-3 py-2 text-sm",
              style.box
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{alert.message}</p>
          </div>
        );
      })}

      {result.lineCosts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Breakdown da composição
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.lineCosts.map((line) => (
                  <TableRow key={`${line.componentType}-${line.refId}`}>
                    <TableCell className="font-medium">{line.name}</TableCell>
                    <TableCell className="text-xs text-stone-500">
                      {line.componentType === "BASE_RECIPE" ? "Base" : "MP"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(line.lineCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercent(line.sharePercent)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Simulação de markup</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Markup</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
                <TableHead className="text-right">Margem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {simulation.map((row) => (
                <TableRow key={row.markupPercent}>
                  <TableCell>{row.markupPercent}%</TableCell>
                  <TableCell className="text-right">
                    {formatPrice(row.sellingPrice)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPrice(row.netProfit)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(row.marginPercent)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Projeção de volume</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidades</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projection.map((row) => (
                <TableRow key={row.units}>
                  <TableCell>{row.units}</TableCell>
                  <TableCell className="text-right">
                    {formatPrice(row.revenue)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPrice(row.profit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
