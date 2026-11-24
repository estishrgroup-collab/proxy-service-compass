import { dollarsToCents } from "./pricing";
import type { OrderableProviderId } from "./proxy-providers";

const EXCLUSIVE_GATEWAY = "https://connector-gateway.lovable.dev/udc_exclusive";
const TURBO_GATEWAY = "https://connector-gateway.lovable.dev/udc_turbo";

export interface SupplierProxyItem {
  id: string;
  provider: OrderableProviderId;
  country: string;
  region: string;
  city: string;
  zip: string;
  isp: string;
  ipMasked: string;
  score: number | null;
  useType: string | null;
  blacklist: string | null;
  wholesaleCents: number | null;
}

export interface SupplierPurchaseResult {
  supplierOrderId: string;
  socksHost: string;
  socksPort: number;
  socksUsername: string;
  socksPassword: string;
  realIp: string;
  wholesaleCents: number;
}

interface SupplierEnvelope<T> {
  status: boolean;
  data: T | null;
  msg: string | null;
}

export class SupplierApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(message: string, code: string, httpStatus: number) {
    super(message);
    this.name = "SupplierApiError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

async function callSupplier<T>(
  provider: OrderableProviderId,
  path: string,
  init: { method?: "GET" | "POST"; query?: Record<string, string | number | undefined>; body?: unknown } = {},
): Promise<T> {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey =
    provider === "exclusive"
      ? process.env["UDC_EXCLUSIVE_API_KEY"]
      : process.env["UDC_TURBO_API_KEY"];

  if (!lovableApiKey || !connectionKey) {
    throw new SupplierApiError(`${provider} supplier credentials are not configured.`, "missing_credentials", 503);
  }

  const baseUrl = provider === "exclusive" ? EXCLUSIVE_GATEWAY : TURBO_GATEWAY;
  const url = new URL(`${baseUrl}${path}`);
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": connectionKey,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  const text = await response.text();
  let parsed: SupplierEnvelope<T> | null = null;
  try {
    parsed = JSON.parse(text) as SupplierEnvelope<T>;
  } catch {
    parsed = null;
  }

  if (!response.ok || !parsed || parsed.status !== true || parsed.data === null) {
    const code = parsed?.msg ?? `http_${response.status}`;
    console.error(`Supplier ${provider} ${path} failed [${response.status}]: ${text}`);
    throw new SupplierApiError(`Supplier ${provider} error: ${code}`, code, response.status);
  }

  return parsed.data;
}

export async function searchExclusiveProxies(params: {
  country?: string;
  city?: string;
  zip?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; items: SupplierProxyItem[] }> {
  interface RawExclusiveItem {
    id: string;
    country?: string | null;
    region?: string | null;
    city?: string | null;
    zip?: string | null;
    ip?: string | null;
    isp?: string | null;
    ipqualityscore?: number | null;
  }
  const data = await callSupplier<{ count: number; results: RawExclusiveItem[] }>("exclusive", "/search", {
    query: {
      limit: params.limit ?? 5,
      offset: params.offset ?? 0,
      country: params.country,
      city: params.city,
      zip: params.zip,
    },
  });

  return {
    total: data.count,
    items: (data.results ?? []).map((item) => ({
      id: String(item.id),
      provider: "exclusive",
      country: item.country ?? "Unknown",
      region: item.region ?? "",
      city: item.city ?? "",
      zip: item.zip ?? "",
      isp: item.isp ?? "Residential",
      ipMasked: item.ip ?? "",
      score: typeof item.ipqualityscore === "number" ? item.ipqualityscore : 0,
      useType: "SOCKS5",
      blacklist: null,
      wholesaleCents: null,
    })),
  };
}

export async function getExclusivePriceCents(hours: number, score: number): Promise<number> {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  const priceUsd = await callSupplier<number>("exclusive", "/price", {
    query: { hours, score: safeScore },
  });
  return dollarsToCents(priceUsd);
}

export async function searchTurboProxies(params: {
  country?: string;
  city?: string;
  zipcode?: string;
  page?: number;
  limit?: number;
}): Promise<SupplierProxyItem[]> {
  interface RawTurboItem {
    id: number | string;
    country?: string | null;
    region?: string | null;
    city?: string | null;
    host?: string | null;
    zipcode?: string | null;
    blacklist?: string | null;
    usetype?: string | null;
    price?: number | null;
  }

  const data = await callSupplier<RawTurboItem[]>("turbo", "/search", {
    query: {
      page: params.page ?? 1,
      limit: params.limit ?? 5,
      country: params.country,
      city: params.city,
      zipcode: params.zipcode,
      blacklist: "No",
    },
  });

  return (Array.isArray(data) ? data : []).map((item) => ({
    id: String(item.id),
    provider: "turbo",
    country: item.country ?? "Unknown",
    region: item.region ?? "",
    city: item.city ?? "",
    zip: item.zipcode ?? "",
    isp: item.host ?? "Residential",
    ipMasked: "",
    score: null,
    useType: item.usetype ?? "Residential",
    blacklist: item.blacklist ?? "No",
    wholesaleCents: typeof item.price === "number" ? dollarsToCents(item.price) : 30,
  }));
}

interface RawOrderOut {
  id: number | string | null;
  socks_username: string | null;
  socks_password: string | null;
  socks_external_ip: string | null;
  socks_external_port: number | null;
  real_ip: string | null;
  price: number | null;
}

function mapPurchaseOrder(order: RawOrderOut): SupplierPurchaseResult {
  if (!order.socks_external_ip || !order.socks_external_port || !order.socks_username || !order.socks_password) {
    throw new SupplierApiError("Supplier returned incomplete proxy credentials.", "incomplete_credentials", 502);
  }
  return {
    supplierOrderId: String(order.id ?? ""),
    socksHost: order.socks_external_ip,
    socksPort: order.socks_external_port,
    socksUsername: order.socks_username,
    socksPassword: order.socks_password,
    realIp: order.real_ip ?? order.socks_external_ip,
    wholesaleCents: typeof order.price === "number" ? dollarsToCents(order.price) : 0,
  };
}

export async function buyExclusiveProxy(proxyId: string, hours: number): Promise<SupplierPurchaseResult> {
  const order = await callSupplier<RawOrderOut>("exclusive", "/buy", {
    method: "POST",
    query: { proxy_id: proxyId, hours },
  });
  return mapPurchaseOrder(order);
}

export async function buyTurboProxy(proxyId: string): Promise<SupplierPurchaseResult> {
  const numericId = Number(proxyId);
  if (!Number.isSafeInteger(numericId)) {
    throw new SupplierApiError("Invalid Turbo proxy ID.", "invalid_proxy_id", 400);
  }
  const order = await callSupplier<RawOrderOut>("turbo", "/buy", {
    method: "POST",
    body: { id: numericId },
  });
  return mapPurchaseOrder(order);
}