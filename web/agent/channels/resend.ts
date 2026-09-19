import { createMemoryState } from "@chat-adapter/state-memory";
import { createResendAdapter } from "@resend/chat-sdk-adapter";
import type { Message, Thread } from "chat";
import { chatSdkChannel } from "eve/channels/chat-sdk";

/**
 * Email via Eve Chat SDK + Resend (no first-class email channel).
 * Target: `{ adapterName: "resend", threadId: "resend:" + ALERT_EMAIL_TO }`.
 * Missing RESEND_API_KEY must not crash boot — dispatch skips email when unset.
 */
export const { bot, channel, send } = chatSdkChannel({
  userName: "X Ray Watcher",
  adapters: {
    resend: createResendAdapter({
      fromAddress:
        process.env.ALERT_EMAIL_FROM?.trim() || "watcher@localhost.invalid",
      fromName: "X Ray Watcher",
      apiKey: process.env.RESEND_API_KEY,
    }),
  },
  state: createMemoryState(),
  streaming: false,
});

bot.onNewMention(async (thread: Thread, message: Message) => {
  await thread.subscribe();
  await send(message.text, { thread });
});

bot.onSubscribedMessage(async (thread: Thread, message: Message) => {
  await send(message.text, { thread });
});

export default channel;
