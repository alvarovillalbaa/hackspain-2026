"use client";

import { useState } from "react";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
} from "lucide-react";
import { AppShell } from "@/components/xray/app-shell";
import { statusClass } from "@/components/embat/chrome";
import { embatDisplayClass } from "@/components/embat/font";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSlackStatus } from "@/hooks/xray/use-slack-status";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { status, loading, refresh } = useSlackStatus();
  const [webhook, setWebhook] = useState("");
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locked = status.source === "env";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!webhook.trim()) {
      setNotice(null);
      setError("Pega la URL del webhook de Slack para conectar.");
      return;
    }
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/xray/settings/slack", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ webhook_url: webhook }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        flush?: { sent?: number; error?: string };
      };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setWebhook("");
      const sent = body.flush?.sent;
      setNotice(
        body.flush?.error
          ? `Conectado, pero Slack falló: ${body.flush.error}`
          : sent
            ? `Conectado. Enviadas ${sent} alerta(s) al canal.`
            : "Conectado. No hay alertas nuevas (o ya se enviaron)."
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("clear");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/xray/settings/slack", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotice("Conector de Slack desconectado.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const noticeWarning = notice?.startsWith("Conectado, pero") ?? false;

  return (
    <AppShell crumbs={[{ label: "Ajustes" }]}>
      <div className="max-w-xl">
        <header className="mb-[30px] space-y-1">
          <h1
            className={cn(
              embatDisplayClass,
              "text-[20px] font-medium tracking-[-0.3px] text-black"
            )}
          >
            Ajustes
          </h1>
          <p className="text-[14px] tracking-[-0.14px] text-muted-foreground">
            Conexiones de este entorno de trabajo. Lo que configures aquí decide
            dónde llegan las alertas de X Ray.
          </p>
        </header>

        <section
          aria-labelledby="slack-settings-title"
          className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/40"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2
              id="slack-settings-title"
              className="text-[14px] font-medium tracking-[-0.14px] text-foreground"
            >
              Slack
            </h2>
            {loading ? null : (
              <Badge
                variant="outline"
                className={cn(
                  "rounded-xl",
                  status.connected
                    ? statusClass("positive")
                    : "border-border text-muted-foreground"
                )}
              >
                {status.connected ? "Conectado" : "Sin conectar"}
              </Badge>
            )}
          </div>
          <p className="mb-4 text-[13px] tracking-[-0.13px] text-muted-foreground">
            Webhook de entrada (Apps → Incoming Webhooks). Al guardar se mandan las
            alertas abiertas. Luego, al abrir X Ray y cada mañana laborable.
          </p>
          <form className="space-y-4" onSubmit={save} aria-busy={busy != null}>
            <Field>
              <FieldLabel
                htmlFor="slack-webhook"
                className="text-[13px] font-medium text-muted-foreground"
              >
                Webhook de entrada
              </FieldLabel>
              <Input
                id="slack-webhook"
                type="password"
                autoComplete="off"
                value={webhook}
                onChange={(e) => {
                  setWebhook(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="https://hooks.slack.com/services/…"
                disabled={locked || busy != null}
                aria-invalid={error ? true : undefined}
                aria-describedby="slack-webhook-help slack-webhook-status"
                className="rounded-xl border-border text-[13px] shadow-sm"
              />
              <FieldDescription
                id="slack-webhook-help"
                className="text-[12px] text-muted-foreground"
              >
                {locked
                  ? "Este entorno ya tiene SLACK_WEBHOOK_URL. El formulario no lo pisa."
                  : "Solo se aceptan URLs de hooks.slack.com. No se vuelve a mostrar."}
              </FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                size="sm"
                className="rounded-xl"
                disabled={locked || busy != null}
                aria-busy={busy === "save"}
              >
                {busy === "save" ? "Conectando…" : "Conectar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void disconnect()}
                disabled={locked || !status.connected || busy != null}
              >
                {busy === "clear" ? "Desconectando…" : "Desconectar"}
              </Button>
            </div>
            <div
              id="slack-webhook-status"
              aria-live="polite"
              className="min-h-5 text-[13px]"
            >
              {error ? (
                <p
                  role="alert"
                  className="flex items-start gap-1.5 text-destructive"
                >
                  <AlertCircleIcon
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden
                  />
                  <span>{error}</span>
                </p>
              ) : null}
              {notice ? (
                <p className="flex items-start gap-1.5 text-foreground">
                  {noticeWarning ? (
                    <AlertTriangleIcon
                      className="mt-0.5 size-3.5 shrink-0 text-warning"
                      aria-hidden
                    />
                  ) : (
                    <CheckCircle2Icon
                      className="mt-0.5 size-3.5 shrink-0 text-positive"
                      aria-hidden
                    />
                  )}
                  <span>{notice}</span>
                </p>
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
