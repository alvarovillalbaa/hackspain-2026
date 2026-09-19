import { isSlackWebhookUrl } from "./slack-webhook";
import type { SlackSource, SlackStatus } from "./slack-status";

export type { SlackSource, SlackStatus } from "./slack-status";

/** Process-local webhook from the settings page. Not written to public Blob. */
let memoryWebhook: string | null = null;

function envWebhook(): string | null {
  const raw = process.env.SLACK_WEBHOOK_URL?.trim() ?? "";
  return isSlackWebhookUrl(raw) ? raw : null;
}

export function resolveSlackWebhook(): {
  url: string;
  source: SlackSource;
} | null {
  const fromEnv = envWebhook();
  if (fromEnv) return { url: fromEnv, source: "env" };
  if (memoryWebhook) return { url: memoryWebhook, source: "settings" };
  return null;
}

export function slackStatus(): SlackStatus {
  const hit = resolveSlackWebhook();
  return { connected: hit != null, source: hit?.source ?? null };
}

export function setSlackWebhook(url: string): SlackStatus {
  const trimmed = url.trim();
  if (!isSlackWebhookUrl(trimmed)) {
    throw new Error(
      "La URL tiene que ser un Incoming Webhook de Slack (https://hooks.slack.com/services/…)."
    );
  }
  memoryWebhook = trimmed;
  return slackStatus();
}

export function clearSlackWebhook(): SlackStatus {
  memoryWebhook = null;
  return slackStatus();
}

export function clearSlackWebhookForTests(): void {
  memoryWebhook = null;
}
