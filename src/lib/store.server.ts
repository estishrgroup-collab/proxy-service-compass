import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

import { calculateRetailCents } from "./pricing";
import type { OrderableProviderId } from "./proxy-providers";
import {
  buyExclusiveProxy,
  buyTurboProxy,
  getExclusivePriceCents,
  SupplierApiError,
  type SupplierProxyItem,
  type SupplierPurchaseResult,
} from "./suppliers.server";

export interface CustomerRecord {
  telegram_user_id: number;
  telegram_chat_id: number;
  balance_cents: number;
}

export interface StoredSession {
  provider: OrderableProviderId;
  state: string;
  country_filter: string | null;
  page: number;
  selected_proxy_id: string | null;
  catalog_items: SupplierProxyItem[];
}

export async function ensureCustomer(input: {
  userId: number;
  chatId: number;
  username?: string;
  firstName?: string;
}): Promise<CustomerRecord> {
  const { data: existing, error: readErr } = await supabaseAdmin
    .from("telegram_customers")
    .select("telegram_user_id, telegram_chat_id, balance_cents")
    .eq("telegram_user_id", input.userId)
    .maybeSingle();
  if (readErr) throw readErr;

  if (existing) {
    await supabaseAdmin
      .from("telegram_customers")
      .update({
        telegram_chat_id: input.chatId,
        ...(input.username ? { username: input.username } : {}),
        ...(input.firstName ? { first_name: input.firstName } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("telegram_user_id", input.userId);
    return existing;
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("telegram_customers")
    .insert({
      telegram_user_id: input.userId,
      telegram_chat_id: input.chatId,
      username: input.username ?? null,
      first_name: input.firstName ?? null,
    })
    .select("telegram_user_id, telegram_chat_id, balance_cents")
    .single();
  if (insertErr) throw insertErr;
  return inserted;
}

export async function saveBotSession(input: {
  chatId: number;
  userId: number;
  provider: OrderableProviderId;
  state: "browsing" | "awaiting_filter";
  countryFilter?: string | null;
  page?: number;
  selectedProxyId?: string | null;
  catalogItems?: SupplierProxyItem[];
}): Promise<void> {
  const { error } = await supabaseAdmin.from("telegram_bot_sessions").upsert({
    telegram_chat_id: input.chatId,
    telegram_user_id: input.userId,
    provider: input.provider,
    state: input.state,
    country_filter: input.countryFilter ?? null,
    page: input.page ?? 0,
    selected_proxy_id: input.selectedProxyId ?? null,
    selected_proxy_json: (input.catalogItems ?? []) as unknown as Json,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function loadBotSession(chatId: number): Promise<StoredSession | null> {
  const { data, error } = await supabaseAdmin
    .from("telegram_bot_sessions")
    .select("provider, state, country_filter, page, selected_proxy_id, selected_proxy_json")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  if (error) throw error;
  if (!data || (data.provider !== "exclusive" && data.provider !== "turbo")) return null;

  return {
    provider: data.provider,
    state: data.state,
    country_filter: data.country_filter,
    page: data.page,
    selected_proxy_id: data.selected_proxy_id,
    catalog_items: Array.isArray(data.selected_proxy_json)
      ? (data.selected_proxy_json as unknown as SupplierProxyItem[])
      : [],
  };
}

export async function listCustomerOrders(userId: number, limit = 5) {
  const { data, error } = await supabaseAdmin
    .from("proxy_orders")
    .select(
      "id, provider, country, city, hours, retail_cents, status, socks_host, socks_port, socks_username, socks_password, real_ip, created_at",
    )
    .eq("telegram_user_id", userId)
    .eq("status", "fulfilled")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export type PurchaseOutcome =
  | {
      ok: true;
      orderId: string;
      retailCents: number;
      balanceAfterCents: number;
      credentials: SupplierPurchaseResult;
    }
  | {
      ok: false;
      reason: "insufficient_balance" | "supplier_unavailable" | "supplier_low_balance" | "supplier_error";
      retailCents: number;
      balanceCents: number;
      detail?: string;
    };

export async function purchaseProxyFromWallet(input: {
  userId: number;
  chatId: number;
  proxy: SupplierProxyItem;
  hours?: number;
  sourceUpdateId: number;
}): Promise<PurchaseOutcome> {
  const wholesaleCents =
    input.proxy.provider === "exclusive"
      ? await getExclusivePriceCents(input.hours ?? 24, input.proxy.score ?? 0)
      : (input.proxy.wholesaleCents ?? 30);
  const retailCents = calculateRetailCents(wholesaleCents);

  const { data: orderRow, error: orderErr } = await supabaseAdmin
    .from("proxy_orders")
    .insert({
      telegram_user_id: input.userId,
      telegram_chat_id: input.chatId,
      provider: input.proxy.provider,
      supplier_proxy_id: input.proxy.id,
      hours: input.proxy.provider === "exclusive" ? (input.hours ?? 24) : null,
      country: input.proxy.country,
      region: input.proxy.region,
      city: input.proxy.city,
      isp: input.proxy.isp,
      wholesale_cents: wholesaleCents,
      retail_cents: retailCents,
      status: "pending",
      source_update_id: input.sourceUpdateId,
    })
    .select("id")
    .single();
  if (orderErr) throw orderErr;

  const { data: debitRows, error: debitErr } = await supabaseAdmin.rpc("debit_telegram_wallet", {
    p_user_id: input.userId,
    p_amount_cents: retailCents,
    p_reference_id: `order_${orderRow.id}`,
    p_note: `${input.proxy.provider} proxy #${input.proxy.id}`,
  });
  if (debitErr) throw debitErr;

  const debit = debitRows?.[0];
  if (!debit?.ok) {
    await supabaseAdmin
      .from("proxy_orders")
      .update({ status: "failed", failure_reason: debit?.error_code ?? "insufficient_balance" })
      .eq("id", orderRow.id);
    return {
      ok: false,
      reason: "insufficient_balance",
      retailCents,
      balanceCents: debit?.balance_cents ?? 0,
    };
  }

  await supabaseAdmin.from("proxy_orders").update({ status: "paid" }).eq("id", orderRow.id);

  try {
    const result =
      input.proxy.provider === "exclusive"
        ? await buyExclusiveProxy(input.proxy.id, input.hours ?? 24)
        : await buyTurboProxy(input.proxy.id);

    await supabaseAdmin
      .from("proxy_orders")
      .update({
        status: "fulfilled",
        supplier_order_id: result.supplierOrderId,
        wholesale_cents: result.wholesaleCents || wholesaleCents,
        socks_host: result.socksHost,
        socks_port: result.socksPort,
        socks_username: result.socksUsername,
        socks_password: result.socksPassword,
        real_ip: result.realIp,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderRow.id);

    return {
      ok: true,
      orderId: orderRow.id,
      retailCents,
      balanceAfterCents: debit.balance_cents,
      credentials: result,
    };
  } catch (err) {
    const code = err instanceof SupplierApiError ? err.code : "supplier_error";
    const { data: refundRows } = await supabaseAdmin.rpc("credit_telegram_wallet", {
      p_user_id: input.userId,
      p_chat_id: input.chatId,
      p_amount_cents: retailCents,
      p_type: "refund",
      p_reference_id: `refund_${orderRow.id}`,
      p_note: `Auto-refund (${code})`,
    });

    await supabaseAdmin
      .from("proxy_orders")
      .update({ status: "refunded", failure_reason: code, updated_at: new Date().toISOString() })
      .eq("id", orderRow.id);

    const reason =
      code === "not_available"
        ? "supplier_unavailable"
        : code === "not_enough_money" || code === "balance_error"
          ? "supplier_low_balance"
          : "supplier_error";

    return {
      ok: false,
      reason,
      retailCents,
      balanceCents: refundRows?.[0]?.balance_cents ?? debit.balance_cents + retailCents,
      detail: code,
    };
  }
}