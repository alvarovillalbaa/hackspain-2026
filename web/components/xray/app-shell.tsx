"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { embatDisplayClass, embatUiClass } from "@/components/embat/font";
import { SearchDialog } from "@/components/xray/search-dialog";
import {
  SearchProvider,
  useSearch,
} from "@/components/xray/search-context";
import { useWatchSlackSync } from "@/hooks/xray/use-watch-slack-sync";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

const PRIMARY_NAV = [
  { href: "/companies", label: "Empresas", match: "empresas" },
  { href: "/", label: "Dashboard", match: "dashboard" },
  { href: "/acciones", label: "Acciones", match: "acciones" },
  { href: "/productos", label: "Productos", match: "productos" },
] as const;

type NavMatch = (typeof PRIMARY_NAV)[number]["match"];

function navActive(pathname: string, match: NavMatch): boolean {
  if (match === "dashboard") return pathname === "/";
  if (match === "empresas") {
    return (
      pathname === "/companies" ||
      pathname.startsWith("/c/") ||
      pathname.startsWith("/compare") ||
      pathname.startsWith("/g/") ||
      pathname === "/grupos"
    );
  }
  if (match === "acciones") return pathname === "/acciones";
  if (match === "productos") return pathname === "/productos";
  return false;
}

function AppShellInner({
  children,
  crumbs = [],
  trailing,
}: {
  children: React.ReactNode;
  crumbs?: Crumb[];
  trailing?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { openSearch } = useSearch();
  useWatchSlackSync();
  const showCrumbs = crumbs.length > 0;

  return (
    <div className={`${embatUiClass} flex min-h-dvh bg-white text-black`}>
      <aside
        className="sticky top-0 flex h-dvh w-[280px] shrink-0 flex-col gap-2.5 overflow-clip bg-[#f6f3ee] p-[30px]"
        aria-label="Navegación"
      >
        <div className="flex w-full flex-1 flex-col items-start gap-[30px]">
          <Link
            href="/"
            className={`${embatDisplayClass} text-[20px] font-medium tracking-[-0.3px] text-black`}
          >
            X Ray
          </Link>
          <nav aria-label="Principal" className="flex w-full flex-col gap-1.5">
            <Button
              type="button"
              variant="ghost"
              onClick={openSearch}
              className=              "h-auto w-full justify-start rounded-xl px-2.5 py-2 text-[14px] font-medium tracking-[-0.14px] text-[#333] hover:bg-black/[0.04]"
            >
              Buscar
            </Button>
            {PRIMARY_NAV.map((item) => {
              const active = navActive(pathname, item.match);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center overflow-clip rounded-xl px-2.5 py-2 text-[14px] font-medium tracking-[-0.14px]",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-[#333] hover:bg-black/[0.04]"
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute top-1/2 left-[-30px] h-[22px] w-px -translate-y-1/2 bg-primary"
                    />
                  ) : null}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto flex w-full flex-col gap-2">
          <Link
            href="/settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
            className={cn(
              "flex items-center rounded-xl px-2.5 py-2 text-[14px] font-medium tracking-[-0.14px]",
              pathname === "/settings"
                ? "bg-primary/15 text-primary"
                : "text-[#666] hover:bg-black/[0.04] hover:text-black"
            )}
          >
            Ajustes
          </Link>
          <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-semibold tracking-[-0.12px] text-primary-foreground"
            >
              AV
            </span>
            <span className="min-w-0 truncate text-[13px] font-medium tracking-[-0.13px] text-black">
              Alvaro Villalba
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {showCrumbs || trailing ? (
          <header className="sticky top-0 z-30 flex min-h-[48px] items-center gap-3 bg-white px-[50px] py-2 max-lg:px-6">
            {showCrumbs ? (
              <Breadcrumb className="min-w-0 flex-1">
                <BreadcrumbList className="text-[13px] text-[#666]">
                  {crumbs.map((c, i) => (
                    <span key={`${c.label}-${i}`} className="contents">
                      {i > 0 ? <BreadcrumbSeparator /> : null}
                      <BreadcrumbItem>
                        {c.href && i < crumbs.length - 1 ? (
                          <BreadcrumbLink render={<Link href={c.href} />}>
                            {c.label}
                          </BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage className="text-black">
                            {c.label}
                          </BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                    </span>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            ) : (
              <div className="min-w-0 flex-1" />
            )}
            {trailing}
          </header>
        ) : null}
        <main className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto px-[50px] py-[50px] max-lg:p-6">
          {children}
        </main>
      </div>
      <SearchDialog />
    </div>
  );
}

export function AppShell({
  children,
  crumbs = [],
  trailing,
}: {
  children: React.ReactNode;
  crumbs?: Crumb[];
  trailing?: React.ReactNode;
}) {
  return (
    <SearchProvider>
      <AppShellInner crumbs={crumbs} trailing={trailing}>
        {children}
      </AppShellInner>
    </SearchProvider>
  );
}
