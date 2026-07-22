/**
 * Tests for the exchange rate service and currency conversion helpers.
 */
import { describe, it, expect } from "vitest";
import { convertToInr, parsePriceString } from "./exchangeRate";

const MOCK_RATES: Record<string, number> = {
  USD: 84.5,
  EUR: 92.3,
  GBP: 107.1,
  AED: 23.0,
  SGD: 63.2,
};

describe("convertToInr", () => {
  it("converts USD to INR using the rate map", () => {
    const result = convertToInr(100, "USD", MOCK_RATES);
    expect(result).toBe(8450); // 100 * 84.5 = 8450, rounded
  });

  it("converts EUR to INR", () => {
    const result = convertToInr(200, "EUR", MOCK_RATES);
    expect(result).toBe(18460); // 200 * 92.3 = 18460
  });

  it("returns the same amount for INR (no conversion)", () => {
    const result = convertToInr(50000, "INR", MOCK_RATES);
    expect(result).toBe(50000);
  });

  it("returns null for unknown currency", () => {
    const result = convertToInr(100, "XYZ", MOCK_RATES);
    expect(result).toBeNull();
  });

  it("handles case-insensitive currency codes", () => {
    const result = convertToInr(1000, "usd", MOCK_RATES);
    expect(result).toBe(84500);
  });

  it("converts the exact bug case: $45,600 should not become ₹45,600", () => {
    // The bug: $45,600 was stored as ₹45,600 (number copied verbatim)
    // With conversion at ~84.5 rate, it should be ~₹38,52,000
    const result = convertToInr(45600, "USD", MOCK_RATES);
    expect(result).toBe(3853200); // 45600 * 84.5 = 3853200
    // Crucially, it must NOT equal 45600
    expect(result).not.toBe(45600);
  });
});

describe("parsePriceString", () => {
  it("parses dollar symbol prefix", () => {
    const result = parsePriceString("$45,600");
    expect(result).toEqual({ amount: 45600, currency: "USD" });
  });

  it("parses USD code prefix", () => {
    const result = parsePriceString("USD 45600");
    expect(result).toEqual({ amount: 45600, currency: "USD" });
  });

  it("parses INR rupee symbol", () => {
    const result = parsePriceString("₹1,20,000");
    expect(result).toEqual({ amount: 120000, currency: "INR" });
  });

  it("parses Rs. prefix", () => {
    const result = parsePriceString("Rs. 85000");
    expect(result).toEqual({ amount: 85000, currency: "INR" });
  });

  it("parses GBP pound symbol", () => {
    const result = parsePriceString("£2,500");
    expect(result).toEqual({ amount: 2500, currency: "GBP" });
  });

  it("parses EUR euro symbol", () => {
    const result = parsePriceString("€3,200");
    expect(result).toEqual({ amount: 3200, currency: "EUR" });
  });

  it("parses AED code prefix", () => {
    const result = parsePriceString("AED 12000");
    expect(result).toEqual({ amount: 12000, currency: "AED" });
  });

  it("treats plain number as INR", () => {
    const result = parsePriceString("50000");
    expect(result).toEqual({ amount: 50000, currency: "INR" });
  });

  it("returns null for empty string", () => {
    expect(parsePriceString("")).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(parsePriceString("call for price")).toBeNull();
  });
});
