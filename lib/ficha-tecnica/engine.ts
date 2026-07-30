/**
 * Engine de Cálculo — Ficha Técnica Enterprise (Doceria Dona Lu).
 *
 * FUNÇÕES PURAS / testáveis — zero Prisma, zero React.
 * Toda precisão financeira deve passar por aqui no back-end antes de gravar
 * Product.costPrice / Product.price (nunca confiar no front).
 *
 * Conceitos:
 * - Matéria-prima (Ingredient) com Fator de Correção / desperdício (waste%).
 * - Sub-receita (BaseRecipe) = soma de linhas / rendimento → custo unitário.
 * - Ficha do produto = ingredientes + sub-receitas + custos dinâmicos + markup.
 *
 * Compat: `lib/pricing.ts` permanece para a UI legado; esta engine é o alvo novo.
 */

export const FICHA_UNITS = ["kg", "g", "mg", "L", "ml", "un"] as const;
export type FichaUnit = (typeof FICHA_UNITS)[number];

export type DynamicCostKind = "FIXED" | "PERCENT";

export type PricingMode =
  | "markupPercent"
  | "marginPercent"
  | "fixedProfit"
  | "finalPrice";

export type IngredientSnapshot = {
  id: string;
  name: string;
  purchasePrice: number;
  purchaseQuantity: number;
  unit: FichaUnit | string;
  /** % de perda (0–99.99). Ex.: 20 → só 80% utilizável. */
  wastePercent: number;
};

export type BaseRecipeItemSnapshot =
  | {
      componentType: "INGREDIENT";
      ingredientId: string;
      quantityUsed: number;
    }
  | {
      componentType: "BASE_RECIPE";
      nestedBaseRecipeId: string;
      quantityUsed: number;
    };

export type BaseRecipeSnapshot = {
  id: string;
  name: string;
  yieldQuantity: number;
  yieldUnit: FichaUnit | string;
  items: BaseRecipeItemSnapshot[];
};

export type SheetLineSnapshot =
  | {
      componentType: "INGREDIENT";
      ingredientId: string;
      name?: string;
      quantityUsed: number;
    }
  | {
      componentType: "BASE_RECIPE";
      baseRecipeId: string;
      name?: string;
      quantityUsed: number;
    };

export type DynamicCostSnapshot = {
  name: string;
  kind: DynamicCostKind;
  value: number;
};

export type SheetPricingInput = {
  lines: SheetLineSnapshot[];
  dynamicCosts: DynamicCostSnapshot[];
  mode: PricingMode;
  /** Ex.: markup 150, margem 40, lucro fixo R$, ou preço final. */
  strategyValue: number;
  ingredientsById: Record<string, IngredientSnapshot>;
  baseRecipesById: Record<string, BaseRecipeSnapshot>;
};

export type LineCostBreakdown = {
  componentType: "INGREDIENT" | "BASE_RECIPE";
  refId: string;
  name: string;
  quantityUsed: number;
  unitCost: number;
  lineCost: number;
  sharePercent: number;
};

export type SheetPricingResult = {
  recipeCost: number;
  additionalFixedCost: number;
  additionalPercentRate: number;
  additionalPercentCost: number;
  totalCost: number;
  sellingPrice: number;
  netProfit: number;
  marginPercent: number;
  markupPercent: number;
  suggestedPriceByDesiredMarkup: number | null;
  lineCosts: LineCostBreakdown[];
  isValid: boolean;
  errors: string[];
};

const MONEY_EPS = 1e-9;

export function roundMoney(value: number, digits = 4): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function round2(value: number): number {
  return roundMoney(value, 2);
}

