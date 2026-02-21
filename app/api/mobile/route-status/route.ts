import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  ensureCountryConfig,
  ensureUserCountryColumns,
  backfillUserDefaults,
} from "@/lib/country-config";
import { convertAmount } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

function isRouteType(x: string | null): x is RouteType {
  return x === "machine_sourcing" || x === "white_label" || x === "simple_sourcing";
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const routeType = url.searchParams.get("route_type");

    if (!isRouteType(routeType)) {
      return NextResponse.json({ ok: false, error: "Invalid route_type" }, { status: 400 });
    }

    const user = await requireUser(req);
    const userId = Number((user as any)?.id || 0);

    const conn = await db.getConnection();
    let conv: any = null;
    let paymentProvider: string | null = null;
    let settlementCurrency: string = "NGN";
    let displayCurrency: string = "NGN";
    try {
      await ensureCountryConfig(conn);
      await ensureUserCountryColumns(conn);
      await backfillUserDefaults(conn);

      const [countryRows]: any = await conn.query(
        `
        SELECT u.country_id, u.display_currency_code, c.payment_provider, c.settlement_currency_code
        FROM users u
        LEFT JOIN linescout_countries c ON c.id = u.country_id
        WHERE u.id = ?
        LIMIT 1
        `,
        [userId]
      );
      if (countryRows?.length) {
        paymentProvider = countryRows[0]?.payment_provider || null;
        settlementCurrency = String(countryRows[0]?.settlement_currency_code || "NGN").toUpperCase();
        displayCurrency = String(countryRows[0]?.display_currency_code || settlementCurrency || "NGN").toUpperCase();
      }

      const [rows]: any = await conn.query(
        `SELECT *
         FROM linescout_conversations
         WHERE user_id = ? AND route_type = ?
         LIMIT 1`,
        [userId, routeType]
      );

      conv = rows?.[0] || null;

      if (!conv) {
        const [ins]: any = await conn.query(
          `INSERT INTO linescout_conversations
            (user_id, route_type, chat_mode, human_message_limit, human_message_used, payment_status, project_status)
           VALUES
            (?, ?, 'ai_only', 0, 0, 'unpaid', 'active')`,
          [userId, routeType]
        );

        const id = Number(ins?.insertId || 0);
        if (!id) {
          return NextResponse.json(
            { ok: false, error: "Conversation could not be created" },
            { status: 500 }
          );
        }

        const [created]: any = await conn.query(
          `SELECT * FROM linescout_conversations WHERE id = ? LIMIT 1`,
          [id]
        );
        conv = created?.[0] || null;
      }
    } finally {
      conn.release();
    }

    if (!conv) {
      return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
    }
    const conversation_status = conv?.project_status ?? null;

    let commitmentDueNgn = 0;
    let commitmentDueAmount = 0;
    let commitmentCurrency = settlementCurrency || "NGN";
    const settingsConn = await db.getConnection();
    try {
      const [rows]: any = await settingsConn.query(
        "SELECT commitment_due_ngn FROM linescout_settings ORDER BY id DESC LIMIT 1"
      );
      const ngn = Number(rows?.[0]?.commitment_due_ngn || 0);
      if (Number.isFinite(ngn) && ngn > 0) commitmentDueNgn = ngn;
    } finally {
      settingsConn.release();
    }

    const fxConn = await db.getConnection();
    try {
      const converted = await convertAmount(fxConn, commitmentDueNgn, "NGN", displayCurrency || "NGN");
      if (converted && Number.isFinite(converted)) {
        commitmentDueAmount = converted;
        commitmentCurrency = displayCurrency || "NGN";
      } else {
        commitmentDueAmount = commitmentDueNgn;
        commitmentCurrency = "NGN";
      }
    } finally {
      fxConn.release();
    }

    return NextResponse.json(
      {
        ok: true,
        route_type: routeType,
        conversation_id: typeof conv?.id === "number" ? conv.id : null,
        chat_mode: conv?.chat_mode ?? null,
        payment_status: conv?.payment_status ?? null,
        conversation_status,
        handoff_id: conv?.handoff_id ?? null,
        has_active_project: Boolean(conv?.handoff_id && conversation_status === "active"),
        is_cancelled: conversation_status === "cancelled",
        commitment_due_ngn: commitmentDueNgn,
        commitment_due_amount: commitmentDueAmount,
        commitment_due_currency_code: commitmentCurrency,
        payment_provider: paymentProvider || (settlementCurrency === "GBP" ? "paypal" : "paystack"),
      },
      { status: 200 }
    );
  } catch (e: any) {
    const message = String(e?.message || "");
    if (message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
