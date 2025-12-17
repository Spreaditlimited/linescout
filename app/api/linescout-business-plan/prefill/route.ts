import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const N8N_BASE_URL = process.env.N8N_BASE_URL;

export async function POST(req: NextRequest) {
  try {
    if (!N8N_BASE_URL) {
      return NextResponse.json(
        { ok: false, error: "N8N_BASE_URL is not configured." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = (body?.sessionId || "").trim();
    const messages = body?.messages;

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: "sessionId is required." },
        { status: 400 }
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { ok: false, error: "messages[] is required." },
        { status: 400 }
      );
    }

    // 1) Ask n8n to extract intake from the chat
    const n8nRes = await fetch(
      `${N8N_BASE_URL}/webhook/linescout_business_plan_intake_extract`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, messages }),
      }
    );

    const n8nData = await n8nRes.json().catch(() => null);

    if (!n8nRes.ok || !n8nData?.ok || !n8nData?.intake) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to extract intake from chat.",
          details: n8nData,
        },
        { status: 502 }
      );
    }

    const intake = n8nData.intake;

    // 2) Save intake into linescout_sessions via your intake endpoint
    const saveRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/linescout-sessions/business-plan-intake`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, intake }),
      }
    );

    const saveData = await saveRes.json().catch(() => ({}));

    if (!saveRes.ok || !saveData.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Extracted intake but failed to save to session.",
          details: saveData,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, intake }, { status: 200 });
  } catch (err: any) {
    console.error("Business plan prefill error:", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error." },
      { status: 500 }
    );
  }
}