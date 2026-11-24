import {
  calculateRetailCents,
  EXCLUSIVE_DURATION_HOURS,
  formatCents,
  TOPUP_PACKS_USD,
} from "./pricing";
import { getOrderableProvider, type OrderableProviderId } from "./proxy-providers";
import {
  ensureCustomer,
  listCustomerOrders,
  loadBotSession,
  purchaseProxyFromWallet,
  saveBotSession,
} from "./store.server";
import {
  getExclusivePriceCents,
  searchExclusiveProxies,
  searchTurboProxies,
  type SupplierProxyItem,
} from "./suppliers.server";
import {
  callTelegram,
  editOrSendTelegramHtml,
  escapeHtml,
  sendTelegramHtml,
} from "./telegram-api.server";
import {
  buildCatalogView,
  buildFulfilledView,
  buildHomeView,
  buildInfoView,
  buildProxyDetailView,
  buildTopUpView,
  resolveCountryQuery,
} from "./telegram-views.server";

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id?: number | undefined;
    chat: { id: number; type: string };
    from?: { id: number; username?: string | undefined; first_name?: string | undefined } | undefined;
    text?: string | undefined;
  } | undefined;
  callback_query?: {
    id: string;
    data?: string | undefined;
    from: { id: number; username?: string | undefined; first_name?: string | undefined };
    message?: { message_id?: number | undefined; chat: { id: number; type: string } } | undefined;
  } | undefined;
}

async function openCatalog(input: {
  userId: number;
  chatId: number;
  messageId?: number | undefined;
  provider: OrderableProviderId;
  page: number;
  countryFilter: string | null;
  cityOrZip?: string | undefined;
}): Promise<void> {
  const safePage = Math.max(0, input.page);
  const isZip = input.cityOrZip ? /^\d{3,10}$/.test(input.cityOrZip.trim()) : false;
  const city = input.cityOrZip && !isZip ? input.cityOrZip.trim() : undefined;
  const zip = input.cityOrZip && isZip ? input.cityOrZip.trim() : undefined;
  const country = resolveCountryQuery(input.provider, input.countryFilter);

  let items: SupplierProxyItem[] = [];
  let totalCount: number | undefined;
  let exclusiveBaseRetailCents: number | undefined;

  if (input.provider === "exclusive") {
    const [searchResult, basePrice] = await Promise.all([
      searchExclusiveProxies({
        limit: 5,
        offset: safePage * 5,
        ...(country ? { country } : {}),
        ...(city ? { city } : {}),
        ...(zip ? { zip } : {}),
      }),
      getExclusivePriceCents(24, 0).catch(() => 150),
    ]);
    items = searchResult.items;
    totalCount = searchResult.total;
    exclusiveBaseRetailCents = calculateRetailCents(basePrice);
  } else {
    items = await searchTurboProxies({
      page: safePage + 1,
      limit: 5,
      ...(country ? { country } : {}),
      ...(city ? { city } : {}),
      ...(zip ? { zipcode: zip } : {}),
    });
  }

  const labelFilter = input.cityOrZip ? input.cityOrZip.trim() : input.countryFilter;
  await saveBotSession({
    chatId: input.chatId,
    userId: input.userId,
    provider: input.provider,
    state: "browsing",
    countryFilter: labelFilter,
    page: safePage,
    catalogItems: items,
  });

  const view = buildCatalogView({
    provider: input.provider,
    items,
    page: safePage,
    countryFilter: labelFilter,
    ...(exclusiveBaseRetailCents !== undefined ? { exclusiveBaseRetailCents } : {}),
    ...(totalCount !== undefined ? { totalCount } : {}),
  });
  await editOrSendTelegramHtml(input.chatId, input.messageId, view.text, view.markup);
}

