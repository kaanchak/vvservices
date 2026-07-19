import { describe, expect, it } from "vitest";
import { calcPurityPrice } from "./goldPrice";

describe("calcPurityPrice", () => {
  it("returns 9kt price as 9/24 of 24kt price", () => {
    const base = 9600; // ₹9,600 per gram 24kt
    const result = calcPurityPrice(base, "9kt");
    expect(result).toBe(Math.round(base * (9 / 24)));
    expect(result).toBe(3600);
  });

  it("returns 14kt price as 14/24 of 24kt price", () => {
    const base = 9600;
    const result = calcPurityPrice(base, "14kt");
    expect(result).toBe(Math.round(base * (14 / 24)));
    expect(result).toBe(5600);
  });

  it("returns 18kt price as 18/24 of 24kt price", () => {
    const base = 9600;
    const result = calcPurityPrice(base, "18kt");
    expect(result).toBe(Math.round(base * (18 / 24)));
    expect(result).toBe(7200);
  });

  it("handles fractional base prices correctly", () => {
    const base = 7500.5;
    const result9 = calcPurityPrice(base, "9kt");
    const result14 = calcPurityPrice(base, "14kt");
    const result18 = calcPurityPrice(base, "18kt");
    expect(result9).toBe(Math.round(7500.5 * (9 / 24)));
    expect(result14).toBe(Math.round(7500.5 * (14 / 24)));
    expect(result18).toBe(Math.round(7500.5 * (18 / 24)));
  });

  it("9kt < 14kt < 18kt for any positive base", () => {
    const base = 8000;
    expect(calcPurityPrice(base, "9kt")).toBeLessThan(calcPurityPrice(base, "14kt"));
    expect(calcPurityPrice(base, "14kt")).toBeLessThan(calcPurityPrice(base, "18kt"));
  });
});

describe("gold price ounce to gram conversion", () => {
  it("converts ounce price to gram price correctly", () => {
    // 1 troy ounce = 31.1035 grams
    const pricePerOunce = 311035; // ₹311,035 per ounce (hypothetical)
    const pricePerGram = pricePerOunce / 31.1035;
    expect(Math.round(pricePerGram)).toBe(10000); // should be ₹10,000/gram
  });
});
