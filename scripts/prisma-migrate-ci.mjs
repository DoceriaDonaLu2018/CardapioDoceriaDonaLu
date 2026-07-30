/**
 * Deploy de migrations no CI (Vercel).
 *
 * Histórico: o banco Neon foi criado/atualizado com `db push`, então o schema
 * existe mas `_prisma_migrations` está vazio → `migrate deploy` falha com P3005.
 *
 * Nesta transição:
 * 1) tenta `migrate deploy`
 * 2) se P3005: marca todas as migrations locais como já aplicadas (baseline)
 * 3) `db push` (sem accept-data-loss) alinha colunas novas que ainda não existem
 *    (ex.: stockReserved) — só corre na 1ª vez; deploys seguintes usam só migrate
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: true,
    env: process.env,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return { status: result.status ?? 1, stdout, stderr };
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
  const first = run("npx", ["prisma", "migrate", "deploy"]);
  if (first.status === 0) {
    process.exit(0);
  }

  const combined = `${first.stdout}\n${first.stderr}`;
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
    const resolved = run("npx", [
      "prisma",
      "migrate",
      "resolve",
      "--applied",
      name,
    ]);
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
  const push = run("npx", ["prisma", "db", "push", "--skip-generate"]);
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
