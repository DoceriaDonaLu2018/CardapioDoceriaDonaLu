import { z } from "zod";

import { parseDatetimeLocalAsBrasilia } from "@/lib/timezone";

/**
 * Camada AppSec compartilhada — validação/sanitização de entradas.
 *
 * - Prisma já parametriza queries (proteção SQLi nativa).
 * - React escapa texto por padrão (proteção XSS de render).
 * - Aqui: NUNCA confiar no frontend — tipagem, tamanho e strip de tags HTML.
 */

/** Remove tags HTML e caracteres de controle — mitiga payload refletido/armazenado. */
export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function plainText(max: number, label: string) {
  return z
    .string()
    .transform(stripHtml)
    .pipe(
      z
        .string()
        .min(1, `Informe ${label}.`)
        .max(max, `${label} muito longo (máx. ${max}).`)
    );
}

function optionalPlainText(max: number) {
  return z
    .string()
    .optional()
    .nullable()
    .transform((v) => {
      if (v == null) return null;
      const cleaned = stripHtml(v);
      return cleaned.length > 0 ? cleaned.slice(0, max) : null;
    });
}

/** IDs Prisma (cuid) — bloqueia injeção via path/query. */
export const idSchema = z
  .string()
  .trim()
  .min(8, "ID inválido.")
  .max(64, "ID inválido.")
  .regex(/^[a-zA-Z0-9_-]+$/, "ID inválido.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(160)
  .email("Informe um e-mail válido.");

export const loginSchema = z.object({
  email: emailSchema,
  // Limite evita DoS por senha gigante; Auth.js compara o hash depois.
  password: z.string().min(1, "Informe a senha.").max(200),
});

export const categoryWriteSchema = z.object({
  id: z
    .string()
    .optional()
    .transform((v) => (v && v.length >= 8 ? v : undefined))
    .pipe(idSchema.optional()),
  name: plainText(80, "o nome da categoria"),
  order: z.coerce.number().int().min(0).max(9999).default(0),
});

/** imageUrl: só proxy interno /api/file ou placeholder conhecido. */
const imageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => {
      if (!value) return true;
      if (value.startsWith("/api/file?pathname=")) return true;
      if (value.startsWith("https://placehold.co/")) return true;
      return false;
    },
    { message: "URL de imagem não permitida." }
  );

export const productWriteSchema = z.object({
  id: z
    .string()
    .optional()
    .transform((v) => (v && v.length >= 8 ? v : undefined))
    .pipe(idSchema.optional()),
  title: plainText(120, "o título"),
  description: z
    .string()
    .transform(stripHtml)
    .pipe(z.string().max(2000, "Descrição muito longa.")),
  imageUrl: imageUrlSchema.optional().default(""),
  categoryId: idSchema,
  price: z.number().finite().min(0).max(1_000_000),
  costPrice: z.number().finite().min(0).max(1_000_000),
  isAvailable: z.boolean(),
});

/** Banner promocional — imageUrl só via upload interno. */
export const bannerWriteSchema = z.object({
  id: z
    .string()
    .optional()
    .transform((v) => (v && v.length >= 8 ? v : undefined))
    .pipe(idSchema.optional()),
  imageUrl: imageUrlSchema.pipe(
    z.string().min(1, "Envie a imagem do banner.")
  ),
  productId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => {
      if (v == null || v === "" || v === "__none__") return null;
      return v;
    })
    .pipe(idSchema.nullable()),
  isActive: z.boolean(),
  order: z.coerce.number().int().min(0).max(9999).default(0),
  startDate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => parseDatetimeLocalAsBrasilia(v)),
  endDate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => parseDatetimeLocalAsBrasilia(v)),
});

export const reorderIdsSchema = z.array(idSchema).min(1).max(200);

