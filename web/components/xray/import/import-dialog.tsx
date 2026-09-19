"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { XIcon } from "lucide-react";
import {
  Dialog,
  DialogClose,
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
import {
  EmbatButton,
  EmbatIcon,
  embatSelectContentClass,
  embatSelectItemClass,
  embatSelectTriggerClass,
} from "@/components/embat/chrome";
import { embatDisplayClass, embatUiClass } from "@/components/embat/font";
import { cn } from "@/lib/utils";
import { useCsvPreview } from "@/hooks/xray/use-csv-preview";
import { useColumnMapping } from "@/hooks/xray/use-column-mapping";
import { useSelection } from "@/hooks/xray/use-selection";
import { DATASET_SPECS, getDatasetSpec, missingRequired } from "@/lib/xray/mapping";
import { parseCsvText } from "@/lib/xray/facts-builder";
import { provider } from "@/lib/xray/provider";
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

const STEP_LABEL: Record<Step, string> = {
  drop: "Archivos",
  map: "Columnas",
  pick: "Empresas",
  confirm: "Confirmar",
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

  const handleOpenChange = (o: boolean) => {
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
          `Los ficheros suman ${formatKb(totalBytes)} (límite 4,5 MB). Usa un slice más pequeño (p. ej. docs/data/raw/tests/single_company).`
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

  const steps = isUpdate
    ? (["drop", "map", "confirm"] as Step[])
    : (["drop", "map", "pick", "confirm"] as Step[]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-[#03122f]/50"
        className={cn(
          embatUiClass,
          "max-h-[85vh] gap-5 overflow-y-auto rounded-[8px] border border-[#dce0e6] bg-white p-5 text-[13px] text-black shadow-[0px_1px_2px_0px_rgba(13,19,30,0.1)] ring-0 sm:max-w-2xl"
        )}
      >
        <DialogClose
          render={
            <button
              type="button"
              aria-label="Cerrar"
              className="absolute top-4 right-4 inline-flex size-7 items-center justify-center rounded-[4px] text-[#666] outline-none hover:bg-[rgba(220,224,230,0.45)]"
            />
          }
        >
          <XIcon className="size-4" />
          <span className="sr-only">Cerrar</span>
        </DialogClose>

        <DialogHeader className="gap-1 pr-8">
          <DialogTitle
            className={`${embatDisplayClass} font-medium text-[20px] tracking-[-0.3px] text-black`}
          >
            {lockedTarget ? "Actualizar datos" : "Importar Compañía"}
          </DialogTitle>
          <DialogDescription className="text-[13px] font-medium tracking-[-0.13px] text-[#666]">
            {lockedTarget
              ? `Los CSV se asignan a ${targetCompanyId}. Se recalcula el score, las acciones y el marketplace, y se avisa al watcher.`
              : "Sube uno o varios CSV del dataset Embat. Empresas nuevas, o datos nuevos de una empresa que ya está en el listado."}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="rounded-[4px] border border-[#fbd3dc] bg-[#fef4f6] px-2.5 py-2 text-[13px] font-medium tracking-[-0.13px] text-[#e61847]">
            {error}
          </p>
        ) : null}

        {step === "drop" && (
          <div className="flex flex-col gap-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="flex flex-col items-center justify-center gap-2.5 rounded-[8px] border border-dashed border-[#dce0e6] bg-white px-6 py-10 text-center"
            >
              <EmbatIcon src="/embat/icon-import.svg" />
              <p className="text-[13px] font-medium tracking-[-0.13px] text-[#666]">
                Suelta uno o varios CSV · se sube el fichero entero (máx. 4,5 MB)
              </p>
              <label className="inline-flex cursor-pointer">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && void addFiles(e.target.files)}
                />
                <span className="inline-flex items-center rounded-[4px] border border-[#dce0e6] bg-white px-2.5 py-1 text-[13px] font-medium tracking-[-0.13px] text-[#666]">
                  Elegir ficheros
                </span>
              </label>
            </div>
            <ul className="flex flex-col gap-2">
              {files.map((f) => (
                <li
                  key={f.preview.fileName}
                  className="flex items-center justify-between gap-3 rounded-[4px] border border-[#dce0e6] bg-[rgba(220,224,230,0.2)] px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium tracking-[-0.13px] text-black">
                      {f.preview.fileName}
                    </div>
                    <div className="text-[13px] tracking-[-0.13px] text-[#666]">
                      {formatKb(f.file.size)} · {f.preview.headers.length} cols ·{" "}
                      {f.kind ? getDatasetSpec(f.kind).label : "tipo desconocido"}
                    </div>
                  </div>
                  <EmbatButton
                    variant="ghost"
                    aria-label={`Quitar ${f.preview.fileName}`}
                    onClick={() => removeFile(f.preview.fileName)}
                    className="size-7 shrink-0 px-0"
                  >
                    <XIcon className="size-4" />
                  </EmbatButton>
                </li>
              ))}
            </ul>
            {files.length > 0 ? (
              <p
                className={cn(
                  "text-[13px] font-medium tracking-[-0.13px]",
                  overLimit ? "text-[#e61847]" : "text-[#666]"
                )}
              >
                Total {formatKb(totalBytes)}
                {overLimit ? " — supera 4,5 MB" : " / 4,5 MB"}
              </p>
            ) : null}
            {!lockedTarget ? (
              <div className="flex flex-col gap-2.5 rounded-[8px] border border-[#dce0e6] p-3">
                <p className="text-[13px] font-medium tracking-[-0.13px] text-[#999]">
                  Destino
                </p>
                <div className="flex flex-wrap gap-2">
                  <EmbatButton
                    variant={mode === "create" ? "primary" : "secondary"}
                    onClick={() => setMode("create")}
                  >
                    Empresas nuevas
                  </EmbatButton>
                  <EmbatButton
                    variant={mode === "update" ? "primary" : "secondary"}
                    disabled={companies.length === 0}
                    onClick={() => setMode("update")}
                  >
                    Actualizar existente
                  </EmbatButton>
                </div>
                {mode === "update" ? (
                  <Select
                    value={pickedTarget || undefined}
                    onValueChange={(v) => {
                      if (v) setPickedTarget(v);
                    }}
                  >
                    <SelectTrigger className={embatSelectTriggerClass}>
                      <SelectValue placeholder="Elige la empresa del listado" />
                    </SelectTrigger>
                    <SelectContent className={embatSelectContentClass}>
                      {companies.map((c) => (
                        <SelectItem
                          key={c.company_id}
                          value={c.company_id}
                          className={embatSelectItemClass}
                        >
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
          <div className="flex flex-col gap-4">
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
          <div className="flex flex-col gap-2.5">
            <p className="text-[13px] font-medium tracking-[-0.13px] text-[#666]">
              Empresas detectadas en los CSV subidos. Selecciona cuáles incorporar.
            </p>
            {discovered.map((c) => (
              <label
                key={c.company_id}
                className="flex cursor-pointer items-center gap-2.5 rounded-[4px] border border-[#dce0e6] px-2.5 py-2"
              >
                <Checkbox
                  checked={companySel.isSelected(c.company_id)}
                  onCheckedChange={() => companySel.toggle(c.company_id)}
                  className="rounded-[4px] border-[#dce0e6] bg-white data-checked:border-[#11a8ff] data-checked:bg-[#11a8ff] data-checked:text-white dark:bg-white"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium tracking-[-0.13px] text-black">
                    {c.company_id}
                  </div>
                  <div className="text-[13px] tracking-[-0.13px] text-[#666]">
                    {c.group_id}
                  </div>
                </div>
              </label>
            ))}
            {discovered.length === 0 ? (
              <p className="text-[13px] font-medium tracking-[-0.13px] text-[#666]">
                No se detectaron company_id. ¿Incluye companies.csv o una columna
                company_id?
              </p>
            ) : null}
          </div>
        )}

        {step === "confirm" && (
          <div className="flex flex-col gap-2.5 text-[13px] tracking-[-0.13px] text-black">
            <p className="font-medium">
              {files.length} dataset(s) ·{" "}
              {isUpdate
                ? `actualizar ${effectiveTarget}`
                : `${companySel.count} empresa(s)`}{" "}
              · {formatKb(totalBytes)}
            </p>
            <ul className="flex flex-col gap-1 text-[#666]">
              {files.map((f) => (
                <li key={f.preview.fileName}>
                  {f.preview.fileName} → {f.kind}
                </li>
              ))}
            </ul>
            <p className="text-[#666]">
              {isUpdate
                ? "Se recalcula el Health Score, las acciones recomendadas y el marketplace. El watcher evalúa si hay que alertar."
                : "Se unificarán por empresa, se puntuarán contra la población de referencia y quedarán en Compañías. El watcher revisará alertas."}
            </p>
            {warnings.length > 0 ? (
              <ul className="flex flex-col gap-1 text-[#e61847]">
                {warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2.5 sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-[5px]">
            {steps.map((s) => (
              <span
                key={s}
                className={cn(
                  "inline-flex items-center rounded-[4px] border px-[5px] py-[2px] text-[13px] font-medium tracking-[-0.13px]",
                  s === step
                    ? "border-[#11a8ff] bg-[#11a8ff] text-white"
                    : "border-[#dce0e6] bg-white text-[#666]"
                )}
              >
                {STEP_LABEL[s]}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            {step !== "drop" ? (
              <EmbatButton
                variant="ghost"
                onClick={() => {
                  const prev = prevStep[step];
                  if (prev) setStep(prev);
                }}
              >
                Atrás
              </EmbatButton>
            ) : null}
            {step === "drop" ? (
              <EmbatButton
                disabled={
                  files.length === 0 ||
                  overLimit ||
                  (isUpdate && !effectiveTarget)
                }
                onClick={() => setStep("map")}
              >
                Mapear columnas
              </EmbatButton>
            ) : null}
            {step === "map" ? (
              <EmbatButton
                disabled={!allMapped}
                onClick={() => setStep(isUpdate ? "confirm" : "pick")}
              >
                {isUpdate ? "Revisar" : "Elegir empresas"}
              </EmbatButton>
            ) : null}
            {step === "pick" ? (
              <EmbatButton
                disabled={companySel.count === 0}
                onClick={() => setStep("confirm")}
              >
                Revisar
              </EmbatButton>
            ) : null}
            {step === "confirm" ? (
              <EmbatButton
                disabled={busy || overLimit}
                onClick={() => void submit()}
              >
                {busy ? "Puntuando…" : "Confirmar importación"}
              </EmbatButton>
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
    <div className="flex flex-col gap-2.5 rounded-[8px] border border-[#dce0e6] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-[13px] font-medium tracking-[-0.13px] text-black">
          {fileName}
        </div>
        <Select
          value={kind ?? undefined}
          onValueChange={(v) => {
            if (v) onKind(v as DatasetKind);
          }}
        >
          <SelectTrigger size="sm" className={cn(embatSelectTriggerClass, "w-auto")}>
            <SelectValue placeholder="Tipo de dataset" />
          </SelectTrigger>
          <SelectContent className={embatSelectContentClass}>
            {DATASET_SPECS.map((s) => (
              <SelectItem
                key={s.kind}
                value={s.kind}
                className={embatSelectItemClass}
              >
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {traps.length > 0 ? (
        <ul className="flex flex-col gap-1 text-[13px] tracking-[-0.13px] text-[#666]">
          {traps.map((t) => (
            <li key={t}>⚠ {t}</li>
          ))}
        </ul>
      ) : null}
      {missing.length > 0 ? (
        <p className="text-[13px] font-medium tracking-[-0.13px] text-[#e61847]">
          Faltan campos obligatorios: {missing.join(", ")}
        </p>
      ) : null}
      <div className="grid gap-2">
        {headers.map((h) => (
          <Field key={h} className="grid grid-cols-[1fr_1fr] items-center gap-2">
            <FieldLabel className="text-[13px] font-medium tracking-[-0.13px] text-[#666]">
              {h}
            </FieldLabel>
            <Select
              value={mapping.map[h] ?? "__none__"}
              onValueChange={(v) => {
                if (v == null) return;
                setField(h, v === "__none__" ? null : v);
              }}
            >
              <SelectTrigger size="sm" className={embatSelectTriggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={embatSelectContentClass}>
                <SelectItem value="__none__" className={embatSelectItemClass}>
                  — ignorar —
                </SelectItem>
                {fields.map((f) => (
                  <SelectItem
                    key={f.key}
                    value={f.key}
                    className={embatSelectItemClass}
                  >
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
