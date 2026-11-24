import {
  calculateRetailCents,
  formatCents,
  formatDurationLabel,
  TOPUP_PACKS_USD,
} from "./pricing";
import type { OrderableProviderId } from "./proxy-providers";
import type { SupplierProxyItem, SupplierPurchaseResult } from "./suppliers.server";
import { escapeHtml, type InlineKeyboardButton, type InlineKeyboardMarkup } from "./telegram-api.server";

export const QUICK_COUNTRIES = [
  { code: "US", label: "🇺🇸 US", turboName: "United States" },
  { code: "GB", label: "🇬🇧 UK", turboName: "United Kingdom" },
  { code: "DE", label: "🇩🇪 DE", turboName: "Germany" },
  { code: "IT", label: "🇮🇹 IT", turboName: "Italy" },
  { code: "ES", label: "🇪🇸 ES", turboName: "Spain" },
  { code: "FR", label: "🇫🇷 FR", turboName: "France" },
] as const;

export function resolveCountryQuery(provider: OrderableProviderId, filter: string | null): string | undefined {
  if (!filter || filter === "ALL") return undefined;
  const match = QUICK_COUNTRIES.find((c) => c.code === filter);
  if (match) return provider === "exclusive" ? match.code : match.turboName;
  return filter;
}

export function buildHomeView(balanceCents: number): { text: string; markup: InlineKeyboardMarkup } {
  const text = [
    "<b>luxpoxy — Live Proxy Shop</b>",
    `Wallet balance: <b>${formatCents(balanceCents)}</b>`,
    "Browse live residential &amp; SOCKS5 proxies from <b>Turbo</b> and <b>Exclusive</b>. Top up your balance with crypto, pick any IP, and get instant SOCKS5 credentials right here.",
    "• <b>Turbo</b>: Residential &amp; mobile IPs — from <b>$0.60</b>\n• <b>Exclusive</b>: Low-fraud SOCKS5 rentals — 6h to 7 days\n• <b>Fresh &amp; Smart</b>: Coming soon (HTTPS link pending)",
  ].join("\n\n");

  const markup: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: "⚡ Turbo Proxies", callback_data: "cat:turbo:0" },
        { text: "💎 Exclusive Proxies", callback_data: "cat:exclusive:0" },
      ],
      [
        { text: "💳 Top Up (Crypto)", callback_data: "topup" },
        { text: "📦 My Proxies", callback_data: "orders" },
      ],
      [{ text: "ℹ️ How It Works & Pricing", callback_data: "info" }],
    ],
  };

  return { text, markup };
}

export function buildInfoView(): { text: string; markup: InlineKeyboardMarkup } {
  const text = [
    "<b>How luxpoxy Works</b>",
    "1. <b>Top up with Crypto</b> ($10, $25, or $50) to fund your wallet balance once — no extra fees per proxy.",
    "2. <b>Pick a live proxy</b> from Turbo (instant buy) or Exclusive (rent for 6h, 24h, 72h, or 7 days).",
    "3. <b>Instant API delivery</b> — our bot buys the IP live from the supplier and sends your <code>ip:port:user:pass</code> right away.",
    "4. <b>Auto-refund protection</b> — if an IP sells out before checkout completes, your wallet balance is refunded immediately.",
  ].join("\n\n");

  return { text, markup: { inline_keyboard: [[{ text: "⬅️ Main Menu", callback_data: "home" }]] } };
}