export const couponWriteSchema = z
  .object({
    id: z
      .string()
      .optional()
      .transform((v) => (v && v.length >= 8 ? v : undefined))
      .pipe(idSchema.optional()),
    code: z
      .string()
      .transform((v) => stripHtml(v).toUpperCase())
      .pipe(
        z
          .string()
          .min(2, "Informe o código.")
          .max(40)
          .regex(/^[A-Z0-9_-]+$/, "Use apenas letras, números, _ ou -.")
      ),
    discountType: z.enum(["PERCENTAGE", "FIXED"]),
    value: z.number().finite().min(0).max(1_000_000),
    minPurchaseValue: z.number().finite().min(0).max(1_000_000),
    isActive: z.boolean(),
    expiresAt: z
      .string()
      .optional()
      .nullable()
      .transform((v) => parseDatetimeLocalAsBrasilia(v)),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === "PERCENTAGE" && data.value > 100) {
      ctx.addIssue({
        code: "custom",
        message: "Percentual máximo é 100.",
        path: ["value"],
      });
    }
  });

export const giftWriteSchema = z.object({
  id: z
    .string()
    .optional()
    .transform((v) => (v && v.length >= 8 ? v : undefined))
    .pipe(idSchema.optional()),
  name: plainText(120, "o nome do brinde"),
  minPurchaseValue: z.number().finite().min(0).max(1_000_000),
  isActive: z.boolean(),
});

export const pdvOrderItemSchema = z.object({
  productId: idSchema,
  quantity: z.number().int().min(1).max(200),
  unitPrice: z.number().finite().min(0).max(1_000_000).optional(),
});

/** Formas de pagamento aceitas no PDV (valores persistidos em Order.paymentMethod). */
export const pdvPaymentMethodSchema = z.enum(
  ["cash", "credit_card", "debit_card", "pix"],
  { message: "Selecione a forma de pagamento." }
);

export type PdvPaymentMethod = z.infer<typeof pdvPaymentMethodSchema>;

export const pdvOrderSchema = z.object({
  orderId: z
    .string()
    .optional()
    .transform((v) => (v && v.length >= 8 ? v : undefined))
    .pipe(idSchema.optional()),
  customerName: plainText(120, "o nome do cliente"),
  customerPhone: optionalPlainText(20),
  waiterName: optionalPlainText(80),
  advancePayment: z.number().finite().min(0).max(1_000_000).optional(),
  paymentMethod: pdvPaymentMethodSchema,
  items: z.array(pdvOrderItemSchema).min(1).max(80),
});

const unitEnum = z.enum(["kg", "g", "mg", "L", "ml", "un"]);
const pricingModeEnum = z.enum([
  "markupPercent",
  "marginPercent",
  "fixedProfit",
  "finalPrice",
]);

export const fichaSaveSchema = z.object({
  productId: idSchema,
  mode: pricingModeEnum,
  strategyValue: z.number().finite().min(0).max(1_000_000),
  sellingPrice: z.number().finite().min(0).max(1_000_000),
  totalCost: z.number().finite().min(0).max(1_000_000),
  // Linhas vazias do form são filtradas depois; aqui só limitamos/sanitizamos.
  ingredients: z
    .array(
      z.object({
        ingredientId: z
          .string()
          .max(64)
          .optional()
          .transform((v) => (v && v.length >= 8 ? v : undefined)),
        name: z.string().transform(stripHtml).pipe(z.string().max(120)),
        packagePrice: z.number().finite().min(0).max(1_000_000),
        packageQuantity: z.number().finite().min(0).max(1_000_000),
        unit: unitEnum,
        quantityUsed: z.number().finite().min(0).max(1_000_000),
      })
    )
    .max(80),
});

/** Persistência Enterprise da ficha — totais NÃO são confiados; engine recalcula no server. */
export const technicalSheetSaveSchema = z.object({
  productId: idSchema,
  mode: pricingModeEnum,
  strategyValue: z.number().finite().min(0).max(1_000_000),
  desiredMarkupPercent: z
    .number()
    .finite()
    .min(0)
    .max(10_000)
    .nullable()
    .optional(),
  lines: z
    .array(
      z.discriminatedUnion("componentType", [
        z.object({
          componentType: z.literal("INGREDIENT"),
          ingredientId: z
            .string()
            .max(64)
            .optional()
            .transform((v) => (v && v.length >= 8 ? v : undefined)),
          name: z.string().transform(stripHtml).pipe(z.string().max(120)),
          packagePrice: z.number().finite().min(0).max(1_000_000),
          packageQuantity: z.number().finite().min(0).max(1_000_000),
          unit: unitEnum,
          wastePercent: z.number().finite().min(0).max(99.99).default(0),
          quantityUsed: z.number().finite().min(0).max(1_000_000),
        }),
        z.object({
          componentType: z.literal("BASE_RECIPE"),
          baseRecipeId: idSchema,
          quantityUsed: z.number().finite().min(0).max(1_000_000),
        }),
      ])
    )
    .max(80),
  dynamicCosts: z
    .array(
      z.object({
        name: z
          .string()
          .transform(stripHtml)
          .pipe(z.string().min(1).max(80)),
        kind: z.enum(["FIXED", "PERCENT"]),
        value: z.number().finite().min(0).max(1_000_000),
      })
    )
    .max(40),
});

