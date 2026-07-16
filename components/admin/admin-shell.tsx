"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  CakeSlice,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  ShoppingCart,
  Tags,
  UtensilsCrossed,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { PendingOrdersBadge } from "@/components/admin/pending-orders-badge";

const links = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/categorias", label: "Categorias", icon: Tags },
  { href: "/admin/produtos", label: "Produtos", icon: UtensilsCrossed },
  { href: "/admin/ficha-tecnica", label: "Ficha Técnica", icon: Calculator },
  { href: "/admin/pedidos/novo", label: "Novo Pedido", icon: ShoppingCart },
  {
    href: "/admin/pedidos",
    label: "Pedidos",
    icon: ClipboardList,
    exact: true,
    badge: true,
  },
  { href: "/admin/pedidos/historico", label: "Histórico", icon: History },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false); // desktop: minimizada
  const [mobileOpen, setMobileOpen] = useState(false); // mobile: gaveta

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800">
      {/* Barra superior (apenas mobile) */}
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="rounded-md p-1.5 text-stone-700 hover:bg-stone-100"
        >
          <Menu className="h-6 w-6" />
        </button>
        <span className="flex items-center gap-2 font-serif text-lg font-semibold">
          <CakeSlice className="h-5 w-5 text-coffee-600" />
          Doceria Dona Lu
        </span>
      </header>

      {/* Overlay da gaveta (apenas mobile) */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-stone-900 text-stone-100 transition-all duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
          collapsed ? "lg:w-16" : "lg:w-64"
        )}
      >
        <div className="flex h-[57px] items-center justify-between border-b border-stone-800 px-4">
          <span
            className={cn(
              "flex items-center gap-2",
              collapsed && "lg:hidden"
            )}
          >
            <CakeSlice className="h-6 w-6 shrink-0 text-coffee-300" />
            <span className="font-serif text-lg font-semibold">Doceria Dona Lu</span>
          </span>

          {/* Toggle de colapsar (desktop) */}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expandir menu" : "Minimizar menu"}
            className="hidden rounded-md p-1.5 text-stone-400 hover:bg-stone-800 hover:text-white lg:block"
          >
            {collapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </button>

          {/* Fechar gaveta (mobile) */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="rounded-md p-1.5 text-stone-400 hover:bg-stone-800 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {links.map(({ href, label, icon: Icon, exact, badge }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? label : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive(href, exact)
                  ? "bg-coffee-600 text-white"
                  : "text-stone-300 hover:bg-stone-800 hover:text-white",
                collapsed && "lg:justify-center lg:px-0"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className={cn(collapsed && "lg:hidden")}>{label}</span>
              {badge && <PendingOrdersBadge collapsed={collapsed} />}
            </Link>
          ))}
        </nav>

        <div className="border-t border-stone-800 p-3">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            title={collapsed ? "Sair" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-stone-300 transition-colors hover:bg-stone-800 hover:text-white",
              collapsed && "lg:justify-center lg:px-0"
            )}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className={cn(collapsed && "lg:hidden")}>Sair</span>
          </button>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <div
        className={cn(
          "transition-all duration-200",
          collapsed ? "lg:pl-16" : "lg:pl-64"
        )}
      >
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
