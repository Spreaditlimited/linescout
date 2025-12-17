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

export async function POST(req: Request) {
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

    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }
    if (!target) {
      return NextResponse.json({ ok: false, error: "Missing status" }, { status: 400 });
    }

    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    });

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
      if (!nonEmpty(shipper)) {
        await conn.end();
        return NextResponse.json({ ok: false, error: "Missing shipper" }, { status: 400 });
      }
      if (!nonEmpty(tracking_number)) {
        await conn.end();
        return NextResponse.json(
          { ok: false, error: "Missing tracking_number" },
          { status: 400 }
        );
      }
    }

    if (target === "cancelled") {
      if (!nonEmpty(cancel_reason)) {
        await conn.end();
        return NextResponse.json(
          { ok: false, error: "Missing cancel_reason" },
          { status: 400 }
        );
      }
    }

    // Build SQL update (status + timestamp fields + extra columns)
    const setParts: string[] = ["status = ?"];
    const params: any[] = [target];

    if (target === "manufacturer_found") setParts.push("manufacturer_found_at = NOW()");
    if (target === "paid") setParts.push("paid_at = NOW()");
    if (target === "shipped") {
      setParts.push("shipped_at = NOW()");
      setParts.push("shipper = ?");
      setParts.push("tracking_number = ?");
      params.push(shipper, tracking_number);
    }
    if (target === "delivered") setParts.push("delivered_at = NOW()");
    if (target === "cancelled") {
      setParts.push("cancelled_at = NOW()");
      setParts.push("cancel_reason = ?");
      params.push(cancel_reason);
    }

    params.push(id);

    await conn.execute(
      `UPDATE linescout_handoffs SET ${setParts.join(", ")} WHERE id = ?`,
      params
    );

    await conn.end();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("update-status error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to update status" },
      { status: 500 }
    );
  }
}