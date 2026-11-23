import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getOrderableProvider, proxyProviders } from "@/lib/proxy-providers";

const chatSchema = z.object({
  id: z.number().int(),
  type: z.string(),
});

const telegramUpdateSchema = z
  .object({
    update_id: z.number().int(),
    message: z
      .object({
        chat: chatSchema,
        from: z.object({ id: z.number().int() }).optional(),
        text: z.string().optional(),
      })
      .passthrough()
      .optional(),
    callback_query: z
      .object({
        id: z.string(),
        data: z.string().optional(),
        from: z.object({ id: z.number().int() }),
        message: z.object({ chat: chatSchema }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const providerKeyboard = {
  inline_keyboard: proxyProviders
    .filter((provider) => provider.state === "connected")
    .map((provider) => [{ text: provider.name, callback_data: `provider:${provider.id}` }]),
};

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

async function callTelegram(method: string, payload: Record<string, unknown>): Promise<void> {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const telegramApiKey = process.env["TELEGRAM_API_KEY"];
  if (!lovableApiKey || !telegramApiKey) {
    throw new Error("Telegram connector credentials are not configured.");
  }

  const response = await fetch(`https://connector-gateway.lovable.dev/telegram/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": telegramApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const responseBody = await response.text();
  if (!response.ok) {
    console.error(`Telegram request failed [${response.status}]: ${responseBody}`);
    throw new Error(`Telegram request failed [${response.status}]: ${responseBody}`);
  }

  let result: unknown;
  try {
    result = JSON.parse(responseBody) as unknown;
  } catch {
    throw new Error("Telegram returned an unreadable response.");
  }

  if (typeof result === "object" && result !== null && "ok" in result && result.ok === false) {
    const description = "description" in result && typeof result.description === "string"
      ? result.description
      : "Unknown Telegram error";
    const errorCode = "error_code" in result && typeof result.error_code === "number"
      ? result.error_code
      : "unknown";
    console.error(`Telegram request failed [${errorCode}]: ${description}`);
    throw new Error(`Telegram request failed [${errorCode}]: ${description}`);
  }
}

async function openShop(chatId: number): Promise<void> {
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text: [
      "Welcome to luxpoxy.",
      "Choose a connected supplier to request proxy availability.",
      "Fresh and Smart are unavailable until secure HTTPS API access is provided.",
      "Requests are reviewed manually; this bot does not collect payment or place purchases.",
    ].join("\n\n"),
    reply_markup: providerKeyboard,
  });
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

        try {
          if (update.callback_query) {
            const callback = update.callback_query;
            await callTelegram("answerCallbackQuery", { callback_query_id: callback.id });

            const chat = callback.message?.chat;
            if (!chat || chat.type !== "private") return Response.json({ ok: true, ignored: true });

            const providerValue = callback.data?.startsWith("provider:")
              ? callback.data.slice("provider:".length)
              : "";
            const provider = getOrderableProvider(providerValue);
            if (!provider) {
              await openShop(chat.id);
              return Response.json({ ok: true });
            }

            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { error } = await supabaseAdmin.from("telegram_bot_sessions").upsert({
              telegram_chat_id: chat.id,
              telegram_user_id: callback.from.id,
              provider,
              state: "awaiting_details",
              updated_at: new Date().toISOString(),
            });
            if (error) throw error;

            const providerName = proxyProviders.find((item) => item.id === provider)?.name ?? provider;
            await callTelegram("sendMessage", {
              chat_id: chat.id,
              text: `Send the location, quantity, and term you need from ${providerName}. Do not send passwords or payment details.`,
            });
            return Response.json({ ok: true });
          }

          const message = update.message;
          if (!message || message.chat.type !== "private" || !message.from) {
            return Response.json({ ok: true, ignored: true });
          }

          const text = message.text?.trim() ?? "";
          if (/^\/(?:start|catalog|help)(?:@\w+)?(?:\s|$)/i.test(text)) {
            await openShop(message.chat.id);
            return Response.json({ ok: true });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          if (/^\/cancel(?:@\w+)?(?:\s|$)/i.test(text)) {
            const { error } = await supabaseAdmin
              .from("telegram_bot_sessions")
              .delete()
              .eq("telegram_chat_id", message.chat.id);
            if (error) throw error;
            await callTelegram("sendMessage", {
              chat_id: message.chat.id,
              text: "Request cancelled. Send /catalog to choose a supplier.",
            });
            return Response.json({ ok: true });
          }

          const { data: session, error: sessionError } = await supabaseAdmin
            .from("telegram_bot_sessions")
            .select("provider")
            .eq("telegram_chat_id", message.chat.id)
            .maybeSingle();
          if (sessionError) throw sessionError;

          if (!session) {
            await openShop(message.chat.id);
            return Response.json({ ok: true });
          }

          if (!text) {
            await callTelegram("sendMessage", {
              chat_id: message.chat.id,
              text: "Please send the location, quantity, and term as text, or use /cancel.",
            });
            return Response.json({ ok: true });
          }

          if (text.length > 1000) {
            await callTelegram("sendMessage", {
              chat_id: message.chat.id,
              text: "Please keep the request under 1,000 characters, or use /cancel.",
            });
            return Response.json({ ok: true });
          }

          const { data: created, error: insertError } = await supabaseAdmin
            .from("telegram_order_requests")
            .upsert(
              {
                telegram_chat_id: message.chat.id,
                telegram_user_id: message.from.id,
                provider: session.provider,
                request_details: text,
                source_update_id: update.update_id,
              },
              { onConflict: "source_update_id", ignoreDuplicates: true },
            )
            .select("id")
            .maybeSingle();
          if (insertError) throw insertError;

          const { error: clearSessionError } = await supabaseAdmin
            .from("telegram_bot_sessions")
            .delete()
            .eq("telegram_chat_id", message.chat.id);
          if (clearSessionError) throw clearSessionError;

          if (created) {
            await callTelegram("sendMessage", {
              chat_id: message.chat.id,
              text: `Request ${created.id.slice(0, 8)} received. The seller will confirm availability and payment before any purchase is placed.`,
            });
          }

          return Response.json({ ok: true });
        } catch (error) {
          console.error("Telegram order webhook failed:", error);
          return Response.json({ error: "Could not process this update." }, { status: 500 });
        }
      },
    },
  },
});