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
import { Separator } from "@/components/ui/separator";

export interface Crumb {
  label: string;
  href?: string;
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

  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="font-heading text-sm font-semibold tracking-tight text-foreground"
          >
            X Ray
          </Link>
          <Separator orientation="vertical" className="h-4" />
          <Breadcrumb className="min-w-0 flex-1">
            <BreadcrumbList>
              <BreadcrumbItem>
                {pathname === "/" ? (
                  <BreadcrumbPage>Portfolio</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href="/" />}>Portfolio</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {crumbs.map((c, i) => (
                <span key={`${c.label}-${i}`} className="contents">
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {c.href && i < crumbs.length - 1 ? (
                      <BreadcrumbLink render={<Link href={c.href} />}>
                        {c.label}
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{c.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </span>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          {trailing}
          <Link
            href="/chat"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Eve
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