function clampNonNeg(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function clampWastePercent(wastePercent: number): number {
  if (!Number.isFinite(wastePercent) || wastePercent <= 0) return 0;
  // Cap 99.99 — 100% perda tornaria o custo infinito.
  return Math.min(wastePercent, 99.99);
}

/**
 * Custo por unidade UTILIZÁVEL da matéria-prima.
 *
 * Ex.: compra 1 kg por R$ 10, waste 20% → utilizável = 0,8 kg
 * unitCost = 10 / 0,8 = R$ 12,50 / kg
 */
export function computeUsableUnitCost(ingredient: IngredientSnapshot): number {
  const qty = clampNonNeg(ingredient.purchaseQuantity);
  if (qty === 0) return 0;

  const waste = clampWastePercent(ingredient.wastePercent);
  const usableQty = qty * (1 - waste / 100);
  if (usableQty <= MONEY_EPS) return 0;

  return clampNonNeg(ingredient.purchasePrice) / usableQty;
}

/** Custo de uma quantidade usada (já em unidade utilizável da receita). */
export function computeIngredientLineCost(
  ingredient: IngredientSnapshot,
  quantityUsed: number
): number {
  return computeUsableUnitCost(ingredient) * clampNonNeg(quantityUsed);
}

export class RecipeCycleError extends Error {
  constructor(public readonly recipeId: string) {
    super(`Ciclo detectado na sub-receita ${recipeId}`);
    this.name = "RecipeCycleError";
  }
}

export class MissingRefError extends Error {
  constructor(
    public readonly kind: "INGREDIENT" | "BASE_RECIPE",
    public readonly refId: string
  ) {
    super(`${kind} não encontrado: ${refId}`);
    this.name = "MissingRefError";
  }
}

/**
 * Custo total e unitário de uma sub-receita.
 * unitCost = totalCost / yieldQuantity
 */
export function computeBaseRecipeCost(
  recipeId: string,
  ingredientsById: Record<string, IngredientSnapshot>,
  baseRecipesById: Record<string, BaseRecipeSnapshot>,
  visiting: Set<string> = new Set()
): { totalCost: number; unitCost: number; yieldQuantity: number; name: string } {
  if (visiting.has(recipeId)) {
    throw new RecipeCycleError(recipeId);
  }

  const recipe = baseRecipesById[recipeId];
  if (!recipe) throw new MissingRefError("BASE_RECIPE", recipeId);

  visiting.add(recipeId);

  let totalCost = 0;
  for (const item of recipe.items) {
    const qty = clampNonNeg(item.quantityUsed);
    if (qty === 0) continue;

    if (item.componentType === "INGREDIENT") {
      const ing = ingredientsById[item.ingredientId];
      if (!ing) throw new MissingRefError("INGREDIENT", item.ingredientId);
      totalCost += computeIngredientLineCost(ing, qty);
    } else {
      const nested = computeBaseRecipeCost(
        item.nestedBaseRecipeId,
        ingredientsById,
        baseRecipesById,
        visiting
      );
      totalCost += nested.unitCost * qty;
    }
  }

  visiting.delete(recipeId);

  const yieldQuantity = clampNonNeg(recipe.yieldQuantity);
  const unitCost = yieldQuantity > 0 ? totalCost / yieldQuantity : 0;

  return {
    totalCost: roundMoney(totalCost),
    unitCost: roundMoney(unitCost),
    yieldQuantity,
    name: recipe.name,
  };
}

/**
 * Resolve preço de venda com custos % sobre o próprio preço (álgebra, sem loop).
 * Mesma lógica consolidada do motor legado em `lib/pricing.ts`.
 */
export function resolveSellingPrice(
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
      return { price: clampNonNeg(value), isValid: value > 0 };
    }
    default:
      return { price: 0, isValid: false };
  }
}

/**
 * Preço sugerido para atingir um markup desejado sobre o custo-base
 * (ingredientes + sub-receitas + custos fixos), já embutindo taxas %.
 */
export function suggestPriceForMarkup(
  baseCost: number,
  percentRate: number,
  desiredMarkupPercent: number
): number {
  const { price, isValid } = resolveSellingPrice(
    baseCost,
    percentRate,
    "markupPercent",
    desiredMarkupPercent
  );
  return isValid ? round2(price) : 0;
}

/** Cálculo completo da ficha técnica do produto final. */
export function computeTechnicalSheetPricing(
  input: SheetPricingInput
): SheetPricingResult {
  const errors: string[] = [];
  const lineCosts: LineCostBreakdown[] = [];
  let recipeCost = 0;

  for (const line of input.lines) {
    const qty = clampNonNeg(line.quantityUsed);
    if (qty === 0) continue;

    try {
      if (line.componentType === "INGREDIENT") {
        const ing = input.ingredientsById[line.ingredientId];
        if (!ing) throw new MissingRefError("INGREDIENT", line.ingredientId);
        const unitCost = computeUsableUnitCost(ing);
        const lineCost = unitCost * qty;
        recipeCost += lineCost;
        lineCosts.push({
          componentType: "INGREDIENT",
          refId: line.ingredientId,
          name: line.name?.trim() || ing.name,
          quantityUsed: qty,
          unitCost: roundMoney(unitCost),
          lineCost: roundMoney(lineCost),
          sharePercent: 0,
        });
      } else {
        const base = computeBaseRecipeCost(
          line.baseRecipeId,
          input.ingredientsById,
          input.baseRecipesById
        );
        const lineCost = base.unitCost * qty;
        recipeCost += lineCost;
        lineCosts.push({
          componentType: "BASE_RECIPE",
          refId: line.baseRecipeId,
          name: line.name?.trim() || base.name,
          quantityUsed: qty,
          unitCost: base.unitCost,
          lineCost: roundMoney(lineCost),
          sharePercent: 0,
        });
      }
    } catch (err) {
      if (err instanceof RecipeCycleError) {
        errors.push(
          `Ciclo nas sub-receitas (receita ${err.recipeId}). Remova a referência circular.`
        );
      } else if (err instanceof MissingRefError) {
        errors.push(`${err.kind} ausente: ${err.refId}`);
      } else {
        throw err;
      }
    }
  }

  recipeCost = roundMoney(recipeCost);
  for (const row of lineCosts) {
    row.sharePercent =
      recipeCost > 0 ? roundMoney((row.lineCost / recipeCost) * 100, 2) : 0;
  }

  let additionalFixedCost = 0;
  let additionalPercentRate = 0;
  for (const cost of input.dynamicCosts) {
    const value = clampNonNeg(cost.value);
    const name = cost.name?.trim() || "Custo";
    if (!name) continue;
    if (cost.kind === "FIXED") {
      additionalFixedCost += value;
    } else {
      additionalPercentRate += value / 100;
    }
  }
  additionalFixedCost = roundMoney(additionalFixedCost);

  const baseCost = roundMoney(recipeCost + additionalFixedCost);

  const { price, isValid: priceValid } = resolveSellingPrice(
    baseCost,
    additionalPercentRate,
    input.mode,
    input.strategyValue
  );

  const sellingPrice = round2(clampNonNeg(price));
  const additionalPercentCost = roundMoney(sellingPrice * additionalPercentRate);
  const totalCost = round2(baseCost + additionalPercentCost);
  const netProfit = round2(sellingPrice - totalCost);
  const marginPercent =
    sellingPrice > 0 ? roundMoney((netProfit / sellingPrice) * 100, 2) : 0;
  const markupPercent =
    totalCost > 0 ? roundMoney((netProfit / totalCost) * 100, 2) : 0;

  const isValid = priceValid && errors.length === 0;

  return {
    recipeCost: round2(recipeCost),
    additionalFixedCost: round2(additionalFixedCost),
    additionalPercentRate,
    additionalPercentCost: round2(additionalPercentCost),
    totalCost,
    sellingPrice,
    netProfit,
    marginPercent,
    markupPercent,
    suggestedPriceByDesiredMarkup: null,
    lineCosts,
    isValid,
    errors,
  };
}

