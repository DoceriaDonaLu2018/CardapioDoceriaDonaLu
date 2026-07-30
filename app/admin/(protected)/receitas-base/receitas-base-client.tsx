"use client";

import { useMemo, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Trash2 } from "lucide-react";

import {
  deleteBaseRecipe,
  saveBaseRecipe,
} from "@/app/admin/receitas-base/actions";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteConfirmDialog } from "@/components/admin/delete-confirm-dialog";

const UNITS = ["kg", "g", "mg", "L", "ml", "un"] as const;

export type BaseRecipeListItem = {
  id: string;
  name: string;
  description: string | null;
  yieldQuantity: number;
  yieldUnit: string;
  unitCostCache: number | null;
  totalCostCache: number | null;
  items: Array<{
    componentType: string;
    quantityUsed: number;
    ingredientId: string | null;
    nestedBaseRecipeId: string | null;
    ingredientName: string | null;
    nestedName: string | null;
  }>;
};

type IngredientOption = {
  id: string;
  name: string;
  unit: string;
};

const itemSchema = z.discriminatedUnion("componentType", [
  z.object({
    componentType: z.literal("INGREDIENT"),
    ingredientId: z.string().min(8),
    quantityUsed: z.number().positive(),
  }),
  z.object({
    componentType: z.literal("BASE_RECIPE"),
    nestedBaseRecipeId: z.string().min(8),
    quantityUsed: z.number().positive(),
  }),
]);

const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  yieldQuantity: z.number().positive(),
  yieldUnit: z.enum(UNITS),
  items: z.array(itemSchema).min(1),
});

type FormValues = z.infer<typeof formSchema>;

function emptyItem(): FormValues["items"][number] {
  return {
    componentType: "INGREDIENT",
    ingredientId: "",
    quantityUsed: 1,
  } as FormValues["items"][number];
}

