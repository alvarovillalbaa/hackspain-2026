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
import { embatUiClass } from "@/components/embat/font";
import { useWatchSlackSync } from "@/hooks/xray/use-watch-slack-sync";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

const NAV = [
  { href: "/", label: "Grupos Empresariales", match: "groups" },
  { href: "/companies", label: "Compañías", match: "companies" },
] as const;

function navActive(pathname: string, match: (typeof NAV)[number]["match"]) {
  if (match === "groups") {
    return pathname === "/" || pathname.startsWith("/g/");
  }
  return (
    pathname === "/companies" ||
    pathname.startsWith("/c/") ||
    pathname.startsWith("/compare")
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
  const pathname = usePathname();
  useWatchSlackSync();
  const showCrumbs = crumbs.length > 0;

  return (
    <div
      className={`${embatUiClass} flex min-h-dvh flex-col bg-white text-black`}
    >
      <header className="sticky top-0 z-40 border-b border-[#dce0e6] bg-white">
        <div className="flex min-h-[56px] flex-wrap items-center gap-3 px-[50px] py-2 max-lg:px-6">
          <nav aria-label="Principal" className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = navActive(pathname, item.match);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-[4px] px-2.5 py-1.5 text-[14px] font-medium tracking-[-0.14px]",
                    active
                      ? "bg-[rgba(17,168,255,0.12)] text-[#11a8ff]"
                      : "text-[#666] hover:bg-[rgba(220,224,230,0.45)] hover:text-black"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
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
          <Link
            href="/settings"
            className={cn(
              "rounded-[4px] px-2.5 py-1.5 text-[13px] font-medium tracking-[-0.13px]",
              pathname === "/settings"
                ? "bg-[rgba(17,168,255,0.12)] text-[#11a8ff]"
                : "text-[#666] hover:text-black"
            )}
          >
            Ajustes
          </Link>
        </div>
      </header>
      <main className="min-w-0 flex-1 px-[50px] py-[50px] max-lg:p-6">
        {children}
      </main>
    </div>
  );
}
