# Doceria Dona Lu — Cardápio Digital + Painel Admin

Catálogo digital **Mobile-First** para a **Doceria Dona Lu**, com um **Painel de Administração** protegido por login e CRUD completo. Construído com **Next.js (App Router)**, **Tailwind CSS**, **shadcn/ui**, **lucide-react**, **Prisma** e **NextAuth (Auth.js v5)**.

## Recursos

### Catálogo público (`/`)

- **Header fixo** com nome centralizado e menu Hamburger (Sheet lateral).
- **Scroll Spy**: o menu destaca a categoria visível e navega suavemente até a seção.
- **Grid responsivo**: 1 coluna (mobile) → 2 (tablet) → 3/4 (desktop).
- Os dados vêm **do banco via Prisma** (Server Component) — sem mock.

### Painel administrativo (`/admin`)

- **Login** em `/admin/login` (NextAuth, provedor de credenciais, 1 admin).
- **Middleware** protege `/admin` e sub-rotas, redirecionando ao login.
- **Dashboard** com contadores (categorias, produtos, indisponíveis).
- **Categorias**: tabela + Dialog para criar/editar + excluir.
- **Produtos**: tabela (miniatura, título, categoria, preço, status) + Sheet
  com formulário (título, descrição, preço, imagem, categoria e switch de
  disponibilidade) + excluir.
- Todas as mutações usam **Next.js Server Actions**.

## Pré-requisitos

- **Node.js 18.18+** (recomendado 20 LTS).

## Configuração e execução

1. Instale as dependências:

```bash
npm install
```

2. Tenha um banco **PostgreSQL** (ex.: [Neon](https://neon.tech) — grátis e sem
   cartão). Crie o arquivo `.env` (copie de `.env.example`) e ajuste os valores:

```env
DATABASE_URL="postgresql://user:senha@host/dbname?sslmode=require"
AUTH_SECRET="troque-por-um-segredo-aleatorio"   # gere com: npx auth secret
ADMIN_EMAIL="admin@doceriadonalu.com"
ADMIN_PASSWORD="admin123"
```

3. Crie as tabelas e popule com dados iniciais:

```bash
npm run db:push   # cria as tabelas no PostgreSQL
npm run db:seed   # popula 6 categorias e 24 produtos
```

4. Rode o projeto:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) (catálogo) e
[http://localhost:3000/admin](http://localhost:3000/admin) (painel).

**Login padrão do admin:** `admin@doceriadonalu.com` / `admin123`
(definido no `.env`).

### Scripts disponíveis

```bash
npm run dev        # desenvolvimento
npm run build      # prisma generate + build de produção
npm run start      # sobe o build
npm run lint       # checa lint
npm run db:push    # aplica o schema no banco
npm run db:seed    # popula o banco
npm run db:studio  # abre o Prisma Studio (GUI do banco)
```

## Estrutura do projeto

```
app/
  layout.tsx                 # fontes (Playfair/Inter) e metadata
  globals.css                # Tailwind + tema + scroll-behavior
  page.tsx                   # catálogo público (lê do banco via Prisma)
  api/auth/[...nextauth]/    # route handler do NextAuth
  admin/
    login/                   # página de login + action de autenticação
    categorias/actions.ts    # server actions (CRUD de categorias)
    produtos/actions.ts      # server actions (CRUD de produtos)
    (protected)/             # grupo protegido pelo layout + middleware
      layout.tsx             # sidebar fixa + verificação de sessão
      page.tsx               # dashboard (/admin)
      categorias/            # página + dialog de categorias
      produtos/              # página + sheet/form de produtos
components/
  ProductCard.tsx            # card de produto do catálogo
  layout/                    # Header (scroll spy) e Footer
  admin/                     # sidebar, logout, dialog de exclusão
  ui/                        # shadcn/ui (button, sheet, dialog, table,
                             #   input, textarea, label, select, switch)
hooks/use-scroll-spy.ts      # IntersectionObserver para o link ativo
lib/
  prisma.ts                  # singleton do Prisma Client
  utils.ts | format.ts | slugify.ts | auth-guard.ts
prisma/
  schema.prisma              # models Category e Product (1:N)
  seed.ts                    # dados iniciais
auth.ts | auth.config.ts     # configuração do NextAuth (Auth.js v5)
middleware.ts                # protege /admin/*
```

## Modelagem (Prisma)

- **Category**: `id`, `name`, `slug` (único), `order`, `products[]`.
- **Product**: `id`, `title`, `description`, `imageUrl`, `price`,
  `isAvailable`, `categoryId` → relação **1:N** (uma categoria, vários
  produtos; `onDelete: Cascade`).

## Deploy na Vercel (passo a passo)

1. **Crie um PostgreSQL na nuvem** (ex.: [Neon](https://neon.tech), grátis).
   Copie duas versões da connection string:
   - **Direta** (sem `-pooler`) → para migrations/seed a partir do seu PC.
   - **Pooled** (com `-pooler`) → para o runtime serverless na Vercel.

2. **Crie as tabelas e popule** (localmente, usando a URL direta no `.env`):

```bash
npm run db:push
npm run db:seed
```

3. **Suba o projeto para o GitHub** (o `.env` não sobe — está no `.gitignore`).

4. Na **Vercel**, importe o repositório (New Project → seu repo).

5. Em **Settings → Environment Variables**, adicione (para Production e Preview):

   | Variável | Valor |
   |----------|-------|
   | `DATABASE_URL` | connection string **pooled** do Postgres |
   | `AUTH_SECRET` | gere com `npx auth secret` |
   | `ADMIN_EMAIL` | e-mail de login do painel |
   | `ADMIN_PASSWORD` | senha de login do painel |

6. Clique em **Deploy**. Ao final, acesse:
   - Catálogo: `https://SEU-PROJETO.vercel.app`
   - Painel: `https://SEU-PROJETO.vercel.app/admin` (login com `ADMIN_EMAIL`/`ADMIN_PASSWORD`).

> O build já roda `prisma generate` automaticamente. As tabelas são criadas no
> passo 2 (uma vez); a Vercel apenas lê/grava no banco já existente.

## Observações

- As imagens usam URLs do Unsplash/Placehold.co. Domínios liberados em
  `next.config.mjs` (`images.unsplash.com`, `placehold.co`).
- `.env` está no `.gitignore` (não sobe ao GitHub); configure as variáveis
  diretamente na Vercel.
- **Segurança**: para produção, considere trocar a comparação de senha em
  texto puro por um hash (ex.: `bcrypt`) e usar variáveis de ambiente seguras.
