// Motor de cálculo da Ficha Técnica (precificação).
// Funções puras, sem dependência de React/UI, para facilitar testes.

export const UNITS = ["kg", "g", "mg", "L", "ml", "un"] as const;
export type Unit = (typeof UNITS)[number];

export type PricingMode =
  | "markupPercent" // 1. Lucro sobre custo % (marcação)
  | "marginPercent" // 2. Margem de lucro %
  | "fixedProfit" // 3. Valor fixo de lucro (R$)
  | "finalPrice"; // 4. Informar preço final

export type IngredientLine = {
  name: string;
  packagePrice: number; // custo da embalagem fechada (R$)
  packageQuantity: number; // quantidade contida na embalagem
  unit: Unit;
  quantityUsed: number; // quantidade usada na receita (mesma unidade)
};

export type AdditionalCostKind = "fixed" | "percent";

export type AdditionalCost = {
  label: string;
  kind: AdditionalCostKind; // fixed = R$ | percent = % sobre o preço de venda
  value: number;
  isPackaging?: boolean; // marca custos de embalagem (para alertas)
};

export type PricingInput = {
  ingredients: IngredientLine[];
  additionalCosts: AdditionalCost[];
  mode: PricingMode;
  strategyValue: number;
};

export type IngredientCost = {
  name: string;
  cost: number; // custo rateado na receita
  sharePercent: number; // participação no custo da receita
};

export type PricingResult = {
  recipeCost: number; // custo dos ingredientes
  additionalFixedCost: number; // soma dos custos adicionais fixos (R$)
  additionalPercentRate: number; // soma dos percentuais (fração 0–1)
  additionalPercentCost: number; // valor em R$ dos percentuais sobre o preço
  packagingCost: number; // total marcado como embalagem (R$ fixo)
  totalCost: number; // custo total (fixo + percentual sobre preço)
  sellingPrice: number; // preço de venda sugerido/final
  netProfit: number; // lucro líquido (R$)
  marginPercent: number; // margem = lucro / preço * 100
  markupPercent: number; // markup = lucro / custo * 100
  ingredientCosts: IngredientCost[];
  costliestIngredient: string | null;
  isValid: boolean; // false quando a estratégia gera preço impossível
};

const clampNonNegative = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

/** Custo rateado de um ingrediente: (usado / embalagem) * preço da embalagem. */
export function computeIngredientCost(line: IngredientLine): number {
  const packageQuantity = clampNonNegative(line.packageQuantity);
  if (packageQuantity === 0) return 0;

  const used = clampNonNegative(line.quantityUsed);
  const price = clampNonNegative(line.packagePrice);

  return (used / packageQuantity) * price;
}

/** Soma o custo de todos os ingredientes da receita. */
export function computeRecipeCost(ingredients: IngredientLine[]): number {
  return ingredients.reduce((sum, line) => sum + computeIngredientCost(line), 0);
}

/**
 * Resolve o preço de venda de acordo com a estratégia, tratando o fato de
 * que custos percentuais (taxa de cartão, comissão) incidem sobre o próprio
 * preço de venda — o que gera uma dependência circular resolvida por álgebra.
 */
function resolveSellingPrice(
  baseCost: number,
  percentRate: number,
  mode: PricingMode,
  strategyValue: number
): { price: number; isValid: boolean } {
  const value = Number.isFinite(strategyValue) ? strategyValue : 0;

  switch (mode) {
    case "markupPercent": {
      const m = value / 100;
      const denominator = 1 - percentRate * (1 + m);
      if (denominator <= 0) return { price: 0, isValid: false };
      return { price: (baseCost * (1 + m)) / denominator, isValid: true };
    }
    case "marginPercent": {
      const mg = value / 100;
      const denominator = 1 - percentRate - mg;
      if (mg >= 1 || denominator <= 0) return { price: 0, isValid: false };
      return { price: baseCost / denominator, isValid: true };
    }
    case "fixedProfit": {
      const denominator = 1 - percentRate;
      if (denominator <= 0) return { price: 0, isValid: false };
      return { price: (baseCost + value) / denominator, isValid: true };
    }
    case "finalPrice": {
      return { price: clampNonNegative(value), isValid: value > 0 };
    }
    default:
      return { price: 0, isValid: false };
  }
}

