"use client";

import { useMemo, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Loader2, Plus, Save, Trash2 } from "lucide-react";

import {
  saveFichaTecnica,
  type SaveFichaInput,
} from "@/app/admin/ficha-tecnica/actions";
import {
  computePricing,
  UNITS,
  type PricingInput,
  type PricingMode,
  type Unit,
} from "@/lib/pricing";
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
};

type ProductOption = {
  id: string;
  title: string;
  price: number;
  pricingStrategy: string | null;
  pricingValue: number | null;
  recipeItems: {
    quantityUsed: number;
    ingredient: IngredientOption;
  }[];
};

interface FichaTecnicaClientProps {
  products: ProductOption[];
  ingredients: IngredientOption[];
}

const CUSTOM_INGREDIENT = "__custom__";

const PRICING_MODES: { value: PricingMode; label: string; suffix: string }[] = [
  { value: "markupPercent", label: "Lucro sobre custo (marcação %)", suffix: "%" },
  { value: "marginPercent", label: "Margem de lucro (%)", suffix: "%" },
  { value: "fixedProfit", label: "Valor fixo de lucro (R$)", suffix: "R$" },
  { value: "finalPrice", label: "Informar preço final (R$)", suffix: "R$" },
];

const COST_PRESETS: {
  label: string;
  kind: "fixed" | "percent";
  isPackaging?: boolean;
}[] = [
  { label: "Embalagem", kind: "fixed", isPackaging: true },
  { label: "Gás", kind: "fixed" },
  { label: "Energia", kind: "fixed" },
  { label: "Mão de obra", kind: "fixed" },
  { label: "Taxa de cartão", kind: "percent" },
  { label: "Comissão", kind: "percent" },
];

const ingredientSchema = z.object({
  ingredientId: z.string().optional(),
  name: z.string(),
  packagePrice: z.number(),
  packageQuantity: z.number(),
  unit: z.enum(UNITS),
  quantityUsed: z.number(),
});

const costSchema = z.object({
  label: z.string(),
  kind: z.enum(["fixed", "percent"]),
  value: z.number(),
  isPackaging: z.boolean().optional(),
});

const formSchema = z.object({
  productId: z.string(),
  ingredients: z.array(ingredientSchema),
  additionalCosts: z.array(costSchema),
  mode: z.enum(["markupPercent", "marginPercent", "fixedProfit", "finalPrice"]),
  strategyValue: z.number(),
});

type FormValues = z.infer<typeof formSchema>;

const emptyIngredient = (): FormValues["ingredients"][number] => ({
  ingredientId: "",
  name: "",
  packagePrice: 0,
  packageQuantity: 0,
  unit: "g",
  quantityUsed: 0,
});

