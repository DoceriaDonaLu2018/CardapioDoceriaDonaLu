"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";

import { signIn } from "@/auth";
import { loginSchema } from "@/lib/validation/safe-input";
import { assertMemoryRateLimit } from "@/lib/payments/rate-limit";

export type LoginState = { error?: string } | undefined;

/** Freia brute-force: máx. 10 tentativas de login por IP a cada 5 min. */
async function assertLoginRateLimit(): Promise<LoginState> {
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";

  const limit = assertMemoryRateLimit(`login:ip:${ip}`, 10, 5 * 60 * 1000);
  if (!limit.ok) {
    return {
      error: `Muitas tentativas de login. Aguarde ${limit.retryAfterSec}s e tente novamente.`,
    };
  }
  return undefined;
}

export async function authenticate(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const rateError = await assertLoginRateLimit();
  if (rateError) return rateError;

  // Validação server-side (Zod) — nunca confiar só no formulário do browser.
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "E-mail ou senha inválidos." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/admin",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "E-mail ou senha inválidos." };
    }
    // Reengloba o redirect do Next (NEXT_REDIRECT) para funcionar.
    throw error;
  }
  return undefined;
}
