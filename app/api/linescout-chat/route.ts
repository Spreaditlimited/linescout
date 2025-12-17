import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function safeReadJson(res: Response): Promise<any> {
  const text = await res.text().catch(() => "");

  if (!text || !text.trim()) {
    return { _emptyBody: true };
  }

  try {
    return JSON.parse(text);
  } catch {
    return { _nonJsonBody: text };
  }
}

function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function stripLeadingEquals(s: string): string {
  return s.replace(/^\s*=+\s*/, "").trim();
}

function tryUnwrapReplyTextFromString(raw: string): string | "" {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.includes("replyText")) return "";
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed?.replyText === "string" && parsed.replyText.trim()) {
      return stripLeadingEquals(parsed.replyText);
    }
  } catch {
    // ignore
  }
  return "";
}

function extractReply(data: any): string {
  // If n8n returned plain text (non-JSON), it may still be JSON-as-text.
  if (typeof data?._nonJsonBody === "string" && data._nonJsonBody.trim()) {
    const raw = data._nonJsonBody;
    const unwrapped = tryUnwrapReplyTextFromString(raw);
    return unwrapped || stripLeadingEquals(raw);
  }

  if (!data) return "";

  // Unwrap array
  if (Array.isArray(data)) data = data[0];

  // Unwrap n8n json wrapper
  if (data?.json && typeof data.json === "object") {
    const wrapped = extractReply(data.json);
    if (wrapped) return wrapped;
  }

  // Expected field from n8n
  if (isNonEmptyString(data.replyText)) return stripLeadingEquals(data.replyText);

  // Fallback common fields
  if (isNonEmptyString(data.reply)) return stripLeadingEquals(data.reply);
  if (isNonEmptyString(data.text)) return stripLeadingEquals(data.text);
  if (isNonEmptyString(data.message)) return stripLeadingEquals(data.message);
  if (isNonEmptyString(data.output)) return stripLeadingEquals(data.output);

  // Nested
  if (isNonEmptyString(data?.data?.replyText)) return stripLeadingEquals(data.data.replyText);

  // OpenAI-ish fallbacks
  if (isNonEmptyString(data?.choices?.[0]?.message?.content)) {
    return stripLeadingEquals(data.choices[0].message.content);
  }

  return "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(async () => {
      const raw = await req.text().catch(() => "");
      return { _rawBody: raw };
    });

    const baseUrl = process.env.N8N_BASE_URL || process.env.NEXT_PUBLIC_N8N_BASE_URL;

    if (!baseUrl) {
      return NextResponse.json(
        { ok: false, error: "LineScout backend is not configured (missing base URL)." },
        { status: 500 }
      );
    }

    const webhookUrl = `${baseUrl}/webhook/linescout_machine_chat`;

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await safeReadJson(res);

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: data?.error || data?.message || `n8n responded with HTTP ${res.status}`,
          debug: data,
        },
        { status: res.status || 500 }
      );
    }

    let replyText = extractReply(data);

    // If extractReply returned JSON-as-text, unwrap it again (double safety)
    const unwrapped = isNonEmptyString(replyText) ? tryUnwrapReplyTextFromString(replyText) : "";
    if (unwrapped) replyText = unwrapped;

    // Final safety: remove any leading "="
    replyText = stripLeadingEquals(replyText || "");

    if (!replyText) {
      return NextResponse.json(
        {
          ok: false,
          error: "LineScout returned no reply text.",
          debug: data,
        },
        { status: 500 }
      );
    }

    // Stream plain text
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const chunkSize = 40;
        let index = 0;

        function pushChunk() {
          if (index >= replyText.length) {
            controller.close();
            return;
          }
          const slice = replyText.slice(index, index + chunkSize);
          controller.enqueue(encoder.encode(slice));
          index += chunkSize;
          setTimeout(pushChunk, 25);
        }

        pushChunk();
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("linescout-chat route error:", err);

    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected error in LineScout chat route.",
        debug: {
          message: err?.message || String(err),
          name: err?.name,
          stack: err?.stack,
        },
      },
      { status: 500 }
    );
  }
}