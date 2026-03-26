import crypto from "crypto";

type ProvidusStatus = "settled" | "pending" | "failed" | "unknown";

export type ProvidusLiveTransaction = {
  settlementId: string | null;
  sessionId: string | null;
  accountNumber: string | null;
  amount: number | null;
  settledAmount: number | null;
  feeAmount: number | null;
  currency: string | null;
  status: ProvidusStatus;
  rawStatus: string | null;
  raw: any;
};

export function getProvidusConfig() {
  const baseUrl = String(process.env.PROVIDUS_BASE_URL || "").trim();
  const clientId = String(process.env.PROVIDUS_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.PROVIDUS_CLIENT_SECRET || "").trim();

  if (!baseUrl || !clientId || !clientSecret) {
    return {
      ok: false as const,
      error: "Missing PROVIDUS_BASE_URL/PROVIDUS_CLIENT_ID/PROVIDUS_CLIENT_SECRET",
    };
  }

  return { ok: true as const, baseUrl, clientId, clientSecret };
}

export function providusSignature(clientId: string, clientSecret: string) {
  return crypto.createHash("sha512").update(`${clientId}:${clientSecret}`).digest("hex");
}

export function providusHeaders() {
  const cfg = getProvidusConfig();
  if (!cfg.ok) return cfg;

  const sig = providusSignature(cfg.clientId, cfg.clientSecret);
  return {
    ok: true as const,
    headers: {
      "Content-Type": "application/json",
      "Client-Id": cfg.clientId,
      "X-Auth-Signature": sig,
    },
  };
}

export function normalizeProvidusBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function toObj(v: any): any {
  return v && typeof v === "object" ? v : null;
}

function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickStr(obj: any, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const raw = obj?.[k];
    const s = String(raw ?? "").trim();
    if (s) return s;
  }
  return null;
}

function classifyProvidusStatus(raw: any): ProvidusStatus {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "unknown";

  if (
    s.includes("settled") ||
    s.includes("success") ||
    s.includes("paid") ||
    s.includes("complete") ||
    s === "00"
  ) {
    return "settled";
  }
  if (s.includes("pending") || s.includes("process") || s.includes("in progress") || s.includes("await")) {
    return "pending";
  }
  if (s.includes("fail") || s.includes("reject") || s.includes("declin") || s === "99") {
    return "failed";
  }
  return "unknown";
}

function normalizeLiveTransaction(raw: any): ProvidusLiveTransaction | null {
  const obj = toObj(raw);
  if (!obj) return null;

  const settlementId = pickStr(obj, ["settlementId", "settlement_id", "settlementReference", "reference"]);
  const sessionId = pickStr(obj, ["sessionId", "session_id", "sessionRef"]);
  const accountNumber = pickStr(obj, ["accountNumber", "account_number", "destinationAccountNumber"]);
  const amount = toNum(obj?.transactionAmount ?? obj?.amount ?? obj?.amountPaid ?? obj?.paidAmount);
  const settledAmount = toNum(obj?.settledAmount ?? obj?.settlementAmount ?? obj?.netAmount);
  const feeAmount = toNum(obj?.feeAmount ?? obj?.fee ?? obj?.charges);
  const currency = pickStr(obj, ["currency", "currencyCode"]);
  const rawStatus =
    pickStr(obj, ["transactionStatus", "status", "paymentStatus", "settlementStatus"]) ||
    pickStr(obj?.data, ["transactionStatus", "status", "paymentStatus", "settlementStatus"]) ||
    pickStr(obj, ["responseCode", "code"]);

  let status = classifyProvidusStatus(rawStatus);
  if (status === "unknown") {
    const msg = pickStr(obj, ["responseMessage", "message", "statusMessage"]);
    status = classifyProvidusStatus(msg);
  }

  if (!settlementId && !sessionId && !accountNumber && amount == null && settledAmount == null && !rawStatus) {
    return null;
  }

  return {
    settlementId,
    sessionId,
    accountNumber,
    amount,
    settledAmount,
    feeAmount,
    currency,
    status,
    rawStatus,
    raw: obj,
  };
}

