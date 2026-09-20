"use client";

import { AppShell } from "@/components/xray/app-shell";
import { Watchers } from "@/components/embat/watchers";

export default function WatchersPage() {
  return (
    <AppShell crumbs={[{ label: "Vigilancia" }]}>
      <Watchers />
    </AppShell>
  );
}