/**
 * Atalho: calcula a ficha e anexa o preço sugerido para o markup desejado
 * (campo da UI "Margem de Lucro Desejada").
 */
export function computeTechnicalSheetWithDesiredMarkup(
  input: SheetPricingInput,
  desiredMarkupPercent: number | null | undefined
): SheetPricingResult {
  const result = computeTechnicalSheetPricing(input);
  const baseCost = result.recipeCost + result.additionalFixedCost;
  result.suggestedPriceByDesiredMarkup =
    desiredMarkupPercent != null && Number.isFinite(desiredMarkupPercent)
      ? suggestPriceForMarkup(
          baseCost,
          result.additionalPercentRate,
          desiredMarkupPercent
        )
      : null;
  return result;
}

/** Impacto de mudança de preço de um ingrediente em fichas / produtos. */
export type CostImpactRow = {
  productId: string;
  productTitle: string;
  oldTotalCost: number;
  newTotalCost: number;
  oldPrice: number;
  oldMarginPercent: number;
  newMarginPercent: number;
  marginDelta: number;
  /** true se a margem caiu (prejuízo de margem / alerta). */
  marginReduced: boolean;
};

export function evaluateIngredientPriceImpact(params: {
  ingredientId: string;
  oldIngredient: IngredientSnapshot;
  newIngredient: IngredientSnapshot;
  /** Fichas afetadas (já filtradas no repositório). */
  sheets: Array<{
    productId: string;
    productTitle: string;
    currentPrice: number;
    lines: SheetLineSnapshot[];
    dynamicCosts: DynamicCostSnapshot[];
  }>;
  baseRecipesById: Record<string, BaseRecipeSnapshot>;
  ingredientsById: Record<string, IngredientSnapshot>;
}): CostImpactRow[] {
  const ingredientsOld = {
    ...params.ingredientsById,
    [params.ingredientId]: params.oldIngredient,
  };
  const ingredientsNew = {
    ...params.ingredientsById,
    [params.ingredientId]: params.newIngredient,
  };

  const rows: CostImpactRow[] = [];

  for (const sheet of params.sheets) {
    const oldResult = computeTechnicalSheetPricing({
      lines: sheet.lines,
      dynamicCosts: sheet.dynamicCosts,
      mode: "finalPrice",
      strategyValue: sheet.currentPrice,
      ingredientsById: ingredientsOld,
      baseRecipesById: params.baseRecipesById,
    });
    const newResult = computeTechnicalSheetPricing({
      lines: sheet.lines,
      dynamicCosts: sheet.dynamicCosts,
      mode: "finalPrice",
      strategyValue: sheet.currentPrice,
      ingredientsById: ingredientsNew,
      baseRecipesById: params.baseRecipesById,
    });

    rows.push({
      productId: sheet.productId,
      productTitle: sheet.productTitle,
      oldTotalCost: oldResult.totalCost,
      newTotalCost: newResult.totalCost,
      oldPrice: sheet.currentPrice,
      oldMarginPercent: oldResult.marginPercent,
      newMarginPercent: newResult.marginPercent,
      marginDelta: roundMoney(
        newResult.marginPercent - oldResult.marginPercent,
        2
      ),
      marginReduced: newResult.marginPercent + MONEY_EPS < oldResult.marginPercent,
    });
  }

  return rows.sort((a, b) => a.marginDelta - b.marginDelta);
}