export const baseRecipeWriteSchema = z.object({
  id: z
    .string()
    .optional()
    .transform((v) => (v && v.length >= 8 ? v : undefined))
    .pipe(idSchema.optional()),
  name: plainText(120, "o nome da receita base"),
  description: z
    .string()
    .optional()
    .nullable()
    .transform((v) => {
      if (v == null || String(v).trim() === "") return null;
      return stripHtml(String(v)).slice(0, 500);
    }),
  yieldQuantity: z.number().finite().min(0.0001).max(1_000_000),
  yieldUnit: unitEnum,
  items: z
    .array(
      z.discriminatedUnion("componentType", [
        z.object({
          componentType: z.literal("INGREDIENT"),
          ingredientId: idSchema,
          quantityUsed: z.number().finite().min(0.0001).max(1_000_000),
        }),
        z.object({
          componentType: z.literal("BASE_RECIPE"),
          nestedBaseRecipeId: idSchema,
          quantityUsed: z.number().finite().min(0.0001).max(1_000_000),
        }),
      ])
    )
    .min(1, "Adicione ao menos um item.")
    .max(80),
});

/**
 * Pathname do Vercel Blob — rejeita traversal (`..`), URLs absolutas e chars suspeitos.
 * Usado em GET /api/file?pathname=
 */
export const blobPathnameSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !value.includes(".."), { message: "Pathname inválido." })
  .refine((value) => !/^https?:\/\//i.test(value), {
    message: "Pathname inválido.",
  })
  .refine((value) => !value.startsWith("/") && !value.includes("\\"), {
    message: "Pathname inválido.",
  })
  .refine((value) => /^[a-zA-Z0-9._\-/]+$/.test(value), {
    message: "Pathname inválido.",
  });

export const paymentAccessTokenSchema = z
  .string()
  .trim()
  .min(32)
  .max(128)
  .regex(/^[a-f0-9]+$/i, "Token inválido.");

/** Motivo refletido na UI de falha — texto curto, sem HTML. */
export const failureMotivoSchema = z
  .string()
  .transform(stripHtml)
  .pipe(z.string().max(200));

export const stockQuantitySchema = z
  .number()
  .int("Quantidade deve ser inteira.")
  .min(0, "Estoque não pode ser negativo.")
  .max(1_000_000);

export const stockAdjustSchema = z.object({
  productId: idSchema,
  stockQuantity: stockQuantitySchema,
});

/** Atualização de estoque em lote — máx. 200 itens por request. */
export const stockBulkUpdateSchema = z
  .array(
    z.object({
      id: idSchema,
      newStock: stockQuantitySchema,
    })
  )
  .min(1, "Selecione ao menos um produto.")
  .max(200, "Máximo de 200 produtos por atualização.");

export const reviewSubmitSchema = z.object({
  productId: idSchema,
  customerName: plainText(120, "o nome"),
  customerPhone: plainText(20, "o WhatsApp"),
  rating: z.number().int().min(1, "Nota mínima é 1.").max(5, "Nota máxima é 5."),
  comment: plainText(800, "o comentário"),
});

export const reviewAdminCreateSchema = z.object({
  productId: idSchema,
  customerName: plainText(120, "o nome"),
  customerPhone: optionalPlainText(20),
  rating: z.number().int().min(1).max(5),
  comment: plainText(800, "o comentário"),
  isVisible: z.boolean().default(true),
});

export const reviewPhoneSchema = z
  .string()
  .transform(stripHtml)
  .pipe(z.string().min(10, "Informe um WhatsApp válido.").max(20));
