"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2, LogIn } from "lucide-react";

import { authenticate } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Em desenvolvimento, pré-preenche com as credenciais padrão do .env
// para facilitar o acesso ao painel. Não aparece em produção.
const isDev = process.env.NODE_ENV !== "production";
const devEmail = isDev ? "admin@doceriadonalu.com" : undefined;
const devPassword = isDev ? "admin123" : undefined;

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    authenticate,
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="admin@doceriadonalu.com"
          autoComplete="email"
          defaultValue={devEmail}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          defaultValue={devPassword}
          required
        />
      </div>

      {isDev && (
        <p className="rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-500">
          <strong className="font-medium text-stone-600">Dev:</strong> use{" "}
          <code>admin@doceriadonalu.com</code> / <code>admin123</code>.
        </p>
      )}

      {state?.error && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={isPending}
        className="w-full bg-coffee-600 text-white hover:bg-coffee-700"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Entrando...
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" />
            Entrar
          </>
        )}
      </Button>
    </form>
  );
}
