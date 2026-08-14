import { createHmac, timingSafeEqual } from "node:crypto";

export const NATIVE_LOCATION_TOKEN_TTL_SEC = 90 * 24 * 60 * 60;

export type NativeLocationTokenPayload = {
  v: 1;
  userId: string;
  ownerId: string;
  exp: number;
};

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf.toString("base64url");
}

function tokenSecret(): string {
  return (
    process.env.FAMILY_LOCATION_TOKEN_SECRET?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim() ||
    ""
  );
}

export function canSignNativeLocationToken(): boolean {
  return tokenSecret().length > 8;
}

export function signNativeLocationToken(input: {
  userId: string;
  ownerId: string;
  nowSec?: number;
}): string {
  const secret = tokenSecret();
  if (!secret) throw new Error("native location token secret missing");
  const payload: NativeLocationTokenPayload = {
    v: 1,
    userId: input.userId,
    ownerId: input.ownerId,
    exp: (input.nowSec ?? Math.floor(Date.now() / 1000)) + NATIVE_LOCATION_TOKEN_TTL_SEC,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyNativeLocationToken(
  token: string,
  nowSec = Math.floor(Date.now() / 1000),
): NativeLocationTokenPayload | null {
  const secret = tokenSecret();
  if (!secret || !token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as NativeLocationTokenPayload;
    if (payload.v !== 1 || !payload.userId || !payload.ownerId) return null;
    if (payload.exp <= nowSec) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || null;
}
