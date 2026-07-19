import { describe, expect, it } from "vitest";
import { normalizeWhatsappNumber } from "./whatsappAuth";

describe("normalizeWhatsappNumber", () => {
  it("keeps already-normalized E.164 numbers unchanged", () => {
    expect(normalizeWhatsappNumber("+919111130655")).toBe("+919111130655");
  });

  it("adds +91 prefix to 10-digit Indian numbers", () => {
    expect(normalizeWhatsappNumber("9111130655")).toBe("+919111130655");
  });

  it("handles 91-prefixed 12-digit numbers", () => {
    expect(normalizeWhatsappNumber("919111130655")).toBe("+919111130655");
  });

  it("handles 0-prefixed 11-digit numbers", () => {
    expect(normalizeWhatsappNumber("09111130655")).toBe("+919111130655");
  });

  it("strips spaces and dashes", () => {
    expect(normalizeWhatsappNumber("+91 91111 30655")).toBe("+919111130655");
  });

  it("strips parentheses and hyphens", () => {
    expect(normalizeWhatsappNumber("+91-9111-130655")).toBe("+919111130655");
  });

  it("handles international numbers with + prefix", () => {
    const result = normalizeWhatsappNumber("+12025551234");
    expect(result).toBe("+12025551234");
  });
});
