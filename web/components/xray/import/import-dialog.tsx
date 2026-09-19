"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UploadIcon, XIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useCsvPreview } from "@/hooks/xray/use-csv-preview";
import { useColumnMapping } from "@/hooks/xray/use-column-mapping";
import { useSelection } from "@/hooks/xray/use-selection";
import { DATASET_SPECS, getDatasetSpec, missingRequired } from "@/lib/xray/mapping";
import { parseCsvText } from "@/lib/xray/facts-builder";
import { provider } from "@/lib/xray/provider";
import { shouldKeepImportDialogOpen } from "@/lib/xray/import-dialog-dismiss";
import type { CompanyRef, ColumnMapping, DatasetKind, ImportRequest } from "@/lib/xray/types";

type Step = "drop" | "map" | "pick" | "confirm";

const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;

const PREV_STEP_CREATE: Record<Step, Step | null> = {
  drop: null,
  map: "drop",
  pick: "map",
  confirm: "pick",
};

const PREV_STEP_UPDATE: Record<Step, Step | null> = {
  drop: null,
  map: "drop",
  pick: "map",
  confirm: "map",
};

function formatKb(n: number): string {
  return `${Math.round(n / 1024)} KB`;
}

/** Resolve a canonical field from mapped headers, falling back to the canonical key. */
function mappedField(
  row: Record<string, string>,
  map: Record<string, string | null>,
  field: string
): string {
  let mapped = "";
  for (const [src, dst] of Object.entries(map)) {
    if (dst === field) mapped = row[src] ?? "";
  }
  return mapped || (row[field] ?? "");
}

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
  targetCompanyId,
  companies = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported: (companies: CompanyRef[]) => void;
  /** When set (company page), the upload remaps onto this company. */
  targetCompanyId?: string;
  companies?: CompanyRef[];
}) {
  const [step, setStep] = useState<Step>("drop");
  const { files, addFiles, removeFile, clear, setKind, setMapping } = useCsvPreview();
  const companySel = useSelection<string>();
  const [discovered, setDiscovered] = useState<CompanyRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [mode, setMode] = useState<"create" | "update">(
    targetCompanyId ? "update" : "create"
  );
  const [pickedTarget, setPickedTarget] = useState<string>(targetCompanyId ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickingFiles = useRef(false);

  useEffect(() => {
    const onFocus = () => {
      window.setTimeout(() => {
        pickingFiles.current = false;
      }, 400);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const lockedTarget = Boolean(targetCompanyId);
  const isUpdate = lockedTarget || mode === "update";
  const prevStep = isUpdate ? PREV_STEP_UPDATE : PREV_STEP_CREATE;
  const effectiveTarget = targetCompanyId ?? (isUpdate ? pickedTarget : "");

  const totalBytes = useMemo(
    () => files.reduce((s, f) => s + f.file.size, 0),
    [files]
  );
  const overLimit = totalBytes > MAX_UPLOAD_BYTES;

  // Discover company_ids from uploaded companies.csv (or any file with company_id)
  useEffect(() => {
    if (step !== "pick") return;
    let cancelled = false;
    (async () => {
      const companiesFile = files.find((f) => f.kind === "companies");
      const ids = new Set<string>();
      const groupOf = new Map<string, string>();

      if (companiesFile) {
        const text = await companiesFile.file.text();
        const rows = parseCsvText(text);
        const map = companiesFile.mapping.map;
        for (const row of rows) {
          const cid = mappedField(row, map, "company_id");
          const gid = mappedField(row, map, "group_id");
          if (cid) {
            ids.add(cid);
            if (gid) groupOf.set(cid, gid);
          }
        }
      } else {
        for (const f of files) {
          if (!f.kind) continue;
          const text = await f.file.slice(0, 256 * 1024).text();
          const rows = parseCsvText(text);
          for (const row of rows) {
            const cid = mappedField(row, f.mapping.map, "company_id");
            if (cid) ids.add(cid);
          }
        }
      }

      if (cancelled) return;
      const list: CompanyRef[] = [...ids].sort().map((id) => ({
        company_id: id,
        group_id: groupOf.get(id) ?? "GROUP_IMPORT",
        name: id,
        country: null,
        currency: "EUR",
        n_companies_in_group: 1,
        imported: true,
      }));
      setDiscovered(list);
      companySel.setAll(list.map((c) => c.company_id));
    })().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when entering pick
  }, [step, files]);

  useEffect(() => {
    if (!open) return;
    setMode(targetCompanyId ? "update" : "create");
    setPickedTarget(targetCompanyId ?? "");
  }, [open, targetCompanyId]);

  const handleOpenChange = (
    o: boolean,
    details?: { reason?: string; cancel?: () => void }
  ) => {
    if (
      shouldKeepImportDialogOpen(o, details?.reason, pickingFiles.current)
    ) {
      details?.cancel?.();
      return;
    }
    if (!o) {
      setStep("drop");
      clear();
      companySel.clear();
      setDiscovered([]);
      setError(null);
      setWarnings([]);
      setMode(targetCompanyId ? "update" : "create");
      setPickedTarget(targetCompanyId ?? "");
    }
    onOpenChange(o);
  };

  const onFilesPicked = (list: FileList | null) => {
    pickingFiles.current = false;
    if (list && list.length > 0) void addFiles(list);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const allMapped =
    files.length > 0 &&
    files.every((f) => f.kind && missingRequired(f.mapping, f.kind).length === 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (overLimit) {
        throw new Error(
          `Los ficheros suman ${formatKb(totalBytes)} (límite 4,5 MB). Usa un pack más pequeño (p. ej. docs/data/raw/new/update).`
        );
      }
      const req: ImportRequest = {
        datasets: files
          .filter((f) => f.kind)
          .map((f) => ({
            kind: f.kind!,
            fileName: f.preview.fileName,
            file: f.file,
            mapping: f.mapping,
            selected_company_ids: isUpdate ? [] : companySel.values,
          })),
        ...(effectiveTarget ? { target_company_id: effectiveTarget } : {}),
      };
      const result = await provider.importCompanies(req);
      setWarnings(result.warnings ?? result.summary?.warnings ?? []);
      onImported(result.companies);
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} disablePointerDismissal>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {lockedTarget ? "Actualizar datos" : "Importar empresas"}
          </DialogTitle>
          <DialogDescription>
            {lockedTarget
              ? `Los CSV se asignan a ${targetCompanyId}. Se recalcula el score, las acciones y el marketplace, y se avisa al watcher.`
              : "Sube uno o varios CSV del dataset Embat. Empresas nuevas, o datos nuevos de una empresa que ya está en el portfolio."}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {step === "drop" && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center"
            >
              <UploadIcon className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Suelta uno o varios CSV · se sube el fichero entero (máx. 4,5 MB)
              </p>
              <label
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  "relative cursor-pointer overflow-hidden"
                )}
                onPointerDown={() => {
                  pickingFiles.current = true;
                }}
              >
                Elegir ficheros
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => onFilesPicked(e.target.files)}
                  onClick={(e) => e.stopPropagation()}
                />
              </label>
            </div>
            <ul className="space-y-2">
              {files.map((f) => (
                <li
                  key={f.preview.fileName}
                  className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{f.preview.fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatKb(f.file.size)} · {f.preview.headers.length} cols ·{" "}
                      {f.kind ? getDatasetSpec(f.kind).label : "tipo desconocido"}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeFile(f.preview.fileName)}
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
            {files.length > 0 ? (
              <p
                className={`text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"}`}
              >
                Total {formatKb(totalBytes)}
                {overLimit ? " — supera 4,5 MB" : " / 4,5 MB"}
              </p>
            ) : null}
            {!lockedTarget ? (
              <div className="space-y-3 rounded-2xl border border-border p-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Destino
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "create" ? "default" : "outline"}
                    onClick={() => setMode("create")}
                  >
                    Empresas nuevas
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "update" ? "default" : "outline"}
                    disabled={companies.length === 0}
                    onClick={() => setMode("update")}
                  >
                    Actualizar existente
                  </Button>
                </div>
                {mode === "update" ? (
                  <Select
                    value={pickedTarget || undefined}
                    onValueChange={(v) => {
                      if (v) setPickedTarget(v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Elige la empresa del portfolio" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.company_id} value={c.company_id}>
                          {c.name} · {c.company_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {step === "map" && (
          <div className="space-y-6">
            {files.map((f) => (
              <MappingBlock
                key={f.preview.fileName}
                fileName={f.preview.fileName}
                headers={f.preview.headers}
                kind={f.kind}
                mapping={f.mapping}
                traps={f.kind ? getDatasetSpec(f.kind).traps : []}
                onKind={(k) => setKind(f.preview.fileName, k)}
                onMapping={(m) => setMapping(f.preview.fileName, m)}
              />
            ))}
          </div>
        )}

        {step === "pick" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Empresas detectadas en los CSV subidos. Selecciona cuáles incorporar.
            </p>
            {discovered.map((c) => (
              <label
                key={c.company_id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5"
              >
                <Checkbox
                  checked={companySel.isSelected(c.company_id)}
                  onCheckedChange={() => companySel.toggle(c.company_id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-medium">{c.company_id}</div>
                  <div className="text-xs text-muted-foreground">{c.group_id}</div>
                </div>
              </label>
            ))}
            {discovered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No se detectaron company_id. ¿Incluye companies.csv o una columna
                company_id?
              </p>
            ) : null}
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-3 text-sm">
            <p>
              {files.length} dataset(s) ·{" "}
              {isUpdate
                ? `actualizar ${effectiveTarget}`
                : `${companySel.count} empresa(s)`}{" "}
              · {formatKb(totalBytes)}
            </p>
            <ul className="space-y-1 text-muted-foreground">
              {files.map((f) => (
                <li key={f.preview.fileName}>
                  {f.preview.fileName} → {f.kind}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {isUpdate
                ? "Se recalcula el Health Score, las acciones recomendadas y el marketplace. El watcher evalúa si hay que alertar."
                : "Se unificarán por empresa, se puntuarán contra la población de referencia y quedarán en el portfolio. El watcher revisará alertas."}
            </p>
            {warnings.length > 0 ? (
              <ul className="space-y-1 text-xs text-amber-600">
                {warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-1">
            {(isUpdate
              ? (["drop", "map", "confirm"] as Step[])
              : (["drop", "map", "pick", "confirm"] as Step[])
            ).map((s) => (
              <Badge
                key={s}
                variant={s === step ? "default" : "outline"}
                className="capitalize"
              >
                {s}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            {step !== "drop" ? (
              <Button
                variant="ghost"
                onClick={() => {
                  const prev = prevStep[step];
                  if (prev) setStep(prev);
                }}
              >
                Atrás
              </Button>
            ) : null}
            {step === "drop" ? (
              <Button
                disabled={
                  files.length === 0 ||
                  overLimit ||
                  (isUpdate && !effectiveTarget)
                }
                onClick={() => setStep("map")}
              >
                Mapear columnas
              </Button>
            ) : null}
            {step === "map" ? (
              <Button
                disabled={!allMapped}
                onClick={() => setStep(isUpdate ? "confirm" : "pick")}
              >
                {isUpdate ? "Revisar" : "Elegir empresas"}
              </Button>
            ) : null}
            {step === "pick" ? (
              <Button
                disabled={companySel.count === 0}
                onClick={() => setStep("confirm")}
              >
                Revisar
              </Button>
            ) : null}
            {step === "confirm" ? (
              <Button disabled={busy || overLimit} onClick={() => void submit()}>
                {busy ? "Puntuando…" : "Confirmar importación"}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MappingBlock({
  fileName,
  headers,
  kind,
  mapping,
  traps,
  onKind,
  onMapping,
}: {
  fileName: string;
  headers: string[];
  kind: DatasetKind | null;
  mapping: ColumnMapping;
  traps: string[];
  onKind: (k: DatasetKind) => void;
  onMapping: (m: ColumnMapping) => void;
}) {
  const { missing, setField } = useColumnMapping(mapping, kind, onMapping);
  const fields = kind ? getDatasetSpec(kind).fields : [];

  return (
    <div className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">{fileName}</div>
        <Select
          value={kind ?? undefined}
          onValueChange={(v) => {
            if (v) onKind(v as DatasetKind);
          }}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Tipo de dataset" />
          </SelectTrigger>
          <SelectContent>
            {DATASET_SPECS.map((s) => (
              <SelectItem key={s.kind} value={s.kind}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {traps.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {traps.map((t) => (
            <li key={t}>⚠ {t}</li>
          ))}
        </ul>
      ) : null}
      {missing.length > 0 ? (
        <p className="text-xs text-destructive">
          Faltan campos obligatorios: {missing.join(", ")}
        </p>
      ) : null}
      <div className="grid gap-2">
        {headers.map((h) => (
          <Field key={h} className="grid grid-cols-[1fr_1fr] items-center gap-2">
            <FieldLabel className="font-mono text-xs">{h}</FieldLabel>
            <Select
              value={mapping.map[h] ?? "__none__"}
              onValueChange={(v) => {
                if (v == null) return;
                setField(h, v === "__none__" ? null : v);
              }}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— ignorar —</SelectItem>
                {fields.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.key}
                    {f.required ? " *" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ))}
      </div>
    </div>
  );
}
