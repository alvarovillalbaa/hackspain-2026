import { defineChannel, POST } from "eve/channels";
import { z } from "zod";
import { NotifyChannelSchema, WatchAlertSchema } from "#lib/schemas";
import {
  dispatchHits,
  watchChannelEnv,
} from "#lib/watch-dispatch";
import slack from "./slack";
import resend from "./resend";

const BodySchema = z.object({
  alerts: z.array(WatchAlertSchema).min(1),
  notify: z.array(NotifyChannelSchema).min(1).default(["slack", "email"]),
  copy: z.string().optional(),
  company_id: z.string().optional(),
});

/**
 * Internal fan-out for on-demand watcher submit_alerts.
 * Auth: Authorization: Bearer $WATCH_DISPATCH_SECRET
 */
export default defineChannel({
  routes: [
    POST("/internal/watch", async (request, { to, waitUntil }) => {
      const secret = process.env.WATCH_DISPATCH_SECRET;
      if (!secret) {
        return Response.json(
          { error: "WATCH_DISPATCH_SECRET unset" },
          { status: 503 }
        );
      }

      const auth = request.headers.get("authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (token !== secret) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }

      let json: unknown;
      try {
        json = await request.json();
      } catch {
        return Response.json({ error: "invalid JSON" }, { status: 400 });
      }

      const parsed = BodySchema.safeParse(json);
      if (!parsed.success) {
        return Response.json(
          { error: "invalid body", issues: parsed.error.issues },
          { status: 400 }
        );
      }

      const { alerts, notify, copy } = parsed.data;
      const run = dispatchHits({
        hits: alerts,
        notify,
        copy,
        to: to as never,
        appAuth: null,
        slackChannel: slack,
        resendChannel: resend,
        ...watchChannelEnv(),
      });

      waitUntil(run);
      return Response.json({ ok: true, ...(await run) });
    }),
  ],
});
