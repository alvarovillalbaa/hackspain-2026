import { defineTool } from "eve/tools";
import { SubmitAlertsSchema } from "#lib/schemas";
import { watchDispatchUrl } from "#lib/watch-dispatch";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default defineTool({
  description:
    "Submit structured watch alerts for delivery to Slack and/or email. " +
    "Pass only alerts returned by evaluate_watch. Call exactly once per turn.",
  inputSchema: SubmitAlertsSchema,
  label: {
    start: ({ alerts, notify }) =>
      `Enviar ${alerts.length} alerta(s) → ${(notify ?? ["slack", "email"]).join("+")}`,
  },
  async execute(input) {
    const secret = process.env.WATCH_DISPATCH_SECRET;
    const url = watchDispatchUrl();

    // Without a secret, still acknowledge for chat — delivery is schedule-only.
    if (!secret) {
      return {
        ok: true as const,
        delivered: false,
        reason:
          "WATCH_DISPATCH_SECRET unset — alerts recorded for the parent reply only; configure secret + channels for Slack/email fan-out.",
        alerts: input.alerts,
        notify: input.notify,
      };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          alerts: input.alerts,
          notify: input.notify,
          copy: input.copy,
          company_id: input.company_id,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok) {
        return {
          ok: false as const,
          delivered: false,
          error: `dispatch HTTP ${res.status}`,
          body,
          alerts: input.alerts,
        };
      }
      return {
        ok: true as const,
        delivered: true,
        result: body,
        alerts: input.alerts,
        notify: input.notify,
      };
    } catch (err) {
      return {
        ok: false as const,
        delivered: false,
        error: errMsg(err),
        hint: `Could not reach ${url}. Set WATCH_DISPATCH_URL if eve is not on :2000.`,
        alerts: input.alerts,
      };
    }
  },
});
