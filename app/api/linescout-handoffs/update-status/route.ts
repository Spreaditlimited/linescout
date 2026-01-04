// app/api/linescout-handoffs/update-status/route.ts
import { NextResponse } from "next/server";
import mysql from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Strict transition rules
const NEXT_ALLOWED: Record<string, string[]> = {
  pending: ["claimed", "cancelled"],
  claimed: ["manufacturer_found", "cancelled"],
  manufacturer_found: ["paid", "cancelled"],
  paid: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

function normStatus(s: any) {
  return String(s || "").trim().toLowerCase();
}

function nonEmpty(v: any) {
  return typeof v === "string" && v.trim().length > 0;
}

function toOptionalPositiveInt(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || Number.isNaN(n)) return null;
  if (n <= 0) return null;
  return Math.floor(n);
}

async function safeNotifyN8n(payload: any) {
  const base = process.env.N8N_BASE_URL;
  if (!base) return { ok: false, error: "N8N_BASE_URL not set" };

  const url = `${base}/webhook/linescout_status_notify`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return { ok: false, status: res.status, details: data };
    }

    return { ok: true, details: data };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Notify failed" };
  }
}

export async function POST(req: Request) {
  let conn: mysql.Connection | null = null;

  try {
    const body = await req.json().catch(() => ({}));

    const id = Number(body.id);
    const target = normStatus(body.status);

    // extras (optional)
    const shipper = typeof body.shipper === "string" ? body.shipper.trim() : "";
    const tracking_number =
      typeof body.tracking_number === "string" ? body.tracking_number.trim() : "";
    const cancel_reason =
      typeof body.cancel_reason === "string" ? body.cancel_reason.trim() : "";

    // shipping_company_id (optional)
    const shipping_company_id = toOptionalPositiveInt(body.shipping_company_id);

    // bank_id (optional) - used when target === "paid"
    const bank_id = toOptionalPositiveInt(body.bank_id);

    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }
    if (!target) {
      return NextResponse.json({ ok: false, error: "Missing status" }, { status: 400 });
    }

    conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    });

    // Load current
    const [rows] = await conn.execute<any[]>(
      "SELECT status, claimed_by FROM linescout_handoffs WHERE id = ? LIMIT 1",
      [id]
    );

    if (!rows || rows.length === 0) {
      await conn.end();
      return NextResponse.json({ ok: false, error: "Handoff not found" }, { status: 404 });
    }

    const current = normStatus(rows[0].status || "pending");
    const claimedBy = rows[0].claimed_by;

    // No changes allowed once delivered/cancelled
    if (current === "delivered" || current === "cancelled") {
      await conn.end();
      return NextResponse.json(
        { ok: false, error: `Cannot update a handoff that is ${current}.` },
        { status: 400 }
      );
    }

    // Must be claimed before progressing beyond "claimed" (except cancel)
    if (target !== "cancelled" && target !== "pending") {
      if (!claimedBy || String(claimedBy).trim() === "") {
        await conn.end();
        return NextResponse.json(
          { ok: false, error: "This handoff must be claimed before updating milestones." },
          { status: 400 }
        );
      }
    }

    // Transition validation
    const allowed = NEXT_ALLOWED[current] ?? [];
    if (target !== current && !allowed.includes(target)) {
      await conn.end();
      return NextResponse.json(
        { ok: false, error: `Invalid transition: ${current} → ${target}` },
        { status: 400 }
      );
    }

    // Required fields validation for certain statuses
    if (target === "shipped") {
      // old UI sends shipper (text)
      // new UI sends shipping_company_id (preferred)
      if (!shipping_company_id && !nonEmpty(shipper)) {
        await conn.end();
        return NextResponse.json(
          { ok: false, error: "Missing shipping_company_id (preferred) or shipper (legacy)" },
          { status: 400 }
        );
      }

      if (!nonEmpty(tracking_number)) {
        await conn.end();
        return NextResponse.json({ ok: false, error: "Missing tracking_number" }, { status: 400 });
      }

      // If shipping_company_id is provided, validate it exists (and is_active=1)
      if (shipping_company_id) {
        const [scRows] = await conn.execute<any[]>(
          `SELECT id, name, is_active
           FROM linescout_shipping_companies
           WHERE id = ?
           LIMIT 1`,
          [shipping_company_id]
        );

        if (!scRows || scRows.length === 0) {
          await conn.end();
          return NextResponse.json(
            { ok: false, error: "Invalid shipping_company_id" },
            { status: 400 }
          );
        }

        if (!scRows[0].is_active) {
          await conn.end();
          return NextResponse.json(
            { ok: false, error: "Selected shipping company is inactive" },
            { status: 400 }
          );
        }
      }
    }

    // Validate bank only when provided (keeps backward compatibility)
    if (target === "paid" && bank_id) {
      const [bRows] = await conn.execute<any[]>(
        `SELECT id, name, is_active
         FROM linescout_banks
         WHERE id = ?
         LIMIT 1`,
        [bank_id]
      );

      if (!bRows || bRows.length === 0) {
        await conn.end();
        return NextResponse.json({ ok: false, error: "Invalid bank_id" }, { status: 400 });
      }

      // If your banks table has is_active, enforce it (safe even if column exists)
      if (typeof bRows[0].is_active !== "undefined" && !bRows[0].is_active) {
        await conn.end();
        return NextResponse.json(
          { ok: false, error: "Selected bank is inactive" },
          { status: 400 }
        );
      }
    }

    if (target === "cancelled") {
      if (!nonEmpty(cancel_reason)) {
        await conn.end();
        return NextResponse.json({ ok: false, error: "Missing cancel_reason" }, { status: 400 });
      }
    }

    // Build SQL update (status + timestamp fields + extra columns)
    const setParts: string[] = ["status = ?"];
    const params: any[] = [target];

    if (target === "manufacturer_found") setParts.push("manufacturer_found_at = NOW()");

    if (target === "paid") {
      setParts.push("paid_at = NOW()");

      // NEW: bank_id support
      if (bank_id) {
        setParts.push("bank_id = ?");
        params.push(bank_id);
      } else {
        // Avoid keeping an old bank_id if a user marks paid without selecting one
        setParts.push("bank_id = NULL");
      }
    }

    if (target === "shipped") {
      setParts.push("shipped_at = NOW()");
      setParts.push("tracking_number = ?");
      params.push(tracking_number);

      if (shipping_company_id) {
        setParts.push("shipping_company_id = ?");
        params.push(shipping_company_id);

        // Keep shipper text populated for readability / backward compatibility
        if (!nonEmpty(shipper)) {
          const [scRows] = await conn.execute<any[]>(
            `SELECT name FROM linescout_shipping_companies WHERE id = ? LIMIT 1`,
            [shipping_company_id]
          );
          const name = scRows?.[0]?.name ? String(scRows[0].name) : "";
          if (nonEmpty(name)) {
            setParts.push("shipper = ?");
            params.push(name.trim());
          }
        } else {
          setParts.push("shipper = ?");
          params.push(shipper);
        }
      } else {
        setParts.push("shipper = ?");
        params.push(shipper);
        setParts.push("shipping_company_id = NULL");
      }
    }

    if (target === "delivered") setParts.push("delivered_at = NOW()");
    if (target === "cancelled") {
      setParts.push("cancelled_at = NOW()");
      setParts.push("cancel_reason = ?");
      params.push(cancel_reason);
    }

    params.push(id);

    await conn.execute(`UPDATE linescout_handoffs SET ${setParts.join(", ")} WHERE id = ?`, params);

    // Fetch updated row for notification payload
    const [handoffRows] = await conn.execute<any[]>(
      `SELECT id, token, handoff_type, customer_name, email, whatsapp_number, context, status, claimed_by,
              manufacturer_found_at, paid_at, bank_id,
              shipped_at, shipping_company_id, shipper, tracking_number,
              delivered_at, cancelled_at, cancel_reason, created_at
       FROM linescout_handoffs
       WHERE id = ? LIMIT 1`,
      [id]
    );

    await conn.end();
    conn = null;

    const handoff = handoffRows?.[0] || null;

    const notifyResult = handoff
      ? await safeNotifyN8n({
          event: "handoff.status_changed",
          handoff,
          previous_status: current,
          new_status: target,
          extras:
            target === "shipped"
              ? { shipping_company_id, shipper: shipper || handoff?.shipper, tracking_number }
              : target === "paid"
              ? { bank_id: handoff?.bank_id ?? bank_id ?? null }
              : target === "cancelled"
              ? { cancel_reason }
              : {},
        })
      : { ok: false, error: "Could not load updated handoff row" };

    return NextResponse.json({
      ok: true,
      notified: notifyResult.ok === true,
      notify_error: notifyResult.ok ? null : notifyResult,
    });
  } catch (err: any) {
    console.error("update-status error:", err);
    try {
      if (conn) await conn.end();
    } catch {}
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to update status" },
      { status: 500 }
    );
  }
}