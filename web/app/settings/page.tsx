"use client";

import { useState } from "react";
import { AppShell } from "@/components/xray/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSlackStatus } from "@/hooks/xray/use-slack-status";

export default function SettingsPage() {
  const { status, loading, refresh } = useSlackStatus();
  const [webhook, setWebhook] = useState("");
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locked = status.source === "env";

  async function save(e: React.FormEvent) {
    e.preventDefault();
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

  return (
    <AppShell crumbs={[{ label: "Ajustes" }]}>
      <Card className="max-w-xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Slack</CardTitle>
            {loading ? null : status.connected ? (
              <Badge>Conectado</Badge>
            ) : (
              <Badge variant="outline">Sin conectar</Badge>
            )}
          </div>
          <CardDescription>
            Incoming Webhook (Apps → Incoming Webhooks). Al guardar se mandan
            las alertas abiertas. Luego, al abrir X Ray y cada mañana laborable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={save}>
            <Field>
              <FieldLabel htmlFor="slack-webhook">Incoming Webhook</FieldLabel>
              <Input
                id="slack-webhook"
                type="password"
                autoComplete="off"
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/…"
                disabled={locked || busy != null}
                required
              />
              <FieldDescription>
                {locked
                  ? "Este entorno ya tiene SLACK_WEBHOOK_URL. El formulario no lo pisa."
                  : "Solo se aceptan URLs de hooks.slack.com. No se vuelve a mostrar."}
              </FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={locked || busy != null || !webhook}>
                {busy === "save" ? "Conectando…" : "Conectar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void disconnect()}
                disabled={locked || !status.connected || busy != null}
              >
                {busy === "clear" ? "…" : "Desconectar"}
              </Button>
            </div>
            <div aria-live="polite" className="min-h-5 text-sm">
              {error ? <p className="text-destructive">{error}</p> : null}
              {notice ? <p className="text-muted-foreground">{notice}</p> : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}
