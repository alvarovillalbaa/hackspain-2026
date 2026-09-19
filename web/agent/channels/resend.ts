import { defineChannel, GET } from "eve/channels";

/**
 * Email via Chat SDK + Resend is optional. The Eve bundler cannot resolve
 * `@resend/chat-sdk-adapter` (package boundary), and a failed rebuild left
 * marketplace subagents on a stale snapshot.
 *
 * Slack watcher still works. Email notify is skipped when this channel is a stub.
 */
export default defineChannel({
  routes: [
    GET("/internal/resend-disabled", async () =>
      Response.json({ error: "resend channel disabled" }, { status: 503 })
    ),
  ],
});
