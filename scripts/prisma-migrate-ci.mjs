/**
 * Deploy de migrations no CI (Vercel).
 *
 * Histórico: o banco Neon foi criado/atualizado com `db push`, então o schema
 * existe mas `_prisma_migrations` está vazio → `migrate deploy` falha com P3005.
 *
 * Nesta transição:
 * 1) tenta `migrate deploy` (com retry em P1002 / advisory lock)
 * 2) se P3005: marca todas as migrations locais como já aplicadas (baseline)
 * 3) `db push` (sem accept-data-loss) alinha colunas novas
 *
 * Neon: use DIRECT_URL (conexão sem -pooler) nas env da Vercel. Migrate com
 * PgBouncer/pooler costuma travar no pg_advisory_lock → P1002.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy-wait curto — script de build, sem dependência extra
  }
}

/** Prefere conexão direta (sem pooler) só para migrate/push. */
function migrateEnv() {
  const env = { ...process.env };
  const direct = process.env.DIRECT_URL?.trim();
  if (direct) {
    console.log(
      "[prisma-migrate-ci] Usando DIRECT_URL para migrate (evita lock no pooler Neon)."
    );
    env.DATABASE_URL = direct;
  } else if (
    process.env.DATABASE_URL &&
    /[-.]pooler\./i.test(process.env.DATABASE_URL)
  ) {
    console.warn(
      "[prisma-migrate-ci] AVISO: DATABASE_URL parece pooled (-pooler). " +
        "Defina DIRECT_URL (host sem pooler) na Vercel para evitar P1002."
    );
  }
  return env;
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: true,
    env,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return { status: result.status ?? 1, stdout, stderr };
}

function isLockTimeout(combined) {
  return (
    combined.includes("P1002") ||
    combined.includes("advisory lock") ||
    combined.includes("pg_advisory_lock")
  );
}

function migrateDeployWithRetry(env, maxAttempts = 5) {
  let last = { status: 1, stdout: "", stderr: "" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(
      `[prisma-migrate-ci] migrate deploy (tentativa ${attempt}/${maxAttempts})…`
    );
    last = run("npx", ["prisma", "migrate", "deploy"], env);
    if (last.status === 0) return last;

    const combined = `${last.stdout}\n${last.stderr}`;
    if (!isLockTimeout(combined) || attempt === maxAttempts) {
      return last;
    }

    const waitMs = Math.min(2000 * 2 ** (attempt - 1), 15000);
    console.warn(
      `[prisma-migrate-ci] P1002 advisory lock — aguardando ${waitMs}ms e tentando de novo…`
    );
    sleepSync(waitMs);
  }
  return last;
}

function listMigrationNames() {
  const dir = path.join(process.cwd(), "prisma", "migrations");
  return fs
    .readdirSync(dir)
    .filter((name) => {
      const full = path.join(dir, name);
      return (
        fs.statSync(full).isDirectory() &&
        fs.existsSync(path.join(full, "migration.sql"))
      );
    })
    .sort();
}

function main() {
  const env = migrateEnv();
  const first = migrateDeployWithRetry(env);
  if (first.status === 0) {
    process.exit(0);
  }

  const combined = `${first.stdout}\n${first.stderr}`;
  if (isLockTimeout(combined)) {
    console.error(
      "\n[prisma-migrate-ci] Continua P1002 após retries.\n" +
        "1) Na Vercel, adicione DIRECT_URL = connection string Neon SEM '-pooler'.\n" +
        "2) Evite dois deploys ao mesmo tempo.\n" +
        "3) No Neon SQL Editor, se necessário: SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE '%pg_advisory_lock%';"
    );
    process.exit(first.status);
  }

  if (!combined.includes("P3005")) {
    process.exit(first.status);
  }

  console.log(
    "\n[prisma-migrate-ci] P3005: banco não vazio sem histórico. Fazendo baseline…"
  );

  const migrations = listMigrationNames();
  if (migrations.length === 0) {
    console.error("[prisma-migrate-ci] Nenhuma migration encontrada.");
    process.exit(1);
  }

  for (const name of migrations) {
    console.log(`[prisma-migrate-ci] resolve --applied ${name}`);
    const resolved = run(
      "npx",
      ["prisma", "migrate", "resolve", "--applied", name],
      env
    );
    if (resolved.status !== 0) {
      console.error(
        `[prisma-migrate-ci] Falha ao marcar ${name} como aplicada.`
      );
      process.exit(resolved.status);
    }
  }

  console.log(
    "[prisma-migrate-ci] Sincronizando schema restante com db push (sem data-loss)…"
  );
  const push = run("npx", ["prisma", "db", "push", "--skip-generate"], env);
  if (push.status !== 0) {
    console.error(
      "[prisma-migrate-ci] db push falhou. Verifique drift destruído no schema."
    );
    process.exit(push.status);
  }

  console.log("[prisma-migrate-ci] Baseline concluído.");
  process.exit(0);
}

main();
