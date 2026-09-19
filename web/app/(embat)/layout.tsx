import type { ReactNode } from "react";
import type { Metadata } from "next";
import { EmbatShell } from "@/components/embat/chrome";
import { embatUiClass } from "@/components/embat/font";

export const metadata: Metadata = {
  title: "Grupos Empresariales — Embat",
};

export default function EmbatLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${embatUiClass} min-h-full bg-white`}>
      <EmbatShell>{children}</EmbatShell>
    </div>
  );
}