async function handleBuy(input: {
  userId: number;
  chatId: number;
  messageId?: number | undefined;
  provider: OrderableProviderId;
  index: number;
  hours: number;
  updateId: number;
}): Promise<void> {
  const session = await loadBotSession(input.chatId);
  const proxy = session?.catalog_items[input.index];
  if (!session || session.provider !== input.provider || !proxy) {
    await sendTelegramHtml(input.chatId, "That listing expired. Refreshing live proxies…");
    await openCatalog({
      userId: input.userId,
      chatId: input.chatId,
      provider: input.provider,
      page: 0,
      countryFilter: null,
    });
    return;
  }

  const outcome = await purchaseProxyFromWallet({
    userId: input.userId,
    chatId: input.chatId,
    proxy,
    ...(input.provider === "exclusive" ? { hours: input.hours || 24 } : {}),
    sourceUpdateId: input.updateId,
  });

  if (outcome.ok) {
    const view = buildFulfilledView({
      orderId: outcome.orderId,
      provider: input.provider,
      ...(input.provider === "exclusive" ? { hours: input.hours || 24 } : {}),
      retailCents: outcome.retailCents,
      balanceAfterCents: outcome.balanceAfterCents,
      credentials: outcome.credentials,
    });
    await sendTelegramHtml(input.chatId, view.text, view.markup);
    return;
  }

  if (outcome.reason === "insufficient_balance") {
    const needed = Math.max(0, outcome.retailCents - outcome.balanceCents);
    await editOrSendTelegramHtml(
      input.chatId,
      input.messageId,
      [
        "<b>Insufficient Balance</b>",
        `Proxy price: <b>${formatCents(outcome.retailCents)}</b>`,
        `Your balance: <b>${formatCents(outcome.balanceCents)}</b> (need <b>${formatCents(needed)}</b> more)`,
        "Top up your wallet with crypto below, then tap Buy again for instant delivery.",
      ].join("\n\n"),
      {
        inline_keyboard: [
          TOPUP_PACKS_USD.map((usd) => ({ text: `💳 Top Up $${usd}`, callback_data: `topup:${usd}` })),
          [{ text: "⬅️ Back to Catalog", callback_data: `cat:${input.provider}:${session.page}` }],
        ],
      },
    );
    return;
  }

  const msg =
    outcome.reason === "supplier_unavailable"
      ? "That proxy was just purchased by someone else. Your wallet balance was automatically refunded — pick another live IP below."
      : outcome.reason === "supplier_low_balance"
        ? "Supplier inventory is temporarily replenishing. Your wallet balance was automatically refunded — please try again shortly."
        : "Could not complete supplier checkout right now. Your wallet balance was automatically refunded.";

  await sendTelegramHtml(input.chatId, msg, {
    inline_keyboard: [
      [{ text: "🔄 Browse Live Proxies", callback_data: `cat:${input.provider}:0` }],
      [{ text: "🏠 Main Menu", callback_data: "home" }],
    ],
  });
}

