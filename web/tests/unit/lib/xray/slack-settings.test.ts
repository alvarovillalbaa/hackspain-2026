import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  clearSlackWebhook,
  clearSlackWebhookForTests,
  resolveSlackWebhook,
  setSlackWebhook,
  slackStatus,
} from "@/lib/xray/slack-settings";

describe("slack-settings", () => {
  const prev = process.env.SLACK_WEBHOOK_URL;

  beforeEach(() => {
    clearSlackWebhookForTests();
    delete process.env.SLACK_WEBHOOK_URL;
  });

  afterEach(() => {
    clearSlackWebhookForTests();
    if (prev === undefined) delete process.env.SLACK_WEBHOOK_URL;
    else process.env.SLACK_WEBHOOK_URL = prev;
  });

  it("is disconnected by default", () => {
    expect(slackStatus()).toEqual({ connected: false, source: null });
    expect(resolveSlackWebhook()).toBeNull();
  });

  it("prefers env over settings memory", () => {
    process.env.SLACK_WEBHOOK_URL =
      "https://hooks.slack.com/services/T00/B00/XXX";
    expect(resolveSlackWebhook()?.source).toBe("env");
    setSlackWebhook("https://hooks.slack.com/services/T00/B00/YYY");
    expect(resolveSlackWebhook()?.source).toBe("env");
  });

  it("stores a settings webhook when env is empty", () => {
    const status = setSlackWebhook(
      "https://hooks.slack.com/services/T00/B00/ZZZ"
    );
    expect(status).toEqual({ connected: true, source: "settings" });
    expect(clearSlackWebhook()).toEqual({ connected: false, source: null });
  });

  it("rejects non-webhook URLs", () => {
    expect(() => setSlackWebhook("https://example.com")).toThrow(/Slack/);
  });
});
