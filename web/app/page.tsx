"use client";

import { AppShell } from "@/components/xray/app-shell";
import { GrupoEmpresarial } from "@/components/embat/grupo-empresarial";
import { Anticipacion } from "@/components/embat/anticipacion";

export default function GroupsIndexPage() {
  return (
    <AppShell>
      <div className="flex w-full flex-col gap-4">
        <GrupoEmpresarial />
        <Anticipacion />
      </div>
    </AppShell>
  );
}
