"use client";

import { use } from "react";
import { AppShell } from "@/components/xray/app-shell";
import { Grupo } from "@/components/embat/grupo";
import { useGroups } from "@/hooks/xray/use-groups";

export default function GroupScorePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { data: groups } = useGroups();
  const name = groups.find((g) => g.group_id === groupId)?.name ?? groupId;

  return (
    <AppShell crumbs={[{ label: name, href: `/g/${groupId}` }]}>
      <Grupo groupId={groupId} />
    </AppShell>
  );
}
