export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function callTelegram(method: string, payload: Record<string, unknown>): Promise<unknown> {
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
    console.error(`Telegram ${method} failed [${response.status}]: ${responseBody}`);
    throw new Error(`Telegram request failed [${response.status}]: ${responseBody}`);
  }

  let result: unknown;
  try {
    result = JSON.parse(responseBody) as unknown;
  } catch {
    throw new Error("Telegram returned an unreadable response.");
  }

  if (typeof result === "object" && result !== null && "ok" in result && result.ok === false) {
    const description =
      "description" in result && typeof result.description === "string"
        ? result.description
        : "Unknown Telegram error";
    const errorCode =
      "error_code" in result && typeof result.error_code === "number"
        ? result.error_code
        : "unknown";
    console.error(`Telegram ${method} failed [${errorCode}]: ${description}`);
    throw new Error(`Telegram request failed [${errorCode}]: ${description}`);
  }

  return result;
}

export async function sendTelegramHtml(
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<void> {
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function editOrSendTelegramHtml(
  chatId: number,
  messageId: number | undefined,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<void> {
  if (!messageId) {
    await sendTelegramHtml(chatId, text, replyMarkup);
    return;
  }

  try {
    await callTelegram("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  } catch {
    await sendTelegramHtml(chatId, text, replyMarkup);
  }
}