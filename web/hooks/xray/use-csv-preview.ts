"use client";

import { useCallback, useState } from "react";
import { readCsvPreview } from "@/lib/xray/csv";
import { suggestDatasetKind, suggestMapping } from "@/lib/xray/mapping";
import type { ColumnMapping, CsvPreview, DatasetKind } from "@/lib/xray/types";

export interface FilePreviewState {
  file: File;
  preview: CsvPreview;
  mapping: ColumnMapping;
  kind: DatasetKind | null;
  status: "ready" | "error";
  error?: string;
}

export function useCsvPreview() {
  const [files, setFiles] = useState<FilePreviewState[]>([]);

  const addFiles = useCallback(async (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    const next: FilePreviewState[] = [];
    for (const file of list) {
      try {
        const result = await readCsvPreview(file);
        const kind = suggestDatasetKind(result.headers);
        const mapping = kind
          ? suggestMapping(result.headers, kind)
          : { map: Object.fromEntries(result.headers.map((h) => [h, null])) };
        next.push({
          file,
          preview: {
            fileName: file.name,
            headers: result.headers,
            rows: result.rows,
            suggestedKind: kind,
            byteLength: result.byteLength,
          },
          mapping,
          kind,
          status: "ready",
        });
      } catch (e) {
        next.push({
          file,
          preview: {
            fileName: file.name,
            headers: [],
            rows: [],
            suggestedKind: null,
            byteLength: file.size,
          },
          mapping: { map: {} },
          kind: null,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    setFiles((prev) => [...prev, ...next]);
  }, []);

  const removeFile = useCallback((fileName: string) => {
    setFiles((prev) => prev.filter((f) => f.preview.fileName !== fileName));
  }, []);

  const clear = useCallback(() => setFiles([]), []);

  const setKind = useCallback((fileName: string, kind: DatasetKind) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.preview.fileName !== fileName) return f;
        return {
          ...f,
          kind,
          mapping: suggestMapping(f.preview.headers, kind),
          preview: { ...f.preview, suggestedKind: kind },
        };
      })
    );
  }, []);

  const setMapping = useCallback((fileName: string, mapping: ColumnMapping) => {
    setFiles((prev) =>
      prev.map((f) => (f.preview.fileName === fileName ? { ...f, mapping } : f))
    );
  }, []);

  return { files, addFiles, removeFile, clear, setKind, setMapping };
}
