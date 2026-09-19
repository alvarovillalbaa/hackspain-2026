"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Grupos Empresariales" },
  { href: "/companies", label: "Compañías" },
] as const;

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-dvh w-[280px] shrink-0 flex-col gap-2.5 overflow-clip bg-[#03122f] p-[30px]",
        className
      )}
    >
      <div className="flex w-full flex-col items-start gap-[30px]">
        <Link
          href="/"
          className="relative h-5 w-[93px] shrink-0"
          aria-label="Embat"
        >
          <img
            alt=""
            src="/embat/logo.svg"
            className="absolute inset-0 max-w-none size-full"
          />
        </Link>
        <nav aria-label="Principal" className="flex w-full flex-col gap-2.5">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/" || pathname.startsWith("/g/")
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`) ||
                  (item.href === "/companies" && pathname.startsWith("/c/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center overflow-clip rounded-[6px] px-2.5 py-2 text-[14px] font-medium tracking-[-0.14px]",
                  active
                    ? "bg-[rgba(171,111,255,0.3)] text-white"
                    : "text-[#f0f0f0] hover:bg-white/5"
                )}
              >
                {active ? (
                  <span
                    aria-hidden
                    className="absolute top-1/2 left-[-30px] h-[22px] w-px -translate-y-1/2 bg-white"
                  />
                ) : null}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
