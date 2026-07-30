"use client";

import { useMemo, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Loader2, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";

import { saveFichaTecnica } from "@/app/admin/ficha-tecnica/actions";
import {
  computeTechnicalSheetWithDesiredMarkup,
  type BaseRecipeSnapshot,
  type IngredientSnapshot,
  type SheetPricingResult,
} from "@/lib/ficha-tecnica/engine";
import { UNITS, type PricingMode, type Unit } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FichaResults } from "./ficha-results";

type IngredientOption = {
  id: string;
  name: string;
  purchasePrice: number;
  purchaseQuantity: number;
  unit: string;
  wastePercent: number;
};

type BaseRecipeOption = {
  id: string;
  name: string;
  yieldQuantity: number;
  yieldUnit: string;
  unitCostCache: number | null;
  items: BaseRecipeSnapshot["items"];
};

type CategoryOption = { id: string; name: string };

type SheetLineLoaded =
  | {
      componentType: "INGREDIENT";
      quantityUsed: number;
      ingredient: IngredientOption;
    }
  | {
      componentType: "BASE_RECIPE";
      quantityUsed: number;
      baseRecipeId: string;
    };

type ProductOption = {
  id: string;
  title: string;
  price: number;
  pricingStrategy: string | null;
  pricingValue: number | null;
  categoryId: string | null;
  recipeItems: {
    quantityUsed: number;
    ingredient: IngredientOption;
  }[];
  technicalSheet: {
    desiredMarkupPercent: number | null;
    lines: SheetLineLoaded[];
    dynamicCosts: Array<{
      name: string;
      kind: string;
      value: number;
    }>;
  } | null;
};

const CUSTOM = "__custom__";

const PRICING_MODES: { value: PricingMode; label: string; suffix: string }[] = [
  { value: "markupPercent", label: "Lucro sobre custo (marcação %)", suffix: "%" },
  { value: "marginPercent", label: "Margem de lucro (%)", suffix: "%" },
  { value: "fixedProfit", label: "Valor fixo de lucro (R$)", suffix: "R$" },
  { value: "finalPrice", label: "Informar preço final (R$)", suffix: "R$" },
];

const COST_PRESETS: { label: string; kind: "FIXED" | "PERCENT" }[] = [
  { label: "Embalagem", kind: "FIXED" },
  { label: "Energia", kind: "FIXED" },
  { label: "Gás", kind: "FIXED" },
  { label: "Mão de obra", kind: "FIXED" },
  { label: "Taxa de cartão", kind: "PERCENT" },
  { label: "Comissão", kind: "PERCENT" },
];

const ingredientLineSchema = z.object({
  componentType: z.literal("INGREDIENT"),
  ingredientId: z.string().optional(),
  name: z.string(),
  packagePrice: z.number(),
  packageQuantity: z.number(),
  unit: z.enum(UNITS),
  wastePercent: z.number(),
  quantityUsed: z.number(),
});

const baseLineSchema = z.object({
  componentType: z.literal("BASE_RECIPE"),
  baseRecipeId: z.string(),
  quantityUsed: z.number(),
});

const formSchema = z.object({
  productId: z.string(),
  lines: z.array(z.union([ingredientLineSchema, baseLineSchema])),
  dynamicCosts: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(["FIXED", "PERCENT"]),
      value: z.number(),
    })
  ),
  mode: z.enum(["markupPercent", "marginPercent", "fixedProfit", "finalPrice"]),
  strategyValue: z.number(),
  desiredMarkupPercent: z.number().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

const emptyIngredientLine = (): FormValues["lines"][number] => ({
  componentType: "INGREDIENT",
  ingredientId: "",
  name: "",
  packagePrice: 0,
  packageQuantity: 0,
  unit: "g",
  wastePercent: 0,
  quantityUsed: 0,
});

const num = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

function asUnit(unit: string): Unit {
  return (UNITS as readonly string[]).includes(unit) ? (unit as Unit) : "un";
}

