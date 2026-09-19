/** Incoming Webhook only — never a generic URL. */
export function isSlackWebhookUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return (
      u.protocol === "https:" &&
      u.hostname === "hooks.slack.com" &&
      u.pathname.startsWith("/services/") &&
      u.pathname.split("/").filter(Boolean).length >= 3
    );
  } catch {
    return false;
  }
}

export async function postSlackWebhook(
  url: string,
  text: string
): Promise<void> {
  if (!isSlackWebhookUrl(url)) {
    throw new Error("webhook de Slack inválido");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    redirect: "error",
  });
  if (!res.ok) {
    throw new Error(`Slack HTTP ${res.status}`);
  }
}
