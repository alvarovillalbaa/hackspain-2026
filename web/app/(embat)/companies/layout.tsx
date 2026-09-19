import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Compañías — Embat",
};

export default function CompaniesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
