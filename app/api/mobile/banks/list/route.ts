import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaystackBank = {
  name?: string;
  code?: string;
  active?: boolean;
  is_deleted?: boolean;
};

type BankItem = { name: string; code: string };

function clean(s: any) {
  return String(s || "").trim();
}

async function paystackListBanks() {
  const secret = clean(process.env.PAYSTACK_SECRET_KEY);
  if (!secret) {
    return { ok: false as const, status: 500 as const, error: "Missing PAYSTACK_SECRET_KEY" };
  }

  const banks: BankItem[] = [];
  const seen = new Set<string>();
  let next = "";
  let guard = 0;

  do {
    const qs = new URLSearchParams({
      country: "nigeria",
      perPage: "100",
      use_cursor: "true",
      ...(next ? { next } : {}),
    }).toString();

    const res = await fetch(`https://api.paystack.co/bank?${qs}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const raw = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }

    if (!res.ok || !json?.status) {
      const msg = String(json?.message || raw || `Paystack list banks failed (${res.status})`);
      return { ok: false as const, status: 502 as const, error: msg };
    }

    const data = Array.isArray(json?.data) ? (json.data as PaystackBank[]) : [];
    for (const row of data) {
      const name = clean(row?.name);
      const code = clean(row?.code);
      if (!name || !code) continue;
      if (row?.active === false) continue;
      if (row?.is_deleted === true) continue;
      if (seen.has(code)) continue;
      seen.add(code);
      banks.push({ name, code });
    }

    next = clean(json?.meta?.next);
    guard += 1;
  } while (next && guard < 20);

  banks.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true as const, banks };
}

export async function GET(req: Request) {
  try {
    await requireUser(req);
    const list = await paystackListBanks();
    if (!list.ok) {
      return NextResponse.json({ ok: false, error: list.error }, { status: list.status });
    }
    return NextResponse.json({ ok: true, banks: list.banks });
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