/** Calcula o resultado financeiro completo da ficha técnica. */
export function computePricing(input: PricingInput): PricingResult {
  const recipeCost = computeRecipeCost(input.ingredients);

  let additionalFixedCost = 0;
  let additionalPercentRate = 0;
  let packagingCost = 0;

  for (const cost of input.additionalCosts) {
    const value = clampNonNegative(cost.value);
    if (cost.kind === "fixed") {
      additionalFixedCost += value;
      if (cost.isPackaging) packagingCost += value;
    } else {
      additionalPercentRate += value / 100;
    }
  }

  const baseCost = recipeCost + additionalFixedCost;

  const { price, isValid } = resolveSellingPrice(
    baseCost,
    additionalPercentRate,
    input.mode,
    input.strategyValue
  );

  const sellingPrice = clampNonNegative(price);
  const additionalPercentCost = sellingPrice * additionalPercentRate;
  const totalCost = baseCost + additionalPercentCost;
  const netProfit = sellingPrice - totalCost;

  const marginPercent = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;
  const markupPercent = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;

  const ingredientCosts: IngredientCost[] = input.ingredients.map((line) => {
    const cost = computeIngredientCost(line);
    return {
      name: line.name.trim() || "Ingrediente",
      cost,
      sharePercent: recipeCost > 0 ? (cost / recipeCost) * 100 : 0,
    };
  });

  const costliest = ingredientCosts.reduce<IngredientCost | null>(
    (max, item) => (max === null || item.cost > max.cost ? item : max),
    null
  );

  return {
    recipeCost,
    additionalFixedCost,
    additionalPercentRate,
    additionalPercentCost,
    packagingCost,
    totalCost,
    sellingPrice,
    netProfit,
    marginPercent,
    markupPercent,
    ingredientCosts,
    costliestIngredient:
      costliest && costliest.cost > 0 ? costliest.name : null,
    isValid,
  };
}

export type SimulationRow = {
  markupPercent: number;
  sellingPrice: number;
  netProfit: number;
  marginPercent: number;
};

/** Simula o preço para diferentes cenários de marcação (lucro sobre custo). */
export function buildSimulation(
  baseCost: number,
  percentRate: number,
  scenarios: number[] = [30, 50, 80, 100, 150]
): SimulationRow[] {
  return scenarios.map((markup) => {
    const { price } = resolveSellingPrice(
      baseCost,
      percentRate,
      "markupPercent",
      markup
    );
    const totalCost = baseCost + price * percentRate;
    const netProfit = price - totalCost;
    const marginPercent = price > 0 ? (netProfit / price) * 100 : 0;
    return { markupPercent: markup, sellingPrice: price, netProfit, marginPercent };
  });
}

export type ProjectionRow = {
  units: number;
  revenue: number;
  profit: number;
};

/** Projeção de faturamento e lucro para volumes de venda. */
export function buildProjection(
  sellingPrice: number,
  profitPerUnit: number,
  volumes: number[] = [10, 50, 100, 500]
): ProjectionRow[] {
  return volumes.map((units) => ({
    units,
    revenue: sellingPrice * units,
    profit: profitPerUnit * units,
  }));
}

export type FinancialAlert = {
  level: "danger" | "warning" | "info" | "success";
  message: string;
};

/** Gera alertas/dicas financeiras a partir do resultado calculado. */
export function buildAlerts(result: PricingResult): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];

  if (!result.isValid) {
    alerts.push({
      level: "danger",
      message:
        "A combinação de custos percentuais e estratégia é inviável (o preço tenderia ao infinito). Ajuste a margem ou as taxas.",
    });
    return alerts;
  }

  if (result.sellingPrice <= 0) {
    alerts.push({
      level: "info",
      message: "Preencha os dados da receita para calcular o preço de venda.",
    });
    return alerts;
  }

  if (result.netProfit <= 0) {
    alerts.push({
      level: "danger",
      message:
        "Prejuízo: o preço de venda não cobre o custo total. Reveja a precificação.",
    });
  } else if (result.marginPercent < 20) {
    alerts.push({
      level: "danger",
      message:
        "Atenção: margem de lucro perigosa para o setor alimentício (abaixo de 20%).",
    });
  } else if (result.marginPercent >= 60) {
    alerts.push({
      level: "success",
      message: "Excelente margem de lucro. Confira se o preço está competitivo.",
    });
  }

  if (
    result.packagingCost > 0 &&
    result.totalCost > 0 &&
    result.packagingCost / result.totalCost > 0.15
  ) {
    alerts.push({
      level: "warning",
      message:
        "A embalagem representa mais de 15% do custo total. Possível desperdício ou custo alto de embalagem.",
    });
  }

  const costliest = result.ingredientCosts.reduce<
    (typeof result.ingredientCosts)[number] | null
  >((max, item) => (max === null || item.cost > max.cost ? item : max), null);

  if (
    costliest &&
    result.recipeCost > 0 &&
    costliest.cost / result.recipeCost > 0.5
  ) {
    alerts.push({
      level: "warning",
      message: `O ingrediente "${costliest.name}" concentra mais da metade do custo da receita. Avalie fornecedores ou porções.`,
    });
  }

  if (result.additionalPercentRate >= 0.2) {
    alerts.push({
      level: "warning",
      message:
        "Taxas percentuais (cartão/comissão) somam 20% ou mais do preço. Isso reduz bastante o lucro líquido.",
    });
  }

  return alerts;
}
