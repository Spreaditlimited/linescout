import crypto from "node:crypto";

export type WebinarKind = "white-label" | "machine-sourcing";

type WebinarAccessPayload = {
  kind: WebinarKind;
  leadId: number;
  expiresAt: number;
};

const ACCESS_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

function accessSecret() {
  const secret = String(
    process.env.WEBINAR_ACCESS_SECRET || process.env.SMTP_PASS || process.env.CRON_SECRET || "",
  ).trim();
  if (!secret) throw new Error("Webinar access signing is not configured.");
  return secret;
}

function signatureFor(encodedPayload: string) {
  return crypto.createHmac("sha256", accessSecret()).update(encodedPayload).digest("base64url");
}

export function createWebinarAccessToken(kind: WebinarKind, leadId: number, now = new Date()) {
  const payload: WebinarAccessPayload = {
    kind,
    leadId,
    expiresAt: Math.floor(now.getTime() / 1000) + ACCESS_LIFETIME_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signatureFor(encodedPayload)}`;
}

export function verifyWebinarAccessToken(
  token: string,
  expectedKind: WebinarKind,
  now = new Date(),
): WebinarAccessPayload | null {
  try {
    const [encodedPayload, suppliedSignature, extra] = token.split(".");
    if (!encodedPayload || !suppliedSignature || extra) return null;
    const expectedSignature = signatureFor(encodedPayload);
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (
      payload?.kind !== expectedKind ||
      !Number.isSafeInteger(payload?.leadId) ||
      payload.leadId < 1 ||
      !Number.isSafeInteger(payload?.expiresAt) ||
      payload.expiresAt <= Math.floor(now.getTime() / 1000)
    ) {
      return null;
    }
    return payload as WebinarAccessPayload;
  } catch {
    return null;
  }
}

export function webinarAccessCookieName(kind: WebinarKind) {
  return kind === "white-label"
    ? "linescout_white_label_webinar_access"
    : "linescout_machine_webinar_access";
}