export function buildCatalogView(input: {
  provider: OrderableProviderId;
  items: SupplierProxyItem[];
  page: number;
  countryFilter: string | null;
  exclusiveBaseRetailCents?: number;
  totalCount?: number;
}): { text: string; markup: InlineKeyboardMarkup } {
  const title = input.provider === "turbo" ? "⚡ Turbo Proxies" : "💎 Exclusive Proxies";
  const filterLabel = input.countryFilter ? escapeHtml(input.countryFilter) : "All locations";
  const countLine = input.totalCount ? ` (${input.totalCount.toLocaleString("en-US")} live)` : "";

  const lines = [
    `<b>${title}</b>${countLine}`,
    `Filter: <b>${filterLabel}</b> · Page ${input.page + 1}`,
  ];

  if (input.items.length === 0) {
    lines.push("No live proxies matched this filter. Try another country or tap All.");
  } else {
    input.items.forEach((item, index) => {
      const loc = [item.country, item.city || item.region].filter(Boolean).join(", ");
      const priceStr =
        item.provider === "turbo" && item.wholesaleCents !== null
          ? formatCents(calculateRetailCents(item.wholesaleCents))
          : input.exclusiveBaseRetailCents
            ? `from ${formatCents(input.exclusiveBaseRetailCents)}/24h`
            : "Tap for price";
      const meta =
        item.provider === "turbo"
          ? `${item.useType ?? "Residential"} · ${item.isp}`
          : `Score ${item.score ?? 0} · ${item.isp}`;
      lines.push(`<b>${index + 1}.</b> ${escapeHtml(loc)} — <b>${priceStr}</b>\n    ${escapeHtml(meta)}`);
    });
  }

  const pickRow: InlineKeyboardButton[] = input.items.map((_, index) => ({
    text: `#${index + 1}`,
    callback_data: `pick:${input.provider}:${index}`,
  }));

  const countryRow1: InlineKeyboardButton[] = QUICK_COUNTRIES.slice(0, 3).map((c) => ({
    text: input.countryFilter === c.code ? `✓ ${c.label}` : c.label,
    callback_data: `flt:${input.provider}:${c.code}`,
  }));
  const countryRow2: InlineKeyboardButton[] = [
    ...QUICK_COUNTRIES.slice(3, 5).map((c) => ({
      text: input.countryFilter === c.code ? `✓ ${c.label}` : c.label,
      callback_data: `flt:${input.provider}:${c.code}`,
    })),
    { text: "🌍 All", callback_data: `flt:${input.provider}:ALL` },
  ];

  const navRow: InlineKeyboardButton[] = [];
  if (input.page > 0) navRow.push({ text: "⬅️ Prev", callback_data: `cat:${input.provider}:${input.page - 1}` });
  if (input.items.length >= 5) navRow.push({ text: "Next ➡️", callback_data: `cat:${input.provider}:${input.page + 1}` });
  navRow.push({ text: "🔎 City/ZIP", callback_data: `srch:${input.provider}` });

  const keyboard: InlineKeyboardButton[][] = [];
  if (pickRow.length > 0) keyboard.push(pickRow);
  keyboard.push(countryRow1, countryRow2, navRow, [{ text: "🏠 Main Menu", callback_data: "home" }]);

  return { text: lines.join("\n\n"), markup: { inline_keyboard: keyboard } };
}

