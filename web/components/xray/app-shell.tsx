"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  FlaskConical,
  LayoutDashboard,
  ListTodo,
  Search,
  Settings,
  Wallet,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Kbd } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
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
  {
    href: "/companies",
    label: "Empresas",
    match: "empresas",
    icon: Building2,
  },
  {
    href: "/",
    label: "Inicio",
    match: "inicio",
    icon: LayoutDashboard,
  },
  {
    href: "/acciones",
    label: "Acciones",
    match: "acciones",
    icon: ListTodo,
  },
  {
    href: "/productos",
    label: "Productos",
    match: "productos",
    icon: Wallet,
  },
] as const;

type NavMatch = (typeof PRIMARY_NAV)[number]["match"];

function navActive(pathname: string, match: NavMatch): boolean {
  if (match === "inicio") return pathname === "/";
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
  const settingsActive = pathname === "/settings";

  return (
    <div className={cn(embatUiClass, "min-h-dvh bg-background text-foreground")}>
      <SidebarProvider>
        <Sidebar collapsible="icon" className="border-r border-sidebar-border">
          <SidebarHeader className="gap-3 px-3 pt-4">
            <Link
              href="/"
              className={cn(
                embatDisplayClass,
                "flex h-8 items-center gap-2 px-1 text-[20px] font-medium tracking-[-0.3px] text-sidebar-foreground",
                "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
              )}
            >
              <span className="group-data-[collapsible=icon]:hidden">X Ray</span>
              <span className="hidden text-[16px] group-data-[collapsible=icon]:inline">
                XR
              </span>
            </Link>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Buscar"
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        openSearch();
                      }}
                      onPointerDown={(e) => {
                        // TooltipTrigger can swallow click in some browsers; pointer opens reliably.
                        if (e.button === 0) openSearch();
                      }}
                      className="justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <Search />
                        <span>Buscar</span>
                      </span>
                      <Kbd className="hidden group-data-[collapsible=icon]:hidden md:inline-flex">
                        ⌘K
                      </Kbd>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {PRIMARY_NAV.map((item) => {
                    const active = navActive(pathname, item.match);
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          render={<Link href={item.href} />}
                          isActive={active}
                          tooltip={item.label}
                          aria-current={active ? "page" : undefined}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="gap-1">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/settings" />}
                  isActive={settingsActive}
                  tooltip="Ajustes"
                  aria-current={settingsActive ? "page" : undefined}
                >
                  <Settings />
                  <span>Ajustes</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <div
                  title="Entorno de ensayo"
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <FlaskConical className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 truncate text-[13px] font-medium tracking-[-0.13px] text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                    Entorno de ensayo
                  </span>
                </div>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="min-h-dvh bg-background">
          <header className="sticky top-0 z-30 flex min-h-12 items-center gap-2 bg-background px-6 py-2 md:px-12">
            <SidebarTrigger className="-ml-1" />
            {showCrumbs ? (
              <Breadcrumb className="min-w-0 flex-1">
                <BreadcrumbList className="text-[13px] text-muted-foreground">
                  {crumbs.map((c, i) => (
                    <span key={`${c.label}-${i}`} className="contents">
                      {i > 0 ? <BreadcrumbSeparator /> : null}
                      <BreadcrumbItem>
                        {c.href && i < crumbs.length - 1 ? (
                          <BreadcrumbLink render={<Link href={c.href} />}>
                            {c.label}
                          </BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage className="text-foreground">
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
          <main className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto px-6 py-8 md:px-12 md:py-12">
            {children}
          </main>
        </SidebarInset>
        <SearchDialog />
      </SidebarProvider>
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
