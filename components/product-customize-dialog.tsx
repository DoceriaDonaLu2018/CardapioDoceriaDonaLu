"use client";

import { useMemo, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";

import {
  areAllGroupsValid,
  isGroupSelectionValid,
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
  DialogClose,
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

function groupHint(group: ModifierGroupDef): {
  required: boolean;
  text: string;
} {
  const required = group.minSelections > 0;
  if (group.minSelections === 0) {
    return {
      required,
      text:
        group.maxSelections === 1
          ? "Opcional · escolha até 1"
          : `Opcional · escolha até ${group.maxSelections}`,
    };
  }
  if (group.minSelections === group.maxSelections) {
    return {
      required,
      text:
        group.maxSelections === 1
          ? "Obrigatório · escolha 1"
          : `Obrigatório · escolha ${group.maxSelections}`,
    };
  }
  return {
    required,
    text: `Obrigatório · escolha de ${group.minSelections} a ${group.maxSelections}`,
  };
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
  const submittingRef = useRef(false);
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

  const unitTotal = Math.round((product.price + extras) * 100) / 100;

  const selectedLines = useMemo(() => {
    const lines: { key: string; label: string; price: number }[] = [];
    for (const g of groups) {
      for (const o of g.options) {
        const q = qty[g.id]?.[o.id] ?? 0;
        if (q <= 0) continue;
        lines.push({
          key: `${g.id}-${o.id}`,
          label: q > 1 ? `${q}× ${o.name}` : o.name,
          price: Math.round(o.price * q * 100) / 100,
        });
      }
    }
    return lines;
  }, [groups, qty]);

  const incompleteGroups = useMemo(
    () =>
      groups.filter((group) => {
        const total = Object.values(qty[group.id] ?? {}).reduce(
          (sum, n) => sum + (n || 0),
          0
        );
        return !isGroupSelectionValid(group, total);
      }),
    [groups, qty]
  );

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
    if (!valid || submittingRef.current) return;
    submittingRef.current = true;
    onConfirm(buildSnapshot(groups, qty));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="grid max-h-[min(90dvh,44rem)] w-[min(100%-1rem,52rem)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-stone-200 bg-white p-0 sm:rounded-2xl"
      >
        <header className="relative flex shrink-0 items-start gap-3 border-b border-stone-100 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-stone-100 sm:h-20 sm:w-20">
            <SafeImage
              src={product.imageUrl}
              alt=""
              fill
              sizes="80px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0 flex-1 pr-10">
            <DialogTitle className="text-base font-bold leading-snug text-stone-800 sm:text-lg">
              {product.title}
            </DialogTitle>
            <p className="mt-1 text-sm font-semibold text-coffee-700">
              A partir de {formatPrice(product.price)}
            </p>
          </div>
          <DialogClose
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-coffee-500"
            aria-label="Fechar personalização"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </DialogClose>
        </header>

        <div className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 sm:px-5">
          {product.description ? (
            <DialogDescription className="mb-4 text-sm leading-relaxed text-stone-500">
              {product.description}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">
              Personalize {product.title}
            </DialogDescription>
          )}
          <div className="space-y-4">
            {groups.map((group) => {
              const total = sumGroupQuantity(
                Object.entries(qty[group.id] ?? {}).map(
                  ([optionId, quantity]) => ({
                    optionId,
                    quantity,
                  })
                )
              );
              const useSteppers = group.options.some(
                (o) => o.maxQuantityPerOption > 1
              );
              const useRadio =
                !useSteppers &&
                group.maxSelections === 1 &&
                group.minSelections <= 1;
              const atMax = total >= group.maxSelections;
              const groupValid = isGroupSelectionValid(group, total);
              const hint = groupHint(group);

              return (
                <section
                  key={group.id}
                  aria-labelledby={`mod-group-${group.id}`}
                  className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 sm:p-4"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3
                        id={`mod-group-${group.id}`}
                        className="text-sm font-semibold text-stone-800"
                      >
                        {group.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {hint.text}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
                        groupValid
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-amber-50 text-amber-900"
                      )}
                      aria-label={`${total} de ${group.maxSelections} selecionados`}
                    >
                      {total} de {group.maxSelections}
                    </span>
                  </div>

                  <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13.5rem),1fr))] gap-2">
                    {group.options.map((option) => {
                      const q = qty[group.id]?.[option.id] ?? 0;
                      const selected = q > 0;
                      const blocked = atMax && q === 0 && !useRadio;
                      const optionId = `mod-${group.id}-${option.id}`;

                      if (!useSteppers) {
                        return (
                          <li key={option.id} className="min-w-0">
                            <label
                              htmlFor={optionId}
                              className={cn(
                                "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-sm transition-colors",
                                "focus-within:ring-2 focus-within:ring-coffee-500 focus-within:ring-offset-1",
                                selected
                                  ? "border-coffee-600 bg-coffee-50 ring-1 ring-coffee-600"
                                  : "border-stone-200 hover:border-stone-300",
                                blocked && "cursor-not-allowed opacity-50"
                              )}
                            >
                              <input
                                id={optionId}
                                type={useRadio ? "radio" : "checkbox"}
                                name={useRadio ? `mod-${group.id}` : undefined}
                                className="mt-0.5 h-5 w-5 shrink-0 accent-coffee-600"
                                checked={selected}
                                disabled={blocked}
                                aria-describedby={
                                  option.price > 0
                                    ? `${optionId}-price`
                                    : undefined
                                }
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
                              <span className="min-w-0 flex-1">
                                <span className="block break-words font-medium leading-snug text-stone-800">
                                  {option.name}
                                </span>
                                {option.price > 0 ? (
                                  <span
                                    id={`${optionId}-price`}
                                    className="mt-0.5 block text-xs font-semibold text-coffee-700"
                                  >
                                    +{formatPrice(option.price)}
                                  </span>
                                ) : (
                                  <span className="mt-0.5 block text-xs text-stone-400">
                                    Incluso
                                  </span>
                                )}
                              </span>
                            </label>
                          </li>
                        );
                      }

                      const canIncrease =
                        !blocked &&
                        q < option.maxQuantityPerOption &&
                        total < group.maxSelections;

                      return (
                        <li
                          key={option.id}
                          className={cn(
                            "flex min-h-11 min-w-0 items-center gap-2 rounded-xl border bg-white px-3 py-2",
                            selected
                              ? "border-coffee-600 bg-coffee-50 ring-1 ring-coffee-600"
                              : "border-stone-200",
                            blocked && "opacity-50"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-medium leading-snug text-stone-800">
                              {option.name}
                            </p>
                            {option.price > 0 && (
                              <p className="text-xs font-semibold text-coffee-700">
                                +{formatPrice(option.price)} / un.
                              </p>
                            )}
                          </div>
                          <div
                            className="flex shrink-0 items-center gap-1"
                            role="group"
                            aria-label={`Quantidade de ${option.name}`}
                          >
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9"
                              disabled={q <= 0}
                              aria-label={`Diminuir ${option.name}`}
                              onClick={() =>
                                setOptionQty(group, option.id, q - 1)
                              }
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <span
                              className="w-7 text-center text-sm font-semibold tabular-nums"
                              aria-live="polite"
                            >
                              {q}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9"
                              disabled={!canIncrease}
                              aria-label={`Aumentar ${option.name}`}
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
          </div>
        </div>

        <footer className="shrink-0 border-t border-stone-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
          <div className="mb-3 space-y-1 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words text-stone-500">
                {product.title}
              </span>
              <span className="shrink-0 tabular-nums text-stone-700">
                {formatPrice(product.price)}
              </span>
            </div>
            {selectedLines.length > 0 && (
              <ul className="max-h-16 space-y-0.5 overflow-y-auto">
                {selectedLines.map((line) => (
                  <li
                    key={line.key}
                    className="flex items-start justify-between gap-3 text-xs text-stone-500"
                  >
                    <span className="min-w-0 break-words">
                      + {line.label}
                    </span>
                    {line.price > 0 && (
                      <span className="shrink-0 tabular-nums text-coffee-700">
                        {formatPrice(line.price)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div
              className="flex items-center justify-between gap-3 pt-1 font-semibold text-stone-800"
              aria-live="polite"
            >
              <span>Total</span>
              <span className="tabular-nums text-coffee-700">
                {formatPrice(unitTotal)}
              </span>
            </div>
          </div>

          {!valid && incompleteGroups.length > 0 && (
            <p className="mb-2 text-xs text-amber-800" role="status">
              Complete: {incompleteGroups.map((g) => g.name).join(", ")}
            </p>
          )}

          <Button
            type="button"
            disabled={!valid}
            className="h-12 w-full bg-coffee-600 text-base text-white hover:bg-coffee-700 disabled:opacity-50"
            onClick={handleConfirm}
          >
            {valid
              ? `Adicionar ao pedido — ${formatPrice(unitTotal)}`
              : "Complete as escolhas obrigatórias"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
