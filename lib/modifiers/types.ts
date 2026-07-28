import { z } from "zod";

import { stripHtml } from "@/lib/validation/safe-input";

/** Snapshot persistido no carrinho / OrderItem.modifiers */
export type ModifierSelectionSnapshot = {
  groupId: string;
  groupName: string;
  options: {
    optionId: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }[];
};

export type ModifierGroupDef = {
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

/** Payload enviado pelo cliente (só IDs + qty — nomes/preços vêm do banco). */
export const cartModifierInputSchema = z.object({
  groupId: z.string().min(8).max(64),
  options: z
    .array(
      z.object({
        optionId: z.string().min(8).max(64),
        quantity: z.number().int().min(0).max(10_000),
      })
    )
    .max(80),
});

export const cartModifiersInputSchema = z.array(cartModifierInputSchema).max(20);

export const adminModifierOptionSchema = z.object({
  id: z.string().min(8).max(64).optional(),
  name: z
    .string()
    .transform(stripHtml)
    .pipe(z.string().min(1, "Nome da opção.").max(80)),
  price: z.number().finite().min(0).max(1_000_000),
  maxQuantityPerOption: z.number().int().min(1).max(10_000),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const adminModifierGroupSchema = z
  .object({
    id: z.string().min(8).max(64).optional(),
    name: z
      .string()
      .transform(stripHtml)
      .pipe(z.string().min(1, "Nome do grupo.").max(120)),
    minSelections: z.number().int().min(0).max(10_000),
    maxSelections: z.number().int().min(0).max(10_000),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    options: z.array(adminModifierOptionSchema).min(1).max(80),
  })
  .superRefine((group, ctx) => {
    if (group.minSelections > group.maxSelections) {
      ctx.addIssue({
        code: "custom",
        message: "Mínimo não pode ser maior que o máximo.",
        path: ["minSelections"],
      });
    }
  });

export const adminModifierGroupsSchema = z
  .array(adminModifierGroupSchema)
  .max(20);

export function sumGroupQuantity(
  options: { quantity: number }[]
): number {
  return options.reduce((sum, o) => sum + Math.max(0, o.quantity), 0);
}

export function extrasUnitPrice(
  selections: ModifierSelectionSnapshot[]
): number {
  let total = 0;
  for (const group of selections) {
    for (const opt of group.options) {
      total += opt.unitPrice * opt.quantity;
    }
  }
  return Math.round(total * 100) / 100;
}

export function formatModifiersLines(
  selections: ModifierSelectionSnapshot[] | null | undefined
): string[] {
  if (!selections?.length) return [];
  const lines: string[] = [];
  for (const group of selections) {
    for (const opt of group.options) {
      if (opt.quantity <= 0) continue;
      lines.push(`${opt.quantity}x ${opt.name}`);
    }
  }
  return lines;
}

/** Lê `OrderItem.modifiers` (Json) de forma segura. */
export function parseModifiersJson(
  value: unknown
): ModifierSelectionSnapshot[] {
  if (!Array.isArray(value)) return [];
  const out: ModifierSelectionSnapshot[] = [];
  for (const group of value) {
    if (!group || typeof group !== "object") continue;
    const g = group as Record<string, unknown>;
    if (typeof g.groupId !== "string" || typeof g.groupName !== "string") {
      continue;
    }
    if (!Array.isArray(g.options)) continue;
    const options: ModifierSelectionSnapshot["options"] = [];
    for (const opt of g.options) {
      if (!opt || typeof opt !== "object") continue;
      const o = opt as Record<string, unknown>;
      if (
        typeof o.optionId !== "string" ||
        typeof o.name !== "string" ||
        typeof o.quantity !== "number" ||
        typeof o.unitPrice !== "number"
      ) {
        continue;
      }
      if (o.quantity <= 0) continue;
      options.push({
        optionId: o.optionId,
        name: o.name,
        quantity: o.quantity,
        unitPrice: o.unitPrice,
      });
    }
    if (options.length > 0) {
      out.push({
        groupId: g.groupId,
        groupName: g.groupName,
        options,
      });
    }
  }
  return out;
}

/**
 * Valida seleções contra as regras do banco.
 * Retorna snapshot pronto para persistir + extras, ou erro legível.
 */
export function validateAndBuildModifierSnapshot(
  groups: ModifierGroupDef[],
  input: z.infer<typeof cartModifiersInputSchema> | undefined | null
):
  | { ok: true; snapshot: ModifierSelectionSnapshot[]; extras: number }
  | { ok: false; error: string } {
  if (groups.length === 0) {
    if (input && input.length > 0) {
      return { ok: false, error: "Este produto não aceita complementos." };
    }
    return { ok: true, snapshot: [], extras: 0 };
  }

  const byGroup = new Map(
    (input ?? []).map((g) => [g.groupId, g] as const)
  );

  const snapshot: ModifierSelectionSnapshot[] = [];

  for (const group of groups) {
    const incoming = byGroup.get(group.id);
    const optionMap = new Map(group.options.map((o) => [o.id, o]));
    const chosen: ModifierSelectionSnapshot["options"] = [];

    for (const sel of incoming?.options ?? []) {
      if (sel.quantity <= 0) continue;
      const def = optionMap.get(sel.optionId);
      if (!def) {
        return {
          ok: false,
          error: `Opção inválida no grupo "${group.name}".`,
        };
      }
      if (sel.quantity > def.maxQuantityPerOption) {
        return {
          ok: false,
          error: `"${def.name}" permite no máximo ${def.maxQuantityPerOption}.`,
        };
      }
      chosen.push({
        optionId: def.id,
        name: def.name,
        quantity: sel.quantity,
        unitPrice: def.price,
      });
    }

    const total = sumGroupQuantity(chosen);
    if (total < group.minSelections) {
      return {
        ok: false,
        error: `"${group.name}": selecione no mínimo ${group.minSelections} (atual: ${total}).`,
      };
    }
    if (total > group.maxSelections) {
      return {
        ok: false,
        error: `"${group.name}": selecione no máximo ${group.maxSelections} (atual: ${total}).`,
      };
    }

    if (chosen.length > 0) {
      snapshot.push({
        groupId: group.id,
        groupName: group.name,
        options: chosen,
      });
    }
  }

  // Rejeita groupIds desconhecidos (payload malicioso).
  for (const key of byGroup.keys()) {
    if (!groups.some((g) => g.id === key)) {
      return { ok: false, error: "Grupo de complemento inválido." };
    }
  }

  return {
    ok: true,
    snapshot,
    extras: extrasUnitPrice(snapshot),
  };
}

/** UI: grupo está completo para liberar o botão Adicionar. */
export function isGroupSelectionValid(
  group: Pick<ModifierGroupDef, "minSelections" | "maxSelections">,
  totalSelected: number
): boolean {
  return (
    totalSelected >= group.minSelections &&
    totalSelected <= group.maxSelections
  );
}

export function areAllGroupsValid(
  groups: ModifierGroupDef[],
  quantitiesByGroup: Record<string, Record<string, number>>
): boolean {
  return groups.every((group) => {
    const opts = quantitiesByGroup[group.id] ?? {};
    const total = Object.values(opts).reduce((s, n) => s + (n || 0), 0);
    return isGroupSelectionValid(group, total);
  });
}
