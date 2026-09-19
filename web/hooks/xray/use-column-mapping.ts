"use client";

import { useMemo } from "react";
import { missingRequired } from "@/lib/xray/mapping";
import type { ColumnMapping, DatasetKind } from "@/lib/xray/types";

export function useColumnMapping(
  mapping: ColumnMapping,
  kind: DatasetKind | null,
  onChange: (m: ColumnMapping) => void
) {
  const missing = useMemo(
    () => (kind ? missingRequired(mapping, kind) : []),
    [mapping, kind]
  );

  const isValid = kind != null && missing.length === 0;

  const setField = (header: string, canonical: string | null) => {
    onChange({
      map: { ...mapping.map, [header]: canonical },
    });
  };

  return { missing, isValid, setField };
}
