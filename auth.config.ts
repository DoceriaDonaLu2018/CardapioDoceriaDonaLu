import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

/**
 * Configuração base do Auth.js (NextAuth v5).
 *
 * Fica separada de `auth.ts` porque é usada também no middleware (Edge
 * Runtime). Por isso, evite importar aqui qualquer dependência de Node
 * (ex.: Prisma). O admin é um único usuário definido por variáveis de
 * ambiente, então a autorização não toca no banco.
 */
/** Sessão administrativa: expiração rígida de 24h. */
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Comparação em tempo constante SEM node:crypto (auth.config é carregado
 * também no Edge/middleware, onde módulos de Node não estão disponíveis).
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}

/** PBKDF2-SHA-256 via Web Crypto (Edge-safe). Equaliza tempo e freia brute-force. */
const PBKDF2_ITERATIONS = 210_000;

async function derivePasswordBits(
  password: string,
  pepper: string
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode(`ddl-admin:${pepper}`),
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

async function passwordMatches(
  candidate: string,
  stored: string,
  pepper: string | undefined
): Promise<boolean> {
  if (!pepper) {
    return constantTimeEquals(candidate, stored);
  }
  const [a, b] = await Promise.all([
    derivePasswordBits(candidate, pepper),
    derivePasswordBits(stored, pepper),
  ]);
  return timingSafeEqualBytes(a, b);
}

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/admin/login",
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  jwt: {
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      authorize: async (credentials) => {
        const rawEmail = credentials?.email as string | undefined;
        const rawPassword = credentials?.password as string | undefined;

        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!rawEmail || !rawPassword || !adminEmail || !adminPassword) {
          return null;
        }

        // Tolerante a espaços em volta e a maiúsculas no e-mail
        // (autofill/teclados móveis costumam adicionar variações).
        const email = rawEmail.trim().toLowerCase();
        const password = rawPassword.trim();

        const emailMatches = constantTimeEquals(
          email,
          adminEmail.trim().toLowerCase()
        );
        const passwordOk = await passwordMatches(
          password,
          adminPassword.trim(),
          process.env.AUTH_SECRET?.trim()
        );

        if (emailMatches && passwordOk) {
          return {
            id: "admin",
            name: "Administrador",
            email: adminEmail,
          };
        }

        return null;
      },
    }),
  ],
  callbacks: {
    // Protege /admin e redireciona conforme o estado de login.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname === "/admin/login";
      const isOnAdmin = nextUrl.pathname.startsWith("/admin");

      if (isOnLogin) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/admin", nextUrl));
        }
        return true;
      }

      if (isOnAdmin) {
        return isLoggedIn; // não logado -> redireciona para signIn (/admin/login)
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
