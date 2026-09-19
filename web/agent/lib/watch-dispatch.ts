/**
 * Shared fan-out for watcher hits → Slack / Resend channels.
 * Used by the portfolio-watch schedule and the POST /internal/watch channel.
 */
import type { WatchAlert } from "./watch-rules";
import { filterUnsentAlerts, markAlertSent } from "./alert-log";

export type NotifyChannel = "slack" | "email";

export type DispatchTo = (
  channel: unknown,
  target: Record<string, unknown>
) => { send: (message: string, opts: { auth: unknown }) => Promise<unknown> };

export interface DispatchHitsArgs {
  hits: WatchAlert[];
  notify: NotifyChannel[];
  /** Pre-built Spanish body; if omitted, a terse structured summary is used. */
  copy?: string;
  to: DispatchTo;
  appAuth: unknown;
  slackChannel: unknown | null;
  resendChannel: unknown | null;
  slackChannelId: string | null;
  emailTo: string | null;
}

export interface DispatchHitsResult {
  sent: number;
  skipped_dedupe: number;
  channels: NotifyChannel[];
  errors: string[];
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function formatWatchPrompt(
  hits: WatchAlert[],
  copy?: string
): string {
  const body =
    copy ??
    hits
      .map(
        (h) =>
          `• ${h.company_id} [${h.severity}/${h.rule_id}] ${h.message}`
      )
      .join("\n");

  return [
    "X Ray Watcher — alerta de cartera.",
    "Entrega este aviso al canal. No invoques quantity, offering ni match.",
    "Cifras ya validadas por evaluate_watch; no recalcules.",
    "",
    body,
    "",
    "JSON:",
    JSON.stringify({ alerts: hits }, null, 2),
  ].join("\n");
}

export function slackConfigured(): boolean {
  return Boolean(
    process.env.SLACK_BOT_TOKEN &&
      process.env.SLACK_SIGNING_SECRET &&
      process.env.SLACK_ALERT_CHANNEL_ID
  );
}

export function emailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.ALERT_EMAIL_FROM &&
      process.env.ALERT_EMAIL_TO
  );
}

/** Env targets shared by schedule + internal watch channel. */
export function watchChannelEnv(): {
  slackChannelId: string | null;
  emailTo: string | null;
} {
  return {
    slackChannelId: process.env.SLACK_ALERT_CHANNEL_ID ?? null,
    emailTo: process.env.ALERT_EMAIL_TO ?? null,
  };
}

async function trySend(
  channel: NotifyChannel,
  ready: boolean,
  send: () => Promise<unknown>,
  used: NotifyChannel[],
  errors: string[]
): Promise<void> {
  if (!ready) {
    errors.push(`${channel}: not configured (missing env or channel)`);
    return;
  }
  try {
    await send();
    used.push(channel);
  } catch (err) {
    errors.push(`${channel}: ${errMsg(err)}`);
  }
}

export async function dispatchHits(
  args: DispatchHitsArgs
): Promise<DispatchHitsResult> {
  const unsent = await filterUnsentAlerts(args.hits);
  const skipped_dedupe = args.hits.length - unsent.length;
  const errors: string[] = [];
  const used: NotifyChannel[] = [];

  if (unsent.length === 0) {
    return { sent: 0, skipped_dedupe, channels: [], errors };
  }

  const message = formatWatchPrompt(unsent, args.copy);
  const wantSlack = args.notify.includes("slack");
  const wantEmail = args.notify.includes("email");

  if (wantSlack) {
    await trySend(
      "slack",
      Boolean(args.slackChannel && args.slackChannelId && slackConfigured()),
      () =>
        args
          .to(args.slackChannel, { channelId: args.slackChannelId })
          .send(message, { auth: args.appAuth }),
      used,
      errors
    );
  }

  if (wantEmail) {
    await trySend(
      "email",
      Boolean(args.resendChannel && args.emailTo && emailConfigured()),
      () =>
        args
          .to(args.resendChannel, {
            adapterName: "resend",
            threadId: `resend:${args.emailTo}`,
          })
          .send(message, { auth: args.appAuth }),
      used,
      errors
    );
  }

  if (used.length > 0) {
    for (const a of unsent) {
      await markAlertSent(a, used);
    }
  }

  return {
    sent: used.length > 0 ? unsent.length : 0,
    skipped_dedupe,
    channels: used,
    errors,
  };
}

export function watchDispatchUrl(): string {
  if (process.env.WATCH_DISPATCH_URL) return process.env.WATCH_DISPATCH_URL;
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/internal/watch`;
  }
  // eve dev default port; override with WATCH_DISPATCH_URL under withEve if needed
  return "http://127.0.0.1:2000/internal/watch";
}
