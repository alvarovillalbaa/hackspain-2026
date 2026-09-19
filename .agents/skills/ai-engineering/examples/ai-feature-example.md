# AI Feature Example: Streaming Chat in a Next.js App

A worked example of adding a streaming chat endpoint and UI to a Next.js (App
Router) application. Shows the shape of a well-scoped AI feature: server route,
streaming transport, and a minimal client.

## Goal

Add `/chat`: a page where a user sends a message and sees the assistant's reply
stream in token by token, backed by the Anthropic API.

## 1. Server route (streams tokens)

```ts
// app/api/chat/route.ts
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages,
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
```

## 2. Client (reads the stream)

```tsx
// app/chat/page.tsx
"use client";
import { useState } from "react";

export default function Chat() {
  const [input, setInput] = useState("");
  const [reply, setReply] = useState("");

  async function send() {
    setReply("");
    const res = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: input }] }),
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      setReply((prev) => prev + decoder.decode(value));
    }
  }

  return (
    <main>
      <textarea value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={send}>Send</button>
      <pre aria-live="polite">{reply}</pre>
    </main>
  );
}
```

## 3. Verify

```bash
# Confirm the key is present before running.
bash ../scripts/check_api_keys.sh ANTHROPIC_API_KEY

# Estimate the per-call cost of a representative prompt.
python ../scripts/estimate_tokens.py sample-prompt.txt --model claude-sonnet-4-6 --output-tokens 512

npm run dev
# Visit /chat, send a message, confirm tokens stream in.
```

## Design notes

- **Streaming over polling:** users see progress immediately; lower perceived latency.
- **Server holds the key:** the API key never reaches the browser.
- **`aria-live="polite"`:** the streamed reply is announced to screen readers.
- **Bounded `max_tokens`:** caps cost and runaway generations.
- **Out of scope here:** auth, rate limiting, history persistence, retries —
  add them as separate stories rather than bundling into the first cut.