export function FichaTecnicaClient({
  products,
  ingredients,
  baseRecipes,
  categories,
}: {
  products: ProductOption[];
  ingredients: IngredientOption[];
  baseRecipes: BaseRecipeOption[];
  categories: CategoryOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { control, register, watch, setValue, reset, getValues } =
    useForm<FormValues>({
      resolver: zodResolver(formSchema),
      defaultValues: {
        productId: "",
        lines: [emptyIngredientLine()],
        dynamicCosts: [],
        mode: "markupPercent",
        strategyValue: 150,
        desiredMarkupPercent: 150,
      },
    });

  const lineArray = useFieldArray({ control, name: "lines" });
  const costArray = useFieldArray({ control, name: "dynamicCosts" });
  const values = watch();

  const filteredProducts = useMemo(() => {
    if (categoryFilter === "all") return products;
    if (categoryFilter === "none") {
      return products.filter((p) => !p.categoryId);
    }
    return products.filter((p) => p.categoryId === categoryFilter);
  }, [products, categoryFilter]);

  const baseRecipesById = useMemo(() => {
    const map: Record<string, BaseRecipeSnapshot> = {};
    for (const r of baseRecipes) {
      map[r.id] = {
        id: r.id,
        name: r.name,
        yieldQuantity: r.yieldQuantity,
        yieldUnit: r.yieldUnit,
        items: r.items,
      };
    }
    return map;
  }, [baseRecipes]);

  const ingredientsById = useMemo(() => {
    const map: Record<string, IngredientSnapshot> = {};
    for (const ing of ingredients) {
      map[ing.id] = {
        id: ing.id,
        name: ing.name,
        purchasePrice: ing.purchasePrice,
        purchaseQuantity: ing.purchaseQuantity,
        unit: ing.unit,
        wastePercent: ing.wastePercent,
      };
    }
    // Overrides do formulário (preço/FC editados na hora)
    values.lines.forEach((line, index) => {
      if (line.componentType !== "INGREDIENT") return;
      const key = line.ingredientId || `draft-${index}`;
      map[key] = {
        id: key,
        name: line.name || "Ingrediente",
        purchasePrice: num(line.packagePrice),
        purchaseQuantity: num(line.packageQuantity),
        unit: line.unit,
        wastePercent: num(line.wastePercent),
      };
    });
    return map;
  }, [ingredients, values.lines]);

  const result: SheetPricingResult = useMemo(() => {
    const lines = values.lines
      .map((line, index) => {
        if (line.componentType === "INGREDIENT") {
          if (!(line.name?.trim() && num(line.quantityUsed) > 0)) return null;
          return {
            componentType: "INGREDIENT" as const,
            ingredientId: line.ingredientId || `draft-${index}`,
            name: line.name,
            quantityUsed: num(line.quantityUsed),
          };
        }
        if (!line.baseRecipeId || num(line.quantityUsed) <= 0) return null;
        return {
          componentType: "BASE_RECIPE" as const,
          baseRecipeId: line.baseRecipeId,
          quantityUsed: num(line.quantityUsed),
        };
      })
      .filter((l): l is NonNullable<typeof l> => l != null);

    return computeTechnicalSheetWithDesiredMarkup(
      {
        lines,
        dynamicCosts: values.dynamicCosts.map((c) => ({
          name: c.name,
          kind: c.kind,
          value: num(c.value),
        })),
        mode: values.mode,
        strategyValue: num(values.strategyValue),
        ingredientsById,
        baseRecipesById,
      },
      values.desiredMarkupPercent
    );
  }, [values, ingredientsById, baseRecipesById]);

  const selectedMode = PRICING_MODES.find((m) => m.value === values.mode);

  function loadProductLines(product: ProductOption): FormValues["lines"] {
    if (product.technicalSheet && product.technicalSheet.lines.length > 0) {
      return product.technicalSheet.lines.map((line) => {
        if (line.componentType === "BASE_RECIPE") {
          return {
            componentType: "BASE_RECIPE" as const,
            baseRecipeId: line.baseRecipeId,
            quantityUsed: line.quantityUsed,
          };
        }
        return {
          componentType: "INGREDIENT" as const,
          ingredientId: line.ingredient.id,
          name: line.ingredient.name,
          packagePrice: line.ingredient.purchasePrice,
          packageQuantity: line.ingredient.purchaseQuantity,
          unit: asUnit(line.ingredient.unit),
          wastePercent: line.ingredient.wastePercent,
          quantityUsed: line.quantityUsed,
        };
      });
    }
    if (product.recipeItems.length > 0) {
      return product.recipeItems.map((item) => ({
        componentType: "INGREDIENT" as const,
        ingredientId: item.ingredient.id,
        name: item.ingredient.name,
        packagePrice: item.ingredient.purchasePrice,
        packageQuantity: item.ingredient.purchaseQuantity,
        unit: asUnit(item.ingredient.unit),
        wastePercent: item.ingredient.wastePercent ?? 0,
        quantityUsed: item.quantityUsed,
      }));
    }
    return [emptyIngredientLine()];
  }

  function handleSelectProduct(productId: string) {
    setSaveMessage(null);
    setSaveError(null);

    if (!productId) {
      reset({
        productId: "",
        lines: [emptyIngredientLine()],
        dynamicCosts: getValues("dynamicCosts"),
        mode: "markupPercent",
        strategyValue: 150,
        desiredMarkupPercent: 150,
      });
      return;
    }

    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const sheet = product.technicalSheet;
    reset({
      productId,
      lines: loadProductLines(product),
      dynamicCosts:
        sheet?.dynamicCosts.map((c) => ({
          name: c.name,
          kind: c.kind === "PERCENT" ? ("PERCENT" as const) : ("FIXED" as const),
          value: c.value,
        })) ?? [],
      mode: (product.pricingStrategy as PricingMode) ?? "markupPercent",
      strategyValue: product.pricingValue ?? 150,
      desiredMarkupPercent: sheet?.desiredMarkupPercent ?? 150,
    });
  }

  function applyIngredientPreset(index: number, ingredientId: string) {
    if (ingredientId === CUSTOM) {
      setValue(`lines.${index}.ingredientId`, "");
      return;
    }
    const ingredient = ingredients.find((i) => i.id === ingredientId);
    if (!ingredient) return;
    setValue(`lines.${index}`, {
      componentType: "INGREDIENT",
      ingredientId: ingredient.id,
      name: ingredient.name,
      packagePrice: ingredient.purchasePrice,
      packageQuantity: ingredient.purchaseQuantity,
      unit: asUnit(ingredient.unit),
      wastePercent: ingredient.wastePercent,
      quantityUsed: num(
        (getValues(`lines.${index}`) as { quantityUsed?: number })?.quantityUsed
      ),
    });
  }

  function handleSave() {
    setSaveMessage(null);
    setSaveError(null);
    const current = getValues();
    if (!current.productId) {
      setSaveError("Selecione um produto existente para salvar a ficha.");
      return;
    }

    const payload = {
      productId: current.productId,
      mode: current.mode,
      strategyValue: num(current.strategyValue),
      desiredMarkupPercent: current.desiredMarkupPercent,
      lines: current.lines
        .map((line) => {
          if (line.componentType === "INGREDIENT") {
            if (!(line.name.trim() && num(line.quantityUsed) > 0)) return null;
            return {
              componentType: "INGREDIENT" as const,
              ingredientId: line.ingredientId || undefined,
              name: line.name.trim(),
              packagePrice: num(line.packagePrice),
              packageQuantity: num(line.packageQuantity),
              unit: line.unit,
              wastePercent: num(line.wastePercent),
              quantityUsed: num(line.quantityUsed),
            };
          }
          if (!line.baseRecipeId || num(line.quantityUsed) <= 0) return null;
          return {
            componentType: "BASE_RECIPE" as const,
            baseRecipeId: line.baseRecipeId,
            quantityUsed: num(line.quantityUsed),
          };
        })
        .filter((l): l is NonNullable<typeof l> => l != null),
      dynamicCosts: current.dynamicCosts
        .filter((c) => c.name.trim())
        .map((c) => ({
          name: c.name.trim(),
          kind: c.kind,
          value: num(c.value),
        })),
    };

    startTransition(async () => {
      const res = await saveFichaTecnica(payload);
      if (res.error) {
        setSaveError(res.error);
        return;
      }
      setSaveMessage(
        `Ficha salva. Custo ${res.totalCost?.toFixed(2)} · Preço ${res.sellingPrice?.toFixed(2)} (calculados no servidor).`
      );
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-stone-800">1. Produto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={categoryFilter}
                onValueChange={(value) => {
                  setCategoryFilter(value);
                  const currentId = getValues("productId");
                  if (!currentId) return;
                  const stillVisible = products.some((product) => {
                    if (product.id !== currentId) return false;
                    if (value === "all") return true;
                    if (value === "none") return !product.categoryId;
                    return product.categoryId === value;
                  });
                  if (!stillVisible) handleSelectProduct("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">Sem categoria</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Produto</Label>
              <Controller
                control={control}
                name="productId"
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    onValueChange={(value) => {
                      const id = value === CUSTOM ? "" : value;
                      field.onChange(id);
                      handleSelectProduct(id);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um produto..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={CUSTOM}>
                        Novo cálculo (avulso)
                      </SelectItem>
                      {filteredProducts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <Button
              type="button"
              onClick={handleSave}
              disabled={isPending || !values.productId}
              className="w-full bg-coffee-600 text-white hover:bg-coffee-700"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar ficha técnica
            </Button>
            {saveMessage && (
              <p className="flex items-center gap-1.5 text-xs text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {saveMessage}
              </p>
            )}
            {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            {result.errors.length > 0 && (
              <p className="text-xs text-amber-700">{result.errors[0]}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base text-stone-800">
              2. Composição (MP + receitas base)
            </CardTitle>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => lineArray.append(emptyIngredientLine())}
              >
                <Plus className="h-4 w-4" />
                Ingrediente
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={baseRecipes.length === 0}
                onClick={() =>
                  lineArray.append({
                    componentType: "BASE_RECIPE",
                    baseRecipeId: baseRecipes[0]?.id ?? "",
                    quantityUsed: 1,
                  })
                }
              >
                <Plus className="h-4 w-4" />
                Receita base
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {baseRecipes.length === 0 && (
              <p className="text-xs text-stone-500">
                Sem receitas base.{" "}
                <Link
                  href="/admin/receitas-base"
                  className="text-coffee-700 underline"
                >
                  Cadastre massas/recheios
                </Link>{" "}
                para reutilizar custo unitário.
              </p>
            )}

            {lineArray.fields.map((field, index) => {
              const line = values.lines[index];
              const isBase = line?.componentType === "BASE_RECIPE";
              return (
                <div
                  key={field.id}
                  className="space-y-3 rounded-lg border border-stone-200 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-stone-400">
                      {isBase ? "Receita base" : "Ingrediente"} {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => lineArray.remove(index)}
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                      aria-label="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {isBase ? (
                    <>
                      <Controller
                        control={control}
                        name={`lines.${index}.baseRecipeId`}
                        render={({ field: idField }) => (
                          <Select
                            value={idField.value || undefined}
                            onValueChange={idField.onChange}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Receita base..." />
                            </SelectTrigger>
                            <SelectContent>
                              {baseRecipes.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.name}
                                  {r.unitCostCache != null
                                    ? ` · R$ ${r.unitCostCache.toFixed(2)}/${r.yieldUnit}`
                                    : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Qtd. usada ({line && "baseRecipeId" in line
                            ? baseRecipes.find((r) => r.id === line.baseRecipeId)
                                ?.yieldUnit ?? "un"
                            : "un"}
                          )
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8"
                          {...register(`lines.${index}.quantityUsed`, {
                            valueAsNumber: true,
                          })}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      {ingredients.length > 0 && (
                        <Select
                          value={
                            (line && "ingredientId" in line && line.ingredientId) ||
                            CUSTOM
                          }
                          onValueChange={(v) => applyIngredientPreset(index, v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Usar salvo..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={CUSTOM}>Avulso</SelectItem>
                            {ingredients.map((ing) => (
                              <SelectItem key={ing.id} value={ing.id}>
                                {ing.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <div className="space-y-1">
                        <Label className="text-xs">Nome</Label>
                        <Input
                          className="h-8"
                          {...register(`lines.${index}.name`)}
                          placeholder="Ex.: Leite condensado"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Emb. (R$)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8"
                            {...register(`lines.${index}.packagePrice`, {
                              valueAsNumber: true,
                            })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Qtd. emb.</Label>
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8"
                            {...register(`lines.${index}.packageQuantity`, {
                              valueAsNumber: true,
                            })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Unid.</Label>
                          <Controller
                            control={control}
                            name={`lines.${index}.unit`}
                            render={({ field: unitField }) => (
                              <Select
                                value={
                                  unitField.value &&
                                  typeof unitField.value === "string"
                                    ? unitField.value
                                    : "g"
                                }
                                onValueChange={unitField.onChange}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {UNITS.map((u) => (
                                    <SelectItem key={u} value={u}>
                                      {u}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Perda % (FC)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            className="h-8"
                            {...register(`lines.${index}.wastePercent`, {
                              valueAsNumber: true,
                            })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Usado</Label>
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8"
                            {...register(`lines.${index}.quantityUsed`, {
                              valueAsNumber: true,
                            })}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-stone-800">
              3. Custos adicionais (dinâmicos)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {COST_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    costArray.append({
                      name: preset.label,
                      kind: preset.kind,
                      value: 0,
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  {preset.label}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  costArray.append({
                    name: "Novo custo",
                    kind: "FIXED",
                    value: 0,
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Personalizado
              </Button>
            </div>

            {costArray.fields.map((field, index) => (
              <div
                key={field.id}
                className="grid grid-cols-[1fr_100px_90px_auto] items-end gap-2"
              >
                <div className="space-y-1">
                  <Label className="text-xs">Nome</Label>
                  <Input
                    className="h-8"
                    {...register(`dynamicCosts.${index}.name`)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Controller
                    control={control}
                    name={`dynamicCosts.${index}.kind`}
                    render={({ field: kindField }) => (
                      <Select
                        value={kindField.value}
                        onValueChange={kindField.onChange}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FIXED">R$</SelectItem>
                          <SelectItem value="PERCENT">%</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8"
                    {...register(`dynamicCosts.${index}.value`, {
                      valueAsNumber: true,
                    })}
                  />
                </div>
                <button
                  type="button"
                  className="mb-0.5 rounded p-1 text-red-500 hover:bg-red-50"
                  onClick={() => costArray.remove(index)}
                  aria-label="Remover custo"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-stone-800">
              4. Precificação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Markup desejado (%) — sugere preço ideal</Label>
              <Input
                type="number"
                step="1"
                {...register("desiredMarkupPercent", {
                  setValueAs: (v) =>
                    v === "" || v == null ? null : Number(v),
                })}
              />
            </div>
            <div className="space-y-1">
              <Label>Estratégia aplicada ao salvar</Label>
              <Controller
                control={control}
                name="mode"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICING_MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1">
              <Label>
                Valor da estratégia ({selectedMode?.suffix ?? ""})
              </Label>
              <Input
                type="number"
                step="0.01"
                {...register("strategyValue", { valueAsNumber: true })}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <FichaResults result={result} />
      </div>
    </div>
  );
}
