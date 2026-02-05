type SmsResult = { ok: true } | { ok: false; skipped?: boolean; error: string; status?: number };

function isEnabled() {
  return String(process.env.SINCH_SMS_ENABLED || "").trim() === "1";
}

export async function sendSinchSms(opts: { to: string; body: string }): Promise<SmsResult> {
  if (!isEnabled()) return { ok: false, skipped: true, error: "SINCH_SMS_DISABLED" };

  const servicePlanId = String(process.env.SINCH_SMS_SERVICE_PLAN_ID || "").trim();
  const bearer = String(process.env.SINCH_SMS_BEARER_TOKEN || "").trim();
  const region = String(process.env.SINCH_SMS_REGION || "eu").trim();
  const from = String(process.env.SINCH_SMS_FROM || "").trim();

  if (!servicePlanId || !bearer) {
    return { ok: false, error: "Missing SINCH SMS env vars" };
  }

  const url = `https://${region}.sms.api.sinch.com/xms/v1/${servicePlanId}/batches`;
  const payload: any = {
    to: [opts.to],
    body: String(opts.body || "").trim(),
  };
  if (from) payload.from = from;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: text || "Sinch SMS failed" };
  }

  return { ok: true };
}
