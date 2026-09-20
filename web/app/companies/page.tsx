"use client";

import { AppShell } from "@/components/xray/app-shell";
import {
  Companias,
  CompaniasToolbar,
  useCompaniasState,
} from "@/components/embat/companias";

export default function CompaniesPage() {
  const state = useCompaniasState();
  return (
    <AppShell
      crumbs={[{ label: "Empresas" }]}
      trailing={
        <CompaniasToolbar
          rules={state.rules}
          setRules={state.setRules}
          currencies={state.currencies}
          onImport={() => state.setImportOpen(true)}
        />
      }
    >
      <Companias state={state} />
    </AppShell>
  );
}
