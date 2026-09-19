import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Ofertas — Embat",
};

export default function OfertasLayout({ children }: { children: ReactNode }) {
  return children;
}
