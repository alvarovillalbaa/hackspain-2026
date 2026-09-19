"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { provider } from "@/lib/xray/provider";
import type { NegotiationLever } from "@/lib/xray/types";

/** Sync expanded product id with `?p=PRODUCT_ID`. */
export function useExpandable(param = "p") {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const expandedId = searchParams.get(param);

  const expand = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set(param, id);
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [param, pathname, router, searchParams]
  );

  const collapse = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(param);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [param, pathname, router, searchParams]);

  return { expandedId, expand, collapse, isExpanded: Boolean(expandedId) };
}

export function useNegotiation(
  productId: string | null,
  companyId: string,
  actionId: string,
  amount: number
) {
  const key = productId
    ? `${productId}:${companyId}:${actionId}:${amount}`
    : null;
  const [data, setData] = useState<NegotiationLever[]>([]);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!productId || !key) return;
    let cancelled = false;
    provider
      .getNegotiation(productId, {
        company_id: companyId,
        action_id: actionId,
        amount,
      })
      .then((l) => {
        if (cancelled) return;
        setData(l);
        setFetchedFor(key);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, companyId, actionId, amount, key]);

  if (!key) {
    return { data: [] as NegotiationLever[], loading: false };
  }

  return {
    data: fetchedFor === key ? data : [],
    loading: fetchedFor !== key,
  };
}
