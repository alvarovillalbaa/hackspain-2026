"use client";

import { AppShell } from "@/components/xray/app-shell";
import { Anticipacion } from "@/components/embat/anticipacion";
import { Dashboard } from "@/components/embat/dashboard";

export default function DashboardPage() {
  return (
    <AppShell crumbs={[{ label: "Dashboard" }]}>
      <div className="flex w-full flex-col gap-4">
        <Dashboard />
        <Anticipacion />
      </div>
    </AppShell>
  );
}
