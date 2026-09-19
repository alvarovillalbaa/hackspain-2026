"use client";

import { use } from "react";
import { Ofertas } from "@/components/embat/ofertas";

export default function OfertasPage({
  params,
}: {
  params: Promise<{ companyId: string; actionId: string }>;
}) {
  const { companyId, actionId } = use(params);
  return <Ofertas companyId={companyId} actionId={actionId} />;
}
