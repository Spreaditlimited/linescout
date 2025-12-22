// app/api/verify-sourcing-token/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const N8N_BASE_URL = process.env.N8N_BASE_URL;

type N8nValidateTokenResponse =
  | {
      ok: true;
      message?: string;
      email?: string | null;
      customer_name?: string | null;
      customer_phone?: string | null;
      tokenId?: number | string | null;
      type?: string | null;
      token?: string | null;
    }
  | {
      ok: false;
      error?: string;
      message?: string;
      [k: string]: any;
    };

export async function POST(req: NextRequest) {
  try {
    if (!N8N_BASE_URL) {
      return NextResponse.json(
        { ok: false, error: "N8N_BASE_URL is not configured on the server." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const type = typeof body?.type === "string" ? body.type.trim() : "";

    if (!token || type !== "sourcing") {
      return NextResponse.json(
        { ok: false, error: "Valid token and type=sourcing are required." },
        { status: 400 }
      );
    }

    const n8nResponse = await fetch(`${N8N_BASE_URL}/webhook/validate_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ token, type }),
    });

    const data = (await n8nResponse.json().catch(() => null)) as N8nValidateTokenResponse | null;

    if (!n8nResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "n8n workflow returned an error.",
          status: n8nResponse.status,
          details: data,
        },
        { status: 502 }
      );
    }

    if (!data || typeof data !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid response from n8n validate_token workflow." },
        { status: 502 }
      );
    }

    if ("ok" in data && data.ok === false) {
      return NextResponse.json(data, { status: 200 });
    }

    // Normalize fields for UI
    const email = typeof data.email === "string" ? data.email.trim() : "";
    const customer_name =
      typeof data.customer_name === "string" ? data.customer_name.trim() : "";
    const customer_phone =
      typeof data.customer_phone === "string" ? data.customer_phone.trim() : "";

    return NextResponse.json(
      {
        ok: true,
        message: (data as any).message || "Token is valid.",
        email,
        customer_name,
        customer_phone,
        tokenId: (data as any).tokenId ?? null,
        token: (data as any).token ?? token,
        type: (data as any).type ?? type,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "Unexpected server error.", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}