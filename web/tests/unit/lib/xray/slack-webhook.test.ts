import { describe, expect, it } from "vitest";
import { isSlackWebhookUrl } from "@/lib/xray/slack-webhook";
import { formatSlackQueue } from "@/lib/xray/watch-queue";
import {
  clearSlackWebhookForTests,
  setSlackWebhook,
  slackStatus,
} from "@/lib/xray/slack-settings";

describe("isSlackWebhookUrl", () => {
  it("accepts a hooks.slack.com services URL", () => {
    expect(
      isSlackWebhookUrl(
        "https://hooks.slack.com/services/example/example/example"
      )
    ).toBe(true);
  });

  it("rejects other hosts and http", () => {
    expect(isSlackWebhookUrl("https://example.com/services/T/B/x")).toBe(false);
    expect(
      isSlackWebhookUrl("http://hooks.slack.com/services/example/example/example")
    ).toBe(false);
    expect(isSlackWebhookUrl("not a url")).toBe(false);
  });
});

describe("formatSlackQueue", () => {
  it("renders header and one compact line per company", () => {
    const text = formatSlackQueue([
      {
        company_id: "COMP_0001",
        name: "Northbrook",
        score: 20,
        severity: "critical",
        rules: ["dscr_floor"],
        message: "DSCR bajo",
      },
    ]);
    expect(text).toContain("*X Ray — vigilancia* — 1 empresa en cola");
    expect(text).toContain("*Northbrook*");
    expect(text).toContain("`COMP_0001`");
    expect(text).toContain("DSCR < 1,2");
  });
});

describe("slack settings store", () => {
  it("rejects a non-webhook and keeps disconnected", () => {
    clearSlackWebhookForTests();
    expect(() => setSlackWebhook("https://evil.example/hook")).toThrow(
      /Incoming Webhook/
    );
    expect(slackStatus()).toEqual({ connected: false, source: null });
  });
});
