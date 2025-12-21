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
    const { token, email, whatsapp_number, context } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ ok: false, error: "token is required" }, { status: 400 });
    }
    if (!email || typeof email !== "string") {
      return NextResponse.json({ ok: false, error: "email is required" }, { status: 400 });
    }
    if (!whatsapp_number || typeof whatsapp_number !== "string") {
      return NextResponse.json({ ok: false, error: "whatsapp_number is required" }, { status: 400 });
    }
    if (!context || typeof context !== "string") {
      return NextResponse.json({ ok: false, error: "context is required" }, { status: 400 });
    }

    // Forward to n8n: consume token + insert handoff + send WhatsApp
    const n8nResponse = await fetch(`${N8N_BASE_URL}/webhook/linescout_sourcing_handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: token.trim(),
        type: "sourcing",
        email: email.trim(),
        whatsapp_number: whatsapp_number.trim(),
        context: context.trim(),
      }),
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

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Unexpected server error." }, { status: 500 });
  }
}