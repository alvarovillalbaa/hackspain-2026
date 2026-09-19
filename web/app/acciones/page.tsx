"use client";

import { AppShell } from "@/components/xray/app-shell";
import { AccionesPortfolio } from "@/components/embat/acciones-portfolio";

export default function AccionesPage() {
  return (
    <AppShell crumbs={[{ label: "Acciones" }]}>
      <AccionesPortfolio />
    </AppShell>
  );
}
