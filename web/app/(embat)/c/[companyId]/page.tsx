"use client";

import { use } from "react";
import { Compania } from "@/components/embat/compania";

export default function CompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = use(params);
  return <Compania companyId={companyId} />;
}
