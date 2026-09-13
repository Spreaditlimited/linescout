import crypto from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

export const hashToken = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
export const newToken = () => crypto.randomBytes(32).toString("hex");
export function passwordError(value: unknown) {
  if (typeof value !== "string" || value.length < 15) return "Use at least 15 characters for your password.";
  if (value.length > 128) return "Use no more than 128 characters for your password.";
  return "";
}
export async function hashPassword(password: string) {
  return hash(password, { algorithm: 2 /* Argon2id; avoids ambient const-enum access in isolatedModules */, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}
export async function verifyPassword(encoded: string, password: string) {
  if (typeof password !== "string" || password.length > 128 || !encoded.startsWith("$argon2id$")) return false;
  try { return await verify(encoded, password); } catch { return false; }
}
export function normalizedEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}
export function authOriginAllowed(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const source = new URL(origin);
    const target = new URL(req.url);
    if (source.username || source.password || source.origin !== origin) return false;
    if (source.origin === target.origin) return true;
    // Next's local server can expose its bind address instead of the browser host.
    if (process.env.NODE_ENV !== "production" && source.host === req.headers.get("host")) {
      return source.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(source.hostname);
    }
    return false;
  } catch { return false; }
}
