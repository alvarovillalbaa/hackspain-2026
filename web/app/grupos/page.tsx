"use client";

import { AppShell } from "@/components/xray/app-shell";
import { GrupoEmpresarial } from "@/components/embat/grupo-empresarial";

/** Unlisted: groups table kept for capability; not in the sidebar. */
export default function GruposPage() {
  return (
    <AppShell crumbs={[{ label: "Grupos empresariales" }]}>
      <GrupoEmpresarial />
    </AppShell>
  );
}
