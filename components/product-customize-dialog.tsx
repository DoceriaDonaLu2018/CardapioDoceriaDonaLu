"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";

import {
  areAllGroupsValid,
  sumGroupQuantity,
  type ModifierGroupDef,
  type ModifierSelectionSnapshot,
} from "@/lib/modifiers/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SafeImage } from "@/components/ui/safe-image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

type QtyMap = Record<string, Record<string, number>>;

function buildSnapshot(
  groups: ModifierGroupDef[],
  qty: QtyMap
): ModifierSelectionSnapshot[] {
  const snapshot: ModifierSelectionSnapshot[] = [];
  for (const group of groups) {
    const options: ModifierSelectionSnapshot["options"] = [];
    for (const opt of group.options) {
      const q = qty[group.id]?.[opt.id] ?? 0;
      if (q <= 0) continue;
      options.push({
        optionId: opt.id,
        name: opt.name,
        quantity: q,
        unitPrice: opt.price,
      });
    }
    if (options.length > 0) {
      snapshot.push({
        groupId: group.id,
        groupName: group.name,
        options,
      });
    }
  }
  return snapshot;
}

export function ProductCustomizeDialog({
  open,
  onOpenChange,
  product,
  groups,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    title: string;
    description: string;
    imageUrl: string;
    price: number;
  };
  groups: ModifierGroupDef[];
  onConfirm: (modifiers: ModifierSelectionSnapshot[]) => void;
}) {
  const [qty, setQty] = useState<QtyMap>(() => {
    const initial: QtyMap = {};
    for (const g of groups) {
      initial[g.id] = {};
      for (const o of g.options) initial[g.id][o.id] = 0;
    }
    return initial;
  });

  const valid = useMemo(
    () => areAllGroupsValid(groups, qty),
    [groups, qty]
  );

  const extras = useMemo(() => {
    let total = 0;
    for (const g of groups) {
      for (const o of g.options) {
        const q = qty[g.id]?.[o.id] ?? 0;
        total += o.price * q;
      }
    }
    return Math.round(total * 100) / 100;
  }, [groups, qty]);

  function setOptionQty(
    group: ModifierGroupDef,
    optionId: string,
    next: number
  ) {
    const option = group.options.find((o) => o.id === optionId);
    if (!option) return;
    const clamped = Math.max(
      0,
      Math.min(option.maxQuantityPerOption, Math.floor(next))
    );

    setQty((prev) => {
      const currentGroup = { ...(prev[group.id] ?? {}) };
      const others = Object.entries(currentGroup)
        .filter(([id]) => id !== optionId)
        .reduce((s, [, n]) => s + n, 0);
      const maxAllowed = Math.max(0, group.maxSelections - others);
      const finalQty = Math.min(clamped, maxAllowed);
      currentGroup[optionId] = finalQty;
      return { ...prev, [group.id]: currentGroup };
    });
  }

  function toggleCheckbox(
    group: ModifierGroupDef,
    optionId: string,
    checked: boolean
  ) {
    setOptionQty(group, optionId, checked ? 1 : 0);
  }

  function handleConfirm() {
    if (!valid) return;
    onConfirm(buildSnapshot(groups, qty));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[min(100%,28rem)] gap-0 overflow-y-auto border-stone-200 bg-white p-0 sm:rounded-2xl">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
          <SafeImage
            src={product.imageUrl}
            alt={product.title}
            fill
            sizes="28rem"
            className="object-cover"
          />
        </div>

        <div className="space-y-4 px-5 pb-6 pt-4 sm:px-6">
          <div>
            <DialogTitle className="text-lg font-bold text-stone-800">
              {product.title}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-stone-500">
              {product.description}
            </DialogDescription>
            <p className="mt-2 text-lg font-bold text-coffee-700">
              {formatPrice(product.price + extras)}
              {extras > 0 && (
                <span className="ml-2 text-xs font-normal text-stone-400">
                  (base {formatPrice(product.price)} + extras)
                </span>
              )}
            </p>
          </div>

          {groups.map((group) => {
            const total = sumGroupQuantity(
              Object.entries(qty[group.id] ?? {}).map(([optionId, quantity]) => ({
                optionId,
                quantity,
              }))
            );
            // Steppers só quando a mesma opção pode repetir (ex.: 50x Coxinha).
            // Caso contrário: checkbox/radio (ex.: até 5 adicionais distintos).
            const useSteppers = group.options.some(
              (o) => o.maxQuantityPerOption > 1
            );
            const useRadio =
              !useSteppers &&
              group.maxSelections === 1 &&
              group.minSelections <= 1;
            const atMax = total >= group.maxSelections;

            return (
              <section
                key={group.id}
                className="space-y-2 rounded-xl border border-stone-200 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-stone-800">
                      {group.name}
                    </h3>
                    <p className="text-xs text-stone-500">
                      {group.minSelections === group.maxSelections
                        ? `Escolha exatamente ${group.maxSelections}`
                        : `Escolha de ${group.minSelections} a ${group.maxSelections}`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                      total >= group.minSelections &&
                        total <= group.maxSelections
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-800"
                    )}
                  >
                    {total}/{group.maxSelections}
                  </span>
                </div>

                <ul className="space-y-2">
                  {group.options.map((option) => {
                    const q = qty[group.id]?.[option.id] ?? 0;
                    const disabledIncrease =
                      atMax && q === 0
                        ? true
                        : total >= group.maxSelections && q === 0;

                    if (!useSteppers) {
                      return (
                        <li key={option.id}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                              q > 0
                                ? "border-coffee-600 bg-coffee-50"
                                : "border-stone-200",
                              atMax && q === 0 && !useRadio && "opacity-50"
                            )}
                          >
                            <input
                              type={useRadio ? "radio" : "checkbox"}
                              name={useRadio ? `mod-${group.id}` : undefined}
                              className="h-4 w-4"
                              checked={q > 0}
                              disabled={!useRadio && atMax && q === 0}
                              onChange={(e) => {
                                if (useRadio) {
                                  setQty((prev) => {
                                    const next: Record<string, number> = {};
                                    for (const opt of group.options) {
                                      next[opt.id] =
                                        opt.id === option.id ? 1 : 0;
                                    }
                                    return { ...prev, [group.id]: next };
                                  });
                                  return;
                                }
                                toggleCheckbox(
                                  group,
                                  option.id,
                                  e.target.checked
                                );
                              }}
                            />
                            <span className="flex-1 font-medium text-stone-800">
                              {option.name}
                            </span>
                            {option.price > 0 && (
                              <span className="text-xs text-coffee-700">
                                +{formatPrice(option.price)}
                              </span>
                            )}
                          </label>
                        </li>
                      );
                    }

                    return (
                      <li
                        key={option.id}
                        className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-stone-800">
                            {option.name}
                          </p>
                          {option.price > 0 && (
                            <p className="text-xs text-coffee-700">
                              +{formatPrice(option.price)} / un.
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            disabled={q <= 0}
                            onClick={() =>
                              setOptionQty(group, option.id, q - 1)
                            }
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="w-8 text-center text-sm font-semibold">
                            {q}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            disabled={
                              disabledIncrease ||
                              q >= option.maxQuantityPerOption ||
                              total >= group.maxSelections
                            }
                            onClick={() =>
                              setOptionQty(group, option.id, q + 1)
                            }
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          <Button
            type="button"
            disabled={!valid}
            className="h-12 w-full bg-coffee-600 text-white hover:bg-coffee-700 disabled:opacity-50"
            onClick={handleConfirm}
          >
            {valid
              ? `Adicionar · ${formatPrice(product.price + extras)}`
              : "Complete as escolhas obrigatórias"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
