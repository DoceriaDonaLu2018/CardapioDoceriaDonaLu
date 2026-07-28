"use client";

import { useEffect, useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { saveProductModifiers } from "@/app/admin/produtos/modifiers-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ModifierOptionForm = {
  id?: string;
  name: string;
  price: number;
  maxQuantityPerOption: number;
};

export type ModifierGroupForm = {
  id?: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  options: ModifierOptionForm[];
};

type FormValues = {
  groups: ModifierGroupForm[];
};

export type LoadedModifierGroup = {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  options: {
    id: string;
    name: string;
    price: number;
    maxQuantityPerOption: number;
  }[];
};

function toFormGroups(initial: LoadedModifierGroup[]): ModifierGroupForm[] {
  return initial.map((g) => ({
    id: g.id,
    name: g.name,
    minSelections: g.minSelections,
    maxSelections: g.maxSelections,
    options: g.options.map((o) => ({
      id: o.id,
      name: o.name,
      price: o.price,
      maxQuantityPerOption: o.maxQuantityPerOption,
    })),
  }));
}

/**
 * Editor de grupos/opções.
 * - `mode="draft"`: sincroniza via onChange (criação de produto unificada).
 * - `mode="persist"`: salva com Server Action (edição).
 */
export function ProductModifiersEditor({
  productId,
  initialGroups,
  mode = "persist",
  onChange,
}: {
  productId?: string;
  initialGroups: LoadedModifierGroup[];
  mode?: "persist" | "draft";
  onChange?: (groups: ModifierGroupForm[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { control, register, handleSubmit, watch } = useForm<FormValues>({
    defaultValues: {
      groups: initialGroups.length > 0 ? toFormGroups(initialGroups) : [],
    },
  });

  const {
    fields: groupFields,
    append: appendGroup,
    remove: removeGroup,
  } = useFieldArray({ control, name: "groups" });

  const watched = watch("groups");

  useEffect(() => {
    if (mode !== "draft" || !onChange) return;
    onChange(watched ?? []);
  }, [watched, mode, onChange]);

  function onSubmit(values: FormValues) {
    if (mode !== "persist" || !productId) return;
    setError(null);
    startTransition(async () => {
      const result = await saveProductModifiers(productId, values.groups);
      if (result.error) {
        setError(result.error);
        return;
      }
      window.location.reload();
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-stone-200 bg-stone-50/80 p-4">
      <div>
        <h3 className="text-sm font-semibold text-stone-800">
          Variações e Complementos
        </h3>
        <p className="mt-1 text-xs text-stone-500">
          {mode === "draft"
            ? "Opcional — salvos junto com o produto na criação."
            : "Defina regras (ex.: mínimo 100 / máximo 100 para cento de salgados)."}
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="space-y-4">
        {groupFields.map((group, groupIndex) => (
          <GroupBlock
            key={group.id}
            groupIndex={groupIndex}
            control={control}
            register={register}
            watch={watch}
            onRemove={() => removeGroup(groupIndex)}
          />
        ))}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              appendGroup({
                name: "",
                minSelections: 0,
                maxSelections: 1,
                options: [{ name: "", price: 0, maxQuantityPerOption: 1 }],
              })
            }
          >
            <Plus className="h-4 w-4" />
            Novo grupo
          </Button>
          {mode === "persist" && productId && (
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              className="bg-coffee-600 text-white hover:bg-coffee-700"
              onClick={handleSubmit(onSubmit)}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                "Salvar variações"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupBlock({
  groupIndex,
  control,
  register,
  watch,
  onRemove,
}: {
  groupIndex: number;
  control: ReturnType<typeof useForm<FormValues>>["control"];
  register: ReturnType<typeof useForm<FormValues>>["register"];
  watch: ReturnType<typeof useForm<FormValues>>["watch"];
  onRemove: () => void;
}) {
  const {
    fields: optionFields,
    append: appendOption,
    remove: removeOption,
  } = useFieldArray({
    control,
    name: `groups.${groupIndex}.options`,
  });

  const min = watch(`groups.${groupIndex}.minSelections`);
  const max = watch(`groups.${groupIndex}.maxSelections`);

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="grid flex-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-3">
            <Label>Nome do grupo</Label>
            <Input
              placeholder="Ex.: Escolha seus salgados"
              {...register(`groups.${groupIndex}.name`, { required: true })}
            />
          </div>
          <div className="space-y-1">
            <Label>Mínimo</Label>
            <Input
              type="number"
              min={0}
              {...register(`groups.${groupIndex}.minSelections`, {
                valueAsNumber: true,
              })}
            />
          </div>
          <div className="space-y-1">
            <Label>Máximo</Label>
            <Input
              type="number"
              min={0}
              {...register(`groups.${groupIndex}.maxSelections`, {
                valueAsNumber: true,
              })}
            />
          </div>
          <p className="self-end text-[11px] text-stone-400">
            {min === max ? `Exatamente ${max}` : `${min} a ${max} seleções`}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-red-600"
          onClick={onRemove}
          aria-label="Remover grupo"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2 border-t border-stone-100 pt-2">
        <p className="text-xs font-medium text-stone-600">Opções</p>
        {optionFields.map((opt, optionIndex) => (
          <div
            key={opt.id}
            className="grid gap-2 rounded-md bg-stone-50 p-2 sm:grid-cols-[1fr_5rem_5rem_auto]"
          >
            <Input
              placeholder="Nome (ex.: Coxinha)"
              {...register(
                `groups.${groupIndex}.options.${optionIndex}.name`,
                { required: true }
              )}
            />
            <Input
              type="number"
              step="0.01"
              min={0}
              placeholder="R$"
              title="Preço extra"
              {...register(
                `groups.${groupIndex}.options.${optionIndex}.price`,
                { valueAsNumber: true }
              )}
            />
            <Input
              type="number"
              min={1}
              title="Máx. por opção"
              {...register(
                `groups.${groupIndex}.options.${optionIndex}.maxQuantityPerOption`,
                { valueAsNumber: true }
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-stone-400 hover:text-red-600"
              onClick={() => removeOption(optionIndex)}
              aria-label="Remover opção"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            appendOption({
              name: "",
              price: 0,
              maxQuantityPerOption: Math.max(1, max || 1),
            })
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Opção
        </Button>
      </div>
    </div>
  );
}