export function buildProxyDetailView(input: {
  item: SupplierProxyItem;
  index: number;
  page: number;
  balanceCents: number;
  exclusivePrices?: Array<{ hours: number; retailCents: number }>;
}): { text: string; markup: InlineKeyboardMarkup } {
  const { item } = input;
  const loc = [item.country, item.region, item.city].filter(Boolean).join(" / ");
  const lines = [
    `<b>${item.provider === "turbo" ? "⚡ Turbo" : "💎 Exclusive"} Proxy #${escapeHtml(item.id)}</b>`,
    `Location: <b>${escapeHtml(loc || "Unknown")}</b>${item.zip ? ` (ZIP ${escapeHtml(item.zip)})` : ""}`,
    `ISP / Network: <b>${escapeHtml(item.isp)}</b>`,
    item.provider === "turbo"
      ? `Type: <b>${escapeHtml(item.useType ?? "Residential")}</b> · Blacklist: <b>${escapeHtml(item.blacklist ?? "No")}</b>`
      : `Fraud Score: <b>${item.score ?? 0}/100</b> · IP: <code>${escapeHtml(item.ipMasked || "Assigned on buy")}</code>`,
    `Your balance: <b>${formatCents(input.balanceCents)}</b>`,
  ];

  const keyboard: InlineKeyboardButton[][] = [];
  if (item.provider === "turbo") {
    const retailCents = calculateRetailCents(item.wholesaleCents ?? 30);
    lines.push(`Price: <b>${formatCents(retailCents)}</b> (instant SOCKS5 delivery)`);
    keyboard.push([{ text: `✅ Buy Now — ${formatCents(retailCents)}`, callback_data: `buy:turbo:${input.index}:0` }]);
  } else {
    lines.push("Choose rental duration:");
    const prices = input.exclusivePrices ?? [];
    for (let i = 0; i < prices.length; i += 2) {
      const row: InlineKeyboardButton[] = [];
      for (const entry of prices.slice(i, i + 2)) {
        row.push({
          text: `⏱ ${formatDurationLabel(entry.hours)} — ${formatCents(entry.retailCents)}`,
          callback_data: `buy:exclusive:${input.index}:${entry.hours}`,
        });
      }
      keyboard.push(row);
    }
  }

  keyboard.push([
    { text: "⬅️ Back to List", callback_data: `cat:${item.provider}:${input.page}` },
    { text: "💳 Top Up", callback_data: "topup" },
  ]);

  return { text: lines.join("\n"), markup: { inline_keyboard: keyboard } };
}

export function buildFulfilledView(input: {
  orderId: string;
  provider: OrderableProviderId;
  hours?: number;
  retailCents: number;
  balanceAfterCents: number;
  credentials: SupplierPurchaseResult;
}): { text: string; markup: InlineKeyboardMarkup } {
  const { credentials: c } = input;
  const hostPort = `${c.socksHost}:${c.socksPort}`;
  const rawLine = `${hostPort}:${c.socksUsername}:${c.socksPassword}`;
  const socksUri = `socks5://${c.socksUsername}:${c.socksPassword}@${hostPort}`;

  const text = [
    `✅ <b>Proxy Delivered!</b> (Order <code>${input.orderId.slice(0, 8)}</code>)`,
    `Plan: <b>${input.provider === "turbo" ? "Turbo" : `Exclusive (${formatDurationLabel(input.hours ?? 24)})`}</b> · Paid: <b>${formatCents(input.retailCents)}</b>`,
    `<b>SOCKS5 Credentials (tap to copy):</b>\n<code>${escapeHtml(rawLine)}</code>\n<code>${escapeHtml(socksUri)}</code>`,
    `Exit IP: <code>${escapeHtml(c.realIp)}</code>\nRemaining balance: <b>${formatCents(input.balanceAfterCents)}</b>`,
  ].join("\n\n");

  return {
    text,
    markup: {
      inline_keyboard: [
        [
          { text: "📦 My Proxies", callback_data: "orders" },
          { text: "🏠 Main Menu", callback_data: "home" },
        ],
      ],
    },
  };
}

export function buildTopUpView(balanceCents: number, selectedUsd?: number): { text: string; markup: InlineKeyboardMarkup } {
  const lines = [
    "<b>💳 Top Up Balance (Crypto)</b>",
    `Current balance: <b>${formatCents(balanceCents)}</b>`,
  ];

  if (selectedUsd) {
    lines.push(
      `You selected the <b>$${selectedUsd}</b> crypto top-up (USDT / TON / BTC).`,
      "Automatic crypto invoice checkout is waiting for the store owner to finish connecting their crypto payment service. Once connected, tapping this pack will generate an instant payment link and credit your balance automatically.",
    );
  } else {
    lines.push(
      "Choose a top-up pack to fund your wallet with crypto (USDT, TON, BTC). Once credited, every proxy purchase delivers instantly with zero extra checkout fees.",
    );
  }

  return {
    text: lines.join("\n\n"),
    markup: {
      inline_keyboard: [
        TOPUP_PACKS_USD.map((usd) => ({ text: `+$${usd} Crypto`, callback_data: `topup:${usd}` })),
        [{ text: "🏠 Main Menu", callback_data: "home" }],
      ],
    },
  };
}