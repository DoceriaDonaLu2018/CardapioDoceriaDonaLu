import { z } from "zod";

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