const num = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function FichaTecnicaClient({
  products,
  ingredients,
}: FichaTecnicaClientProps) {
  const [isPending, startTransition] = useTransition();
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { control, register, watch, setValue, reset, getValues } =
    useForm<FormValues>({
      resolver: zodResolver(formSchema),
      defaultValues: {
        productId: "",
        ingredients: [emptyIngredient()],
        additionalCosts: [],
        mode: "markupPercent",
        strategyValue: 100,
      },
    });

  const ingredientArray = useFieldArray({ control, name: "ingredients" });
  const costArray = useFieldArray({ control, name: "additionalCosts" });

  const values = watch();

  const result = useMemo(() => {
    const input: PricingInput = {
      ingredients: values.ingredients.map((line) => ({
        name: line.name ?? "",
        packagePrice: num(line.packagePrice),
        packageQuantity: num(line.packageQuantity),
        unit: line.unit,
        quantityUsed: num(line.quantityUsed),
      })),
      additionalCosts: values.additionalCosts.map((cost) => ({
        label: cost.label,
        kind: cost.kind,
        value: num(cost.value),
        isPackaging: cost.isPackaging,
      })),
      mode: values.mode,
      strategyValue: num(values.strategyValue),
    };
    return computePricing(input);
  }, [values]);

  const selectedMode = PRICING_MODES.find((m) => m.value === values.mode);

  function handleSelectProduct(productId: string) {
    setSaveMessage(null);
    setSaveError(null);

    if (!productId) {
      reset({
        productId: "",
        ingredients: [emptyIngredient()],
        additionalCosts: getValues("additionalCosts"),
        mode: "markupPercent",
        strategyValue: 100,
      });
      return;
    }

    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const recipeLines =
      product.recipeItems.length > 0
        ? product.recipeItems.map((item) => ({
            ingredientId: item.ingredient.id,
            name: item.ingredient.name,
            packagePrice: item.ingredient.purchasePrice,
            packageQuantity: item.ingredient.purchaseQuantity,
            unit: (UNITS as readonly string[]).includes(item.ingredient.unit)
              ? (item.ingredient.unit as Unit)
              : ("un" as Unit),
            quantityUsed: item.quantityUsed,
          }))
        : [emptyIngredient()];

    reset({
      productId,
      ingredients: recipeLines,
      additionalCosts: getValues("additionalCosts"),
      mode: (product.pricingStrategy as PricingMode) ?? "markupPercent",
      strategyValue: product.pricingValue ?? 100,
    });
  }

  function applyIngredientPreset(index: number, ingredientId: string) {
    if (ingredientId === CUSTOM_INGREDIENT) {
      setValue(`ingredients.${index}.ingredientId`, "");
      return;
    }

    const ingredient = ingredients.find((i) => i.id === ingredientId);
    if (!ingredient) return;

    setValue(`ingredients.${index}.ingredientId`, ingredient.id);
    setValue(`ingredients.${index}.name`, ingredient.name);
    setValue(`ingredients.${index}.packagePrice`, ingredient.purchasePrice);
    setValue(
      `ingredients.${index}.packageQuantity`,
      ingredient.purchaseQuantity
    );
    setValue(
      `ingredients.${index}.unit`,
      (UNITS as readonly string[]).includes(ingredient.unit)
        ? (ingredient.unit as Unit)
        : ("un" as Unit)
    );
  }

  function handleSave() {
    setSaveMessage(null);
    setSaveError(null);

    const current = getValues();
    if (!current.productId) {
      setSaveError("Selecione um produto existente para salvar a ficha.");
      return;
    }

    const payload: SaveFichaInput = {
      productId: current.productId,
      mode: current.mode,
      strategyValue: num(current.strategyValue),
      sellingPrice: result.sellingPrice,
      totalCost: result.totalCost,
      ingredients: current.ingredients
        .filter((line) => line.name.trim() && num(line.quantityUsed) > 0)
        .map((line) => ({
          ingredientId: line.ingredientId || undefined,
          name: line.name.trim(),
          packagePrice: num(line.packagePrice),
          packageQuantity: num(line.packageQuantity),
          unit: line.unit,
          quantityUsed: num(line.quantityUsed),
        })),
    };

    startTransition(async () => {
      const res = await saveFichaTecnica(payload);
      if (res.error) {
        setSaveError(res.error);
        return;
      }
      setSaveMessage("Ficha técnica salva! Preço e custo do produto atualizados.");
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* LADO ESQUERDO — Formulário */}
      <div className="space-y-4">
        {/* Produto + salvar */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-stone-800">
              1. Produto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Controller
              control={control}
              name="productId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value === CUSTOM_INGREDIENT ? "" : value);
                    handleSelectProduct(
                      value === CUSTOM_INGREDIENT ? "" : value
                    );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um produto..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CUSTOM_INGREDIENT}>
                      Novo cálculo (produto avulso)
                    </SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                onClick={handleSave}
                disabled={isPending || !values.productId}
                className="bg-coffee-600 text-white hover:bg-coffee-700"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar ficha técnica
              </Button>
              {!values.productId && (
                <p className="text-xs text-stone-400">
                  Selecione um produto existente para persistir a receita e
                  atualizar o preço.
                </p>
              )}
              {saveMessage && (
                <p className="flex items-center gap-1.5 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {saveMessage}
                </p>
              )}
              {saveError && (
                <p className="text-xs text-red-600">{saveError}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Ingredientes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base text-stone-800">
              2. Ingredientes
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => ingredientArray.append(emptyIngredient())}
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {ingredientArray.fields.map((field, index) => (
              <div
                key={field.id}
                className="space-y-3 rounded-lg border border-stone-200 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-stone-400">
                    Ingrediente {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => ingredientArray.remove(index)}
                    aria-label="Remover ingrediente"
                    className="rounded p-1 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {ingredients.length > 0 && (
                  <Controller
                    control={control}
                    name={`ingredients.${index}.ingredientId`}
                    render={({ field: idField }) => (
                      <Select
                        value={idField.value || CUSTOM_INGREDIENT}
                        onValueChange={(value) =>
                          applyIngredientPreset(index, value)
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Usar ingrediente salvo..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={CUSTOM_INGREDIENT}>
                            Avulso (digitar)
                          </SelectItem>
                          {ingredients.map((ingredient) => (
                            <SelectItem
                              key={ingredient.id}
                              value={ingredient.id}
                            >
                              {ingredient.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}

                <div className="space-y-1">
                  <Label className="text-xs">Nome</Label>
                  <Input
                    {...register(`ingredients.${index}.name`)}
                    placeholder="Ex.: Queijo muçarela"
                    className="h-8"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Emb. (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      {...register(`ingredients.${index}.packagePrice`, {
                        valueAsNumber: true,
                      })}
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Qtd. emb.</Label>
                    <Input
                      type="number"
                      step="0.01"
                      {...register(`ingredients.${index}.packageQuantity`, {
                        valueAsNumber: true,
                      })}
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unid.</Label>
                    <Controller
                      control={control}
                      name={`ingredients.${index}.unit`}
                      render={({ field: unitField }) => (
                        <Select
                          value={unitField.value}
                          onValueChange={unitField.onChange}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {UNITS.map((unit) => (
                              <SelectItem key={unit} value={unit}>
                                {unit}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Usado</Label>
                    <Input
                      type="number"
                      step="0.01"
                      {...register(`ingredients.${index}.quantityUsed`, {
                        valueAsNumber: true,
                      })}
                      className="h-8"
                    />
                  </div>
                </div>
              </div>
            ))}
            {ingredientArray.fields.length === 0 && (
              <p className="text-sm text-stone-400">
                Nenhum ingrediente. Clique em Adicionar.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Custos adicionais */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-stone-800">
              3. Custos adicionais
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
                      label: preset.label,
                      kind: preset.kind,
                      value: 0,
                      isPackaging: preset.isPackaging,
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  {preset.label}
                </Button>
              ))}
            </div>

            {costArray.fields.map((field, index) => (
              <div key={field.id} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Descrição</Label>
                  <Input
                    {...register(`additionalCosts.${index}.label`)}
                    className="h-8"
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Controller
                    control={control}
                    name={`additionalCosts.${index}.kind`}
                    render={({ field: kindField }) => (
                      <Select
                        value={kindField.value}
                        onValueChange={kindField.onChange}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">R$</SelectItem>
                          <SelectItem value="percent">%</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">Valor</Label>
                  <Input
                    type="number"
                    step="0.01"
                    {...register(`additionalCosts.${index}.value`, {
                      valueAsNumber: true,
                    })}
                    className="h-8"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => costArray.remove(index)}
                  aria-label="Remover custo"
                  className="mb-1 rounded p-1.5 text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {costArray.fields.length === 0 && (
              <p className="text-sm text-stone-400">
                Nenhum custo adicional. Use os botões acima.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Estratégia */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-stone-800">
              4. Estratégia de precificação
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Como calcular</Label>
              <Controller
                control={control}
                name="mode"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICING_MODES.map((mode) => (
                        <SelectItem key={mode.value} value={mode.value}>
                          {mode.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Valor ({selectedMode?.suffix})
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

      {/* LADO DIREITO — Resultados */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <FichaResults result={result} />
      </div>
    </div>
  );
}
