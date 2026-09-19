import { slackChannel } from "eve/channels/slack";

/**
 * Slack channel for watcher alerts.
 * Missing SLACK_* env must not crash boot — dispatch skips Slack when unset.
 */
export default slackChannel({
  credentials: {
    botToken: () => process.env.SLACK_BOT_TOKEN ?? "",
    signingSecret: process.env.SLACK_SIGNING_SECRET ?? "",
  },
});
