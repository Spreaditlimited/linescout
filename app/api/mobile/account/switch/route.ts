import { NextResponse } from "next/server";
import { requireAccountUser } from "@/lib/auth";
import { setActiveAccountForUser } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

export async function POST(req: Request) {
  try {
    const user = await requireAccountUser(req);
    const body = await req.json().catch(() => ({}));
    const accountId = toInt(body?.account_id);
    if (!accountId) {
      return NextResponse.json({ ok: false, error: "account_id is required" }, { status: 400 });
    }
    if (accountId === Number(user.account_id)) {
      return NextResponse.json({ ok: false, error: "That account is already active." }, { status: 400 });
    }

    const ok = await setActiveAccountForUser(Number(user.id), accountId);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Account not found for this user." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, account_id: accountId });
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}