async function showMyOrders(userId: number, chatId: number, messageId?: number): Promise<void> {
  const orders = await listCustomerOrders(userId, 5);
  if (orders.length === 0) {
    await editOrSendTelegramHtml(
      chatId,
      messageId,
      "<b>📦 My Proxies</b>\n\nYou have no purchased proxies yet. Browse Turbo or Exclusive to get started.",
      {
        inline_keyboard: [
          [
            { text: "⚡ Turbo", callback_data: "cat:turbo:0" },
            { text: "💎 Exclusive", callback_data: "cat:exclusive:0" },
          ],
          [{ text: "🏠 Main Menu", callback_data: "home" }],
        ],
      },
    );
    return;
  }

  const blocks = orders.map((order) => {
    const loc = [order.country, order.city].filter(Boolean).join(", ");
    const creds = `${order.socks_host}:${order.socks_port}:${order.socks_username}:${order.socks_password}`;
    return [
      `<b>${order.provider === "turbo" ? "⚡ Turbo" : "💎 Exclusive"}</b> · ${escapeHtml(loc || "Proxy")} (${formatCents(order.retail_cents)})`,
      `<code>${escapeHtml(creds)}</code>`,
    ].join("\n");
  });

  await editOrSendTelegramHtml(chatId, messageId, `<b>📦 My Recent Proxies</b>\n\n${blocks.join("\n\n")}`, {
    inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "home" }]],
  });
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    const cb = update.callback_query;
    await callTelegram("answerCallbackQuery", { callback_query_id: cb.id });
    const chat = cb.message?.chat;
    if (!chat || chat.type !== "private") return;

    const customer = await ensureCustomer({
      userId: cb.from.id,
      chatId: chat.id,
      ...(cb.from.username ? { username: cb.from.username } : {}),
      ...(cb.from.first_name ? { firstName: cb.from.first_name } : {}),
    });
    const messageId = cb.message?.message_id;
    const data = cb.data ?? "home";

    if (data === "home") {
      const view = buildHomeView(customer.balance_cents);
      await editOrSendTelegramHtml(chat.id, messageId, view.text, view.markup);
      return;
    }
    if (data === "info") {
      const view = buildInfoView();
      await editOrSendTelegramHtml(chat.id, messageId, view.text, view.markup);
      return;
    }
    if (data === "orders") {
      await showMyOrders(customer.telegram_user_id, chat.id, messageId);
      return;
    }
    if (data === "topup" || data.startsWith("topup:")) {
      const amount = data.startsWith("topup:") ? Number(data.slice("topup:".length)) : undefined;
      const view = buildTopUpView(customer.balance_cents, Number.isFinite(amount) ? amount : undefined);
      await editOrSendTelegramHtml(chat.id, messageId, view.text, view.markup);
      return;
    }

    const parts = data.split(":");
    const action = parts[0];
    const provider = getOrderableProvider(parts[1] ?? "");
    if (!provider) {
      const view = buildHomeView(customer.balance_cents);
      await editOrSendTelegramHtml(chat.id, messageId, view.text, view.markup);
      return;
    }

    if (action === "cat") {
      const page = Number(parts[2] ?? "0") || 0;
      const session = await loadBotSession(chat.id);
      const filter = session && session.provider === provider ? session.country_filter : null;
      await openCatalog({ userId: customer.telegram_user_id, chatId: chat.id, messageId, provider, page, countryFilter: filter });
      return;
    }
    if (action === "flt") {
      const code = parts[2] === "ALL" ? null : (parts[2] ?? null);
      await openCatalog({ userId: customer.telegram_user_id, chatId: chat.id, messageId, provider, page: 0, countryFilter: code });
      return;
    }
    if (action === "srch") {
      await saveBotSession({ chatId: chat.id, userId: customer.telegram_user_id, provider, state: "awaiting_filter" });
      await sendTelegramHtml(
        chat.id,
        `Send a <b>city name</b> or <b>ZIP code</b> to search live ${provider === "turbo" ? "Turbo" : "Exclusive"} proxies (or /start to go back).`,
      );
      return;
    }
    if (action === "pick") {
      const index = Number(parts[2] ?? "-1");
      const session = await loadBotSession(chat.id);
      const item = session?.catalog_items[index];
      if (!session || !item) {
        await openCatalog({ userId: customer.telegram_user_id, chatId: chat.id, messageId, provider, page: 0, countryFilter: null });
        return;
      }
      let exclusivePrices: Array<{ hours: number; retailCents: number }> | undefined;
      if (item.provider === "exclusive") {
        const raw = await Promise.all(
          EXCLUSIVE_DURATION_HOURS.map(async (hours) => ({
            hours,
            retailCents: calculateRetailCents(await getExclusivePriceCents(hours, item.score ?? 0)),
          })),
        );
        exclusivePrices = raw;
      }
      const view = buildProxyDetailView({
        item,
        index,
        page: session.page,
        balanceCents: customer.balance_cents,
        ...(exclusivePrices ? { exclusivePrices } : {}),
      });
      await editOrSendTelegramHtml(chat.id, messageId, view.text, view.markup);
      return;
    }
    if (action === "buy") {
      const index = Number(parts[2] ?? "-1");
      const hours = Number(parts[3] ?? "24");
      await handleBuy({
        userId: customer.telegram_user_id,
        chatId: chat.id,
        messageId,
        provider,
        index,
        hours,
        updateId: update.update_id,
      });
    }
    return;
  }

  const message = update.message;
  if (!message || message.chat.type !== "private" || !message.from) return;

  const customer = await ensureCustomer({
    userId: message.from.id,
    chatId: message.chat.id,
    ...(message.from.username ? { username: message.from.username } : {}),
    ...(message.from.first_name ? { firstName: message.from.first_name } : {}),
  });
  const text = message.text?.trim() ?? "";

  if (/^\/(?:start|catalog|menu|help)(?:@\w+)?(?:\s|$)/i.test(text)) {
    const view = buildHomeView(customer.balance_cents);
    await sendTelegramHtml(message.chat.id, view.text, view.markup);
    return;
  }
  if (/^\/(?:balance|topup)(?:@\w+)?(?:\s|$)/i.test(text)) {
    const view = buildTopUpView(customer.balance_cents);
    await sendTelegramHtml(message.chat.id, view.text, view.markup);
    return;
  }
  if (/^\/orders(?:@\w+)?(?:\s|$)/i.test(text)) {
    await showMyOrders(customer.telegram_user_id, message.chat.id);
    return;
  }

  const session = await loadBotSession(message.chat.id);
  if (session?.state === "awaiting_filter" && text.length >= 2 && text.length <= 80 && !text.startsWith("/")) {
    await openCatalog({
      userId: customer.telegram_user_id,
      chatId: message.chat.id,
      provider: session.provider,
      page: 0,
      countryFilter: null,
      cityOrZip: text,
    });
    return;
  }

  const view = buildHomeView(customer.balance_cents);
  await sendTelegramHtml(message.chat.id, view.text, view.markup);
}