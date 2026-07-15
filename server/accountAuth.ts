import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";

export const ACCOUNT_COOKIE = "vv_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type AccountSession = {
  accountId: number;
  role: "buyer" | "jeweller" | "admin";
};

function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret || "vvservices-dev-secret");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export async function signAccountSession(session: AccountSession): Promise<string> {
  return new SignJWT({ accountId: session.accountId, role: session.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS)
    .sign(getSecret());
}

export async function verifyAccountSession(
  token: string
): Promise<AccountSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const accountId = Number(payload.accountId);
    const role = payload.role as AccountSession["role"];
    if (!accountId || !["buyer", "jeweller", "admin"].includes(role)) return null;
    return { accountId, role };
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export async function getSessionFromRequest(
  req: Request
): Promise<AccountSession | null> {
  const cookies = parseCookies(req.headers.cookie as string | undefined);
  const token = cookies[ACCOUNT_COOKIE];
  if (!token) return null;
  return verifyAccountSession(token);
}

export async function setSessionCookie(
  req: Request,
  res: Response,
  session: AccountSession
): Promise<void> {
  const token = await signAccountSession(session);
  res.cookie(ACCOUNT_COOKIE, token, {
    ...getSessionCookieOptions(req),
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(ACCOUNT_COOKIE, { ...getSessionCookieOptions(req), maxAge: -1 });
}