function extractTransactions(payload: any): ProvidusLiveTransaction[] {
  const candidates: any[] = [];
  const root = toObj(payload);
  if (!root) return [];

  candidates.push(root);

  const maybeData = root?.data;
  if (Array.isArray(maybeData)) candidates.push(...maybeData);
  else if (toObj(maybeData)) {
    candidates.push(maybeData);
    if (Array.isArray(maybeData.transactions)) candidates.push(...maybeData.transactions);
    if (Array.isArray(maybeData.items)) candidates.push(...maybeData.items);
    if (Array.isArray(maybeData.results)) candidates.push(...maybeData.results);
  }

  if (Array.isArray(root.transactions)) candidates.push(...root.transactions);
  if (Array.isArray(root.items)) candidates.push(...root.items);
  if (Array.isArray(root.results)) candidates.push(...root.results);

  const seen = new Set<string>();
  const normalized: ProvidusLiveTransaction[] = [];
  for (const c of candidates) {
    const n = normalizeLiveTransaction(c);
    if (!n) continue;
    const key = `${n.settlementId || ""}|${n.sessionId || ""}|${n.accountNumber || ""}|${n.amount ?? ""}|${n.settledAmount ?? ""}|${n.rawStatus || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(n);
  }
  return normalized;
}

function statusPathsFromEnv(): string[] {
  const raw = String(process.env.PROVIDUS_LIVE_STATUS_PATHS || process.env.PROVIDUS_LIVE_STATUS_PATH || "").trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.startsWith("/") ? s.slice(1) : s));
  }

  return [
    "PiPTransactionStatusEnquiry",
    "PiPTransactionEnquiry",
    "PiPTransactionStatusInquiry",
    "PiPTransactionInquiry",
    "PiPGetTransactionStatus",
  ];
}

export async function queryProvidusLiveStatus(input: {
  accountNumber?: string | null;
  sessionId?: string | null;
  settlementId?: string | null;
  amount?: number | null;
}) {
  const cfg = getProvidusConfig();
  if (!cfg.ok) return { ok: false as const, error: cfg.error };

  const headersRes = providusHeaders();
  if (!headersRes.ok) return { ok: false as const, error: headersRes.error };

  const base = normalizeProvidusBaseUrl(cfg.baseUrl);
  const paths = statusPathsFromEnv();

  const accountNumber = String(input.accountNumber || "").trim();
  const sessionId = String(input.sessionId || "").trim();
  const settlementId = String(input.settlementId || "").trim();
  const amount = Number.isFinite(Number(input.amount)) ? Number(input.amount) : null;

  const payloads = [
    { sessionId, settlementId, accountNumber, amount },
    { settlementId, sessionId, accountNumber },
    { sessionId, accountNumber },
    { settlementId, accountNumber },
    { accountNumber, amount },
    { accountNumber },
  ].map((obj) => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) continue;
      if (typeof v === "string" && !v.trim()) continue;
      out[k] = v;
    }
    return out;
  });

  let lastErr = "Providus live status query failed";
  const tried: string[] = [];

  for (const path of paths) {
    const url = `${base}/${path}`;

    for (const payload of payloads) {
      if (!Object.keys(payload).length) continue;
      tried.push(`${path}:${Object.keys(payload).join("+")}`);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: headersRes.headers,
          body: JSON.stringify(payload),
          cache: "no-store",
        });

        const rawText = await res.text();
        let json: any = null;
        try {
          json = rawText ? JSON.parse(rawText) : null;
        } catch {
          json = null;
        }

        if (res.status === 404) continue;

        if (!res.ok) {
          const msg = String(json?.responseMessage || json?.message || rawText || `HTTP ${res.status}`).trim();
          lastErr = msg || lastErr;
          continue;
        }

        const responseCode = String(json?.responseCode ?? "").trim();
        const requestSuccessful = json?.requestSuccessful;
        if (requestSuccessful === false && responseCode && responseCode !== "00") {
          const msg = String(json?.responseMessage || "").trim();
          lastErr = msg || `Providus response code ${responseCode}`;
          continue;
        }

        const transactions = extractTransactions(json);
        if (!transactions.length) {
          const top = normalizeLiveTransaction(json);
          if (top) transactions.push(top);
        }

        return {
          ok: true as const,
          endpoint: path,
          payloadUsed: payload,
          raw: json,
          transactions,
        };
      } catch (e: any) {
        lastErr = String(e?.message || lastErr);
      }
    }
  }

  return {
    ok: false as const,
    error: lastErr,
    tried,
  };
}
