"use client";

import { use } from "react";
import { Grupo } from "@/components/embat/grupo";

export default function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  return <Grupo groupId={groupId} />;
}
