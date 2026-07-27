"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { loginSchema } from "@/lib/validation/safe-input";

export type LoginState = { error?: string } | undefined;

export async function authenticate(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
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
