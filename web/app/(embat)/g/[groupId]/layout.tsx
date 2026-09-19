import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Grupo empresarial — Embat",
};

export default function GroupLayout({ children }: { children: ReactNode }) {
  return children;
}
