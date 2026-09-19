"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { provider } from "@/lib/xray/provider";
import type { CompanyRef, DatasetKind, ImportRequest } from "@/lib/xray/types";

type Step = "drop" | "map" | "pick" | "confirm";

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported: (companies: CompanyRef[]) => void;
}) {
  const [step, setStep] = useState<Step>("drop");
  const { files, addFiles, removeFile, clear, setKind, setMapping } = useCsvPreview();
  const companySel = useSelection<string>();
  const [importable, setImportable] = useState<CompanyRef[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step !== "pick") return;
    let cancelled = false;
    provider.listImportable?.().then((list) => {
      if (!cancelled) setImportable(list);
    });
    return () => {
      cancelled = true;
    };
  }, [step]);

  // Reset wizard when closed via key on Dialog — handled by remounting state when opening
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setStep("drop");
      clear();
      companySel.clear();
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
    try {
      const req: ImportRequest = {
        datasets: files
          .filter((f) => f.kind)
          .map((f) => ({
            kind: f.kind!,
            fileName: f.preview.fileName,
            mapping: f.mapping,
            selected_company_ids: companySel.values,
          })),
      };
      const added = await provider.importCompanies(req);
      onImported(added);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar empresas</DialogTitle>
          <DialogDescription>
            Arrastra CSVs del dataset (cabecera + muestra; no se parsea el fichero entero).
          </DialogDescription>
        </DialogHeader>

        {step === "drop" && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center"
            >
              <UploadIcon className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Suelta uno o varios CSV · se leen solo los primeros 64 KB
              </p>
              <label className="inline-flex cursor-pointer">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && void addFiles(e.target.files)}
                />
                <span className="inline-flex h-9 items-center rounded-4xl bg-secondary px-3 text-sm font-medium text-secondary-foreground">
                  Elegir ficheros
                </span>
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
                      {f.preview.headers.length} cols ·{" "}
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
              Selecciona empresas a incorporar al portfolio (mock catalog).
            </p>
            {importable.map((c) => (
              <label
                key={c.company_id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5"
              >
                <Checkbox
                  checked={companySel.isSelected(c.company_id)}
                  onCheckedChange={() => companySel.toggle(c.company_id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {c.company_id}
                  </div>
                </div>
              </label>
            ))}
            {importable.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quedan empresas importables.</p>
            ) : null}
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-3 text-sm">
            <p>
              {files.length} dataset(s) · {companySel.count} empresa(s) seleccionadas
            </p>
            <ul className="space-y-1 text-muted-foreground">
              {files.map((f) => (
                <li key={f.preview.fileName}>
                  {f.preview.fileName} → {f.kind}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-1">
            {(["drop", "map", "pick", "confirm"] as Step[]).map((s) => (
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
                onClick={() =>
                  setStep(
                    step === "map" ? "drop" : step === "pick" ? "map" : "pick"
                  )
                }
              >
                Atrás
              </Button>
            ) : null}
            {step === "drop" ? (
              <Button disabled={files.length === 0} onClick={() => setStep("map")}>
                Mapear columnas
              </Button>
            ) : null}
            {step === "map" ? (
              <Button disabled={!allMapped} onClick={() => setStep("pick")}>
                Elegir empresas
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
              <Button disabled={busy} onClick={() => void submit()}>
                {busy ? "Importando…" : "Confirmar importación"}
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
  mapping: import("@/lib/xray/types").ColumnMapping;
  traps: string[];
  onKind: (k: DatasetKind) => void;
  onMapping: (m: import("@/lib/xray/types").ColumnMapping) => void;
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
