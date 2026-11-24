import { describe, expect, it } from "vitest";

import {
  calculateProfitCents,
  calculateRetailCents,
  dollarsToCents,
  formatCents,
  MARKUP_MULTIPLIER,
  TOPUP_PACKS_USD,
} from "@/lib/pricing";

describe("luxpoxy 2x wholesale pricing", () => {
  it("doubles Turbo $0.30 wholesale to $0.60 retail with $0.30 profit", () => {
    const wholesale = dollarsToCents(0.3);
    const retail = calculateRetailCents(wholesale);
    expect(MARKUP_MULTIPLIER).toBe(2);
    expect(retail).toBe(60);
    expect(calculateProfitCents(retail, wholesale)).toBe(30);
    expect(formatCents(retail)).toBe("$0.60");
  });

  it("doubles Exclusive $1.50 wholesale to $3.00 retail with $1.50 profit", () => {
    const wholesale = dollarsToCents(1.5);
    const retail = calculateRetailCents(wholesale);
    expect(retail).toBe(300);
    expect(calculateProfitCents(retail, wholesale)).toBe(150);
    expect(formatCents(retail)).toBe("$3.00");
  });

  it("exposes $10, $25, and $50 prepaid wallet top-up packs", () => {
    expect(TOPUP_PACKS_USD).toEqual([10, 25, 50]);
  });
});