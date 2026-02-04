// app/api/linescout-handoffs/update-status/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import mysql from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Strict transition rules
const NEXT_ALLOWED: Record<string, string[]> = {
  pending: ["claimed", "cancelled"],
  claimed: ["manufacturer_found", "cancelled"],
  manufacturer_found: ["paid", "shipped", "cancelled"],
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

async function getInternalUser(conn: mysql.Connection) {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) return null;

  const h = await headers();
  const bearer = h.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const cookieHeader = h.get("cookie") || "";
  const cookieToken = (
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || ""
  );

  const token = headerToken || cookieToken;
  if (!token) return null;

  const [rows]: any = await conn.query(
    `
      SELECT u.id, u.username, u.role, u.is_active
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
    `,
    [token]
  );

  if (!rows?.length || !rows[0].is_active) return null;

  return {
    id: Number(rows[0].id),
    username: String(rows[0].username || ""),
    role: String(rows[0].role || ""),
  };
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
    let target = normStatus(body.status);

    // extras (optional)
    const shipper = typeof body.shipper === "string" ? body.shipper.trim() : "";
    const tracking_number =
      typeof body.tracking_number === "string" ? body.tracking_number.trim() : "";
    const cancel_reason =
      typeof body.cancel_reason === "string" ? body.cancel_reason.trim() : "";

    const manufacturer_name =
      typeof body.manufacturer_name === "string" ? body.manufacturer_name.trim() : "";
    const manufacturer_address =
      typeof body.manufacturer_address === "string" ? body.manufacturer_address.trim() : "";
    const manufacturer_contact_name =
      typeof body.manufacturer_contact_name === "string" ? body.manufacturer_contact_name.trim() : "";
    const manufacturer_contact_email =
      typeof body.manufacturer_contact_email === "string" ? body.manufacturer_contact_email.trim() : "";
    const manufacturer_contact_phone =
      typeof body.manufacturer_contact_phone === "string" ? body.manufacturer_contact_phone.trim() : "";
    const manufacturerUpdateOnly =
      body.manufacturer_update === true || String(body.manufacturer_update || "").toLowerCase() === "true";
    const hasManufacturerPayload =
      nonEmpty(manufacturer_name) ||
      nonEmpty(manufacturer_address) ||
      nonEmpty(manufacturer_contact_name) ||
      nonEmpty(manufacturer_contact_email) ||
      nonEmpty(manufacturer_contact_phone);

    // shipping_company_id (optional)
    const shipping_company_id = toOptionalPositiveInt(body.shipping_company_id);

    // bank_id (optional) - used when target === "paid"
    const bank_id = toOptionalPositiveInt(body.bank_id);

    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }
    if (!target && !manufacturerUpdateOnly) {
      return NextResponse.json({ ok: false, error: "Missing status" }, { status: 400 });
    }

    if (manufacturerUpdateOnly && !hasManufacturerPayload) {
      return NextResponse.json(
        { ok: false, error: "Manufacturer details are required" },
        { status: 400 }
      );
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
      "SELECT status, claimed_by, manufacturer_name, manufacturer_address, manufacturer_contact_name, manufacturer_contact_email, manufacturer_contact_phone FROM linescout_handoffs WHERE id = ? LIMIT 1",
      [id]
    );

    if (!rows || rows.length === 0) {
      await conn.end();
      return NextResponse.json({ ok: false, error: "Handoff not found" }, { status: 404 });
    }

    const current = normStatus(rows[0].status || "pending");
    const claimedBy = rows[0].claimed_by;
    const actor = await getInternalUser(conn);
    if (!target) target = current;

    let hasClaim = !!(claimedBy && String(claimedBy).trim() !== "");
    let assignedUsername: string | null = null;
    if (!hasClaim) {
      const [assignRows]: any = await conn.execute(
        `SELECT c.assigned_agent_id, u.username
         FROM linescout_conversations c
         LEFT JOIN internal_users u ON u.id = c.assigned_agent_id
         WHERE c.handoff_id = ?
           AND c.assigned_agent_id IS NOT NULL
         LIMIT 1`,
        [id]
      );
      if (assignRows?.length) {
        hasClaim = true;
        assignedUsername = assignRows[0].username ? String(assignRows[0].username) : null;
      }
    }

    const prevManufacturer = {
      manufacturer_name: rows[0].manufacturer_name ?? null,
      manufacturer_address: rows[0].manufacturer_address ?? null,
      manufacturer_contact_name: rows[0].manufacturer_contact_name ?? null,
      manufacturer_contact_email: rows[0].manufacturer_contact_email ?? null,
      manufacturer_contact_phone: rows[0].manufacturer_contact_phone ?? null,
    };

    // No changes allowed once delivered/cancelled
    if (current === "delivered" || current === "cancelled") {
      await conn.end();
      return NextResponse.json(
        { ok: false, error: `Cannot update a handoff that is ${current}.` },
        { status: 400 }
      );
    }

    // Must be claimed before updates (except cancel/pending)
    if (manufacturerUpdateOnly) {
      if (!hasClaim) {
        await conn.end();
        return NextResponse.json(
          { ok: false, error: "This project must be claimed before updating manufacturer details." },
          { status: 400 }
        );
      }
    } else if (target !== "cancelled" && target !== "pending") {
      if (!hasClaim) {
        await conn.end();
        return NextResponse.json(
          { ok: false, error: "This project must be claimed before updating milestones." },
          { status: 400 }
        );
      }
    }

    // Transition validation
    if (!manufacturerUpdateOnly) {
      const effectiveCurrent = current === "pending" && hasClaim ? "claimed" : current;
      const allowed = NEXT_ALLOWED[effectiveCurrent] ?? [];
      if (target !== effectiveCurrent && !allowed.includes(target)) {
        await conn.end();
        return NextResponse.json(
          { ok: false, error: `Invalid transition: ${effectiveCurrent} → ${target}` },
          { status: 400 }
        );
      }
    }

    if (target === "delivered") {
      const [shipPaidRows]: any = await conn.execute(
        `SELECT COALESCE(SUM(amount),0) AS paid
         FROM linescout_handoff_payments
         WHERE handoff_id = ?
           AND purpose = 'shipping_payment'`,
        [id]
      );
      const shipPaid = Number(shipPaidRows?.[0]?.paid || 0);
      if (!Number.isFinite(shipPaid) || shipPaid <= 0) {
        await conn.end();
        return NextResponse.json(
          { ok: false, error: "Shipping payment must be completed before marking delivered." },
          { status: 400 }
        );
      }
    }

    if (manufacturerUpdateOnly && (current === "delivered" || current === "cancelled")) {
      await conn.end();
      return NextResponse.json(
        { ok: false, error: `Cannot update manufacturer details when handoff is ${current}.` },
        { status: 400 }
      );
    }

    if (hasManufacturerPayload && !manufacturerUpdateOnly && target !== "manufacturer_found") {
      await conn.end();
      return NextResponse.json(
        { ok: false, error: "Use manufacturer_update to edit details without changing status." },
        { status: 400 }
      );
    }

    if (target === "manufacturer_found" || manufacturerUpdateOnly) {
      if (
        !nonEmpty(manufacturer_name) ||
        !nonEmpty(manufacturer_address) ||
        !nonEmpty(manufacturer_contact_name) ||
        !nonEmpty(manufacturer_contact_email) ||
        !nonEmpty(manufacturer_contact_phone)
      ) {
        await conn.end();
        return NextResponse.json(
          { ok: false, error: "Manufacturer name, address, contact person, email, and phone are required." },
          { status: 400 }
        );
      }
    }

    if (!manufacturerUpdateOnly) {
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
      if (actor?.role !== "admin") {
        await conn.end();
        return NextResponse.json(
          { ok: false, error: "Only admin can cancel a project." },
          { status: 403 }
        );
      }
      if (!nonEmpty(cancel_reason)) {
        await conn.end();
        return NextResponse.json({ ok: false, error: "Missing cancel_reason" }, { status: 400 });
      }
    }

    }

    // Build SQL update (status + timestamp fields + extra columns)
    const setParts: string[] = [];
    const params: any[] = [];

    const shouldWriteManufacturer =
      hasManufacturerPayload && (manufacturerUpdateOnly || target === "manufacturer_found");

    if (!manufacturerUpdateOnly) {
      setParts.push("status = ?");
      params.push(target);

      if (target === "manufacturer_found" && current !== "manufacturer_found") {
        setParts.push("manufacturer_found_at = NOW()");
      }

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
    }

    if (shouldWriteManufacturer) {
      setParts.push(
        "manufacturer_name = ?",
        "manufacturer_address = ?",
        "manufacturer_contact_name = ?",
        "manufacturer_contact_email = ?",
        "manufacturer_contact_phone = ?",
        "manufacturer_details_updated_at = NOW()"
      );
      params.push(
        manufacturer_name,
        manufacturer_address,
        manufacturer_contact_name,
        manufacturer_contact_email,
        manufacturer_contact_phone
      );

      if (actor?.id) {
        setParts.push("manufacturer_details_updated_by = ?");
        params.push(actor.id);
      } else {
        setParts.push("manufacturer_details_updated_by = NULL");
      }
    }

    if (!claimedBy && assignedUsername) {
      await conn.execute(
        `UPDATE linescout_handoffs
         SET claimed_by = ?, claimed_at = COALESCE(claimed_at, NOW())
         WHERE id = ?`,
        [assignedUsername, id]
      );
    }

    if (!setParts.length) {
      await conn.end();
      return NextResponse.json({ ok: false, error: "No updates provided" }, { status: 400 });
    }

    params.push(id);

    await conn.execute(`UPDATE linescout_handoffs SET ${setParts.join(", ")} WHERE id = ?`, params);

    if (shouldWriteManufacturer) {
      const manufacturerChanged =
        String(prevManufacturer.manufacturer_name || "") !== manufacturer_name ||
        String(prevManufacturer.manufacturer_address || "") !== manufacturer_address ||
        String(prevManufacturer.manufacturer_contact_name || "") !== manufacturer_contact_name ||
        String(prevManufacturer.manufacturer_contact_email || "") !== manufacturer_contact_email ||
        String(prevManufacturer.manufacturer_contact_phone || "") !== manufacturer_contact_phone;

      if (manufacturerChanged) {
        await conn.execute(
          `INSERT INTO linescout_handoff_manufacturer_audits
           (handoff_id, changed_by_id, changed_by_name, changed_by_role,
            previous_manufacturer_name, previous_manufacturer_address, previous_manufacturer_contact_name,
            previous_manufacturer_contact_email, previous_manufacturer_contact_phone,
            new_manufacturer_name, new_manufacturer_address, new_manufacturer_contact_name,
            new_manufacturer_contact_email, new_manufacturer_contact_phone, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            id,
            actor?.id ?? null,
            actor?.username ?? null,
            actor?.role ?? null,
            prevManufacturer.manufacturer_name ?? null,
            prevManufacturer.manufacturer_address ?? null,
            prevManufacturer.manufacturer_contact_name ?? null,
            prevManufacturer.manufacturer_contact_email ?? null,
            prevManufacturer.manufacturer_contact_phone ?? null,
            manufacturer_name,
            manufacturer_address,
            manufacturer_contact_name,
            manufacturer_contact_email,
            manufacturer_contact_phone,
          ]
        );
      }
    }

    // Fetch updated row for notification payload
    const [handoffRows] = await conn.execute<any[]>(
      `SELECT id, token, handoff_type, customer_name, email, whatsapp_number, context, status, claimed_by,
              manufacturer_found_at, paid_at, bank_id,
              manufacturer_name, manufacturer_address, manufacturer_contact_name,
              manufacturer_contact_email, manufacturer_contact_phone,
              manufacturer_details_updated_at, manufacturer_details_updated_by,
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
