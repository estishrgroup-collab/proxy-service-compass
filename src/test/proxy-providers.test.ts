import { describe, expect, it } from "vitest";

import { getOrderableProvider, proxyProviders } from "@/lib/proxy-providers";

describe("proxy supplier availability", () => {
  it("keeps the four requested suppliers visible", () => {
    expect(proxyProviders.map((provider) => provider.name)).toEqual([
      "Fresh",
      "Smart",
      "Exclusive",
      "Turbo",
    ]);
  });

  it("only allows the two suppliers with secure connected APIs", () => {
    expect(getOrderableProvider("exclusive")).toBe("exclusive");
    expect(getOrderableProvider("turbo")).toBe("turbo");
    expect(getOrderableProvider("fresh")).toBeNull();
    expect(getOrderableProvider("smart")).toBeNull();
  });
});