export function ReceitasBaseClient({
  recipes,
  ingredients,
}: {
  recipes: BaseRecipeListItem[];
  ingredients: IngredientOption[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <BaseRecipeFormDialog
          ingredients={ingredients}
          recipes={recipes}
          trigger={
            <Button className="bg-coffee-600 text-white hover:bg-coffee-700">
              <Plus className="h-4 w-4" />
              Nova receita base
            </Button>
          }
        />
      </div>

      <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
        {recipes.length === 0 ? (
          <li className="py-10 text-center text-sm text-stone-500">
            Nenhuma receita base. Cadastre massas, recheios e intermediários
            aqui.
          </li>
        ) : (
          recipes.map((recipe) => (
            <li
              key={recipe.id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-stone-800">{recipe.name}</p>
                <p className="text-xs text-stone-500">
                  Rende {recipe.yieldQuantity} {recipe.yieldUnit}
                  {recipe.unitCostCache != null
                    ? ` · custo/un ${formatPrice(recipe.unitCostCache)}`
                    : ""}
                  {recipe.totalCostCache != null
                    ? ` · total ${formatPrice(recipe.totalCostCache)}`
                    : ""}
                </p>
                <p className="mt-1 text-xs text-stone-400">
                  {recipe.items
                    .map((item) =>
                      item.componentType === "BASE_RECIPE"
                        ? `${item.quantityUsed}× ${item.nestedName ?? "base"}`
                        : `${item.quantityUsed} ${item.ingredientName ?? "MP"}`
                    )
                    .join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <BaseRecipeFormDialog
                  recipe={recipe}
                  ingredients={ingredients}
                  recipes={recipes}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      Editar
                    </Button>
                  }
                />
                <DeleteConfirmDialog
                  title="Excluir receita base?"
                  description={`Remover "${recipe.name}"? Não pode estar em uso em fichas.`}
                  onConfirm={async () => deleteBaseRecipe(recipe.id)}
                />
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function BaseRecipeFormDialog({
  recipe,
  ingredients,
  recipes,
  trigger,
}: {
  recipe?: BaseRecipeListItem;
  ingredients: IngredientOption[];
  recipes: BaseRecipeListItem[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const otherRecipes = useMemo(
    () => recipes.filter((r) => r.id !== recipe?.id),
    [recipes, recipe?.id]
  );

  const { control, register, handleSubmit, reset, watch, setValue } =
    useForm<FormValues>({
      resolver: zodResolver(formSchema),
      defaultValues: recipe
        ? {
            id: recipe.id,
            name: recipe.name,
            description: recipe.description ?? "",
            yieldQuantity: recipe.yieldQuantity,
            yieldUnit: (UNITS as readonly string[]).includes(recipe.yieldUnit)
              ? (recipe.yieldUnit as (typeof UNITS)[number])
              : "un",
            items: recipe.items.map((item) =>
              item.componentType === "BASE_RECIPE"
                ? {
                    componentType: "BASE_RECIPE" as const,
                    nestedBaseRecipeId: item.nestedBaseRecipeId ?? "",
                    quantityUsed: item.quantityUsed,
                  }
                : {
                    componentType: "INGREDIENT" as const,
                    ingredientId: item.ingredientId ?? "",
                    quantityUsed: item.quantityUsed,
                  }
            ),
          }
        : {
            name: "",
            description: "",
            yieldQuantity: 1,
            yieldUnit: "un",
            items: [emptyItem()],
          },
    });

  const itemsArray = useFieldArray({ control, name: "items" });
  const values = watch();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setError(null);
    if (next && recipe) {
      reset({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description ?? "",
        yieldQuantity: recipe.yieldQuantity,
        yieldUnit: (UNITS as readonly string[]).includes(recipe.yieldUnit)
          ? (recipe.yieldUnit as (typeof UNITS)[number])
          : "un",
        items: recipe.items.map((item) =>
          item.componentType === "BASE_RECIPE"
            ? {
                componentType: "BASE_RECIPE" as const,
                nestedBaseRecipeId: item.nestedBaseRecipeId ?? "",
                quantityUsed: item.quantityUsed,
              }
            : {
                componentType: "INGREDIENT" as const,
                ingredientId: item.ingredientId ?? "",
                quantityUsed: item.quantityUsed,
              }
        ),
      });
    }
    if (next && !recipe) {
      reset({
        name: "",
        description: "",
        yieldQuantity: 1,
        yieldUnit: "un",
        items: [emptyItem()],
      });
    }
  }

  function onSubmit(values: FormValues) {
    setError(null);
    startTransition(async () => {
      const res = await saveBaseRecipe(values);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {recipe ? "Editar receita base" : "Nova receita base"}
          </DialogTitle>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input {...register("name")} placeholder="Ex.: Massa de salgado" />
          </div>
          <div className="space-y-1">
            <Label>Descrição (opcional)</Label>
            <Textarea {...register("description")} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Rendimento</Label>
              <Input
                type="number"
                step="0.01"
                {...register("yieldQuantity", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1">
              <Label>Unidade</Label>
              <Controller
                control={control}
                name="yieldUnit"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
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
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Composição</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => itemsArray.append(emptyItem())}
              >
                <Plus className="h-3.5 w-3.5" />
                Item
              </Button>
            </div>

            {itemsArray.fields.map((field, index) => {
              const type = values.items[index]?.componentType ?? "INGREDIENT";
              return (
                <div
                  key={field.id}
                  className="space-y-2 rounded-lg border border-stone-200 p-3"
                >
                  <div className="flex justify-between">
                    <Controller
                      control={control}
                      name={`items.${index}.componentType`}
                      render={({ field: typeField }) => (
                        <Select
                          value={typeField.value}
                          onValueChange={(v) => {
                            if (v === "BASE_RECIPE") {
                              setValue(`items.${index}`, {
                                componentType: "BASE_RECIPE",
                                nestedBaseRecipeId: "",
                                quantityUsed:
                                  values.items[index]?.quantityUsed || 1,
                              });
                            } else {
                              setValue(`items.${index}`, {
                                componentType: "INGREDIENT",
                                ingredientId: "",
                                quantityUsed:
                                  values.items[index]?.quantityUsed || 1,
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 w-40 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="INGREDIENT">
                              Matéria-prima
                            </SelectItem>
                            <SelectItem value="BASE_RECIPE">
                              Outra base
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <button
                      type="button"
                      className="text-red-500"
                      onClick={() => itemsArray.remove(index)}
                      aria-label="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {type === "INGREDIENT" ? (
                    <Controller
                      control={control}
                      name={`items.${index}.ingredientId`}
                      render={({ field: idField }) => (
                        <Select
                          value={idField.value || undefined}
                          onValueChange={idField.onChange}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Ingrediente..." />
                          </SelectTrigger>
                          <SelectContent>
                            {ingredients.map((ing) => (
                              <SelectItem key={ing.id} value={ing.id}>
                                {ing.name} ({ing.unit})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  ) : (
                    <Controller
                      control={control}
                      name={`items.${index}.nestedBaseRecipeId`}
                      render={({ field: idField }) => (
                        <Select
                          value={idField.value || undefined}
                          onValueChange={idField.onChange}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Receita base..." />
                          </SelectTrigger>
                          <SelectContent>
                            {otherRecipes.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs">Quantidade usada</Label>
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8"
                      {...register(`items.${index}.quantityUsed`, {
                        valueAsNumber: true,
                      })}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending} className="bg-coffee-600 text-white hover:bg-coffee-700">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
