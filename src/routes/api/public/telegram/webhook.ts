import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const chatSchema = z.object({
  id: z.number().int(),
  type: z.string(),
});

const userSchema = z.object({
  id: z.number().int(),
  username: z.string().optional(),
  first_name: z.string().optional(),
});

const telegramUpdateSchema = z
  .object({
    update_id: z.number().int(),
    message: z
      .object({
        message_id: z.number().int().optional(),
        chat: chatSchema,
        from: userSchema.optional(),
        text: z.string().optional(),
      })
      .passthrough()
      .optional(),
    callback_query: z
      .object({
        id: z.string(),
        data: z.string().optional(),
        from: userSchema,
        message: z
          .object({ message_id: z.number().int().optional(), chat: chatSchema })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

function constantTimeEqual(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return difference === 0;
}

async function deriveTelegramWebhookSecret(apiKey: string): Promise<string> {
  const data = new TextEncoder().encode(`telegram-webhook:${apiKey}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const telegramApiKey = process.env["TELEGRAM_API_KEY"];
        if (!telegramApiKey) {
          return Response.json({ error: "Webhook is not configured." }, { status: 503 });
        }

        const expectedSecret = await deriveTelegramWebhookSecret(telegramApiKey);
        const actualSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!constantTimeEqual(expectedSecret, actualSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = await request.text();
        if (body.length > 64_000) return new Response("Payload too large", { status: 413 });

        let decoded: unknown;
        try {
          decoded = JSON.parse(body) as unknown;
        } catch {
          return new Response("Invalid update", { status: 400 });
        }

        const updateResult = telegramUpdateSchema.safeParse(decoded);
        if (!updateResult.success) return new Response("Invalid update", { status: 400 });
        const update = updateResult.data;

        if (!update.callback_query && !update.message) {
          return Response.json({ ok: true, ignored: true });
        }

        try {
          const { handleTelegramUpdate } = await import("@/lib/telegram-shop.server");
          await handleTelegramUpdate(update);
          return Response.json({ ok: true });
        } catch (error) {
          console.error("Telegram shop webhook failed:", error);
          return Response.json({ error: "Could not process this update." }, { status: 500 });
        }
      },
    },
  },
});