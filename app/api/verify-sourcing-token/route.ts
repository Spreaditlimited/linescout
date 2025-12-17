// app/api/verify-sourcing-token/route.ts
import { NextRequest, NextResponse } from "next/server";

const N8N_BASE_URL = process.env.N8N_BASE_URL;

export async function POST(req: NextRequest) {
  try {
    if (!N8N_BASE_URL) {
      return NextResponse.json(
        { ok: false, error: "N8N_BASE_URL is not configured on the server." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { token, type } = body;

    if (!token || !type || type !== "sourcing") {
      return NextResponse.json(
        { ok: false, error: "Valid token and type=sourcing are required." },
        { status: 400 }
      );
    }

    const n8nResponse = await fetch(`${N8N_BASE_URL}/webhook/validate_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, type }),
    });

    const data = await n8nResponse.json().catch(() => null);

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

    // n8n returns { ok, message, email?, tokenId? }
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Unexpected server error." },
      { status: 500 }
    );
  }
}