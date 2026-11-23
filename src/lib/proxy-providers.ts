export const proxyProviders = [
  {
    id: "fresh",
    name: "Fresh",
    state: "needs-https",
    note: "Secure API link required",
  },
  {
    id: "smart",
    name: "Smart",
    state: "needs-https",
    note: "Secure API link required",
  },
  {
    id: "exclusive",
    name: "Exclusive",
    state: "connected",
    note: "Secure supplier connection",
  },
  {
    id: "turbo",
    name: "Turbo",
    state: "connected",
    note: "Secure supplier connection",
  },
] as const;

export type ProxyProviderId = (typeof proxyProviders)[number]["id"];
export type OrderableProviderId = Extract<ProxyProviderId, "exclusive" | "turbo">;

export function getOrderableProvider(value: string): OrderableProviderId | null {
  if (value === "exclusive" || value === "turbo") return value;
  return null;
}