import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInternalSession() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const h = await headers();
  const bearer = h.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";
  const cookieHeader = h.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";

  const token = headerToken || cookieToken;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT u.id, u.role, u.is_active
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };

    return { ok: true as const, user: { id: Number(rows[0].id), role: String(rows[0].role || "") } };
  } finally {
    conn.release();
  }
}

function parseDateRange(url: URL) {
  const fromRaw = String(url.searchParams.get("from") || "").trim();
  const toRaw = String(url.searchParams.get("to") || "").trim();
  const from = fromRaw ? `${fromRaw} 00:00:00` : null;
  const to = toRaw ? `${toRaw} 23:59:59` : null;
  return { from, to };
}

function parseSort(url: URL) {
  const sort = String(url.searchParams.get("sort") || "desc").toLowerCase();
  return sort === "asc" ? "asc" : "desc";
}

function parsePagination(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("page_size") || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function parseStatus(url: URL) {
  const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
  if (status === "paid" || status === "unpaid" || status === "partial") return status;
  return "";
}

function toCsv(rows: Array<Record<string, any>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: any) => {
    const raw = value == null ? "" : String(value);
    if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
      return `"${raw.replace(/\"/g, "\"\"")}"`;
    }
    return raw;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

export async function GET(req: Request) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (auth.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const type = String(url.searchParams.get("type") || "quotes").trim().toLowerCase();
  const exportCsv = url.searchParams.get("export") === "1";
  const { from, to } = parseDateRange(url);
  const sort = parseSort(url);
  const statusFilter = parseStatus(url);
  const { page, pageSize, offset } = parsePagination(url);

  const conn = await db.getConnection();
  try {
    if (type === "vat") {
      const clauses: string[] = [];
      const params: any[] = [];
      if (from) {
        clauses.push("q.created_at >= ?");
        params.push(from);
      }
      if (to) {
        clauses.push("q.created_at <= ?");
        params.push(to);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const [rows]: any = await conn.query(
        `
        SELECT
          COALESCE(c.name, 'Unknown') AS country,
          q.vat_rate_percent AS vat_rate_percent,
          COUNT(*) AS quote_count,
          COALESCE(SUM(q.total_markup_ngn), 0) AS service_charge_ngn,
          COALESCE(SUM(q.total_addons_ngn), 0) AS addons_ngn,
          COALESCE(SUM(q.total_vat_ngn), 0) AS vat_ngn
        FROM linescout_quotes q
        LEFT JOIN linescout_countries c ON c.id = q.country_id
        ${where}
        GROUP BY COALESCE(c.name, 'Unknown'), q.vat_rate_percent
        ORDER BY country ASC, vat_rate_percent ASC
        `,
        params
      );

      if (exportCsv) {
        const csv = toCsv(rows || []);
        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename=\"vat-ledger.csv\"",
          },
        });
      }

      return NextResponse.json({ ok: true, rows: rows || [] });
    }

    if (type === "addons") {
      const clauses: string[] = ["l.is_removed = 0"];
      const params: any[] = [];
      if (from) {
        clauses.push("q.created_at >= ?");
        params.push(from);
      }
      if (to) {
        clauses.push("q.created_at <= ?");
        params.push(to);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const [rows]: any = await conn.query(
        `
        SELECT
          l.title,
          l.currency_code,
          COUNT(*) AS line_count,
          COALESCE(SUM(l.amount), 0) AS total_amount,
          (
            SELECT rate
            FROM linescout_fx_rates r
            WHERE r.base_currency_code = l.currency_code
              AND r.quote_currency_code = 'NGN'
            ORDER BY r.effective_at DESC, r.id DESC
            LIMIT 1
          ) AS fx_rate
        FROM linescout_quote_addon_lines l
        JOIN linescout_quotes q ON q.id = l.quote_id
        ${where}
        GROUP BY l.title, l.currency_code
        ORDER BY l.title ASC
        `
        ,
        params
      );

      const perTitle = new Map<string, { title: string; total_ngn: number; line_count: number; currencies: string[] }>();
      for (const row of rows || []) {
        const title = String(row.title || "").trim() || "Add-on";
        const code = String(row.currency_code || "NGN").toUpperCase();
        const amount = Number(row.total_amount || 0);
        const fx = Number(row.fx_rate || 0);
        const ngn = code === "NGN" ? amount : fx > 0 ? amount * fx : 0;
        const existing = perTitle.get(title) || { title, total_ngn: 0, line_count: 0, currencies: [] };
        existing.total_ngn += Number.isFinite(ngn) ? ngn : 0;
        existing.line_count += Number(row.line_count || 0);
        existing.currencies.push(`${code}:${amount.toFixed(2)}`);
        perTitle.set(title, existing);
      }

      let data = Array.from(perTitle.values()).map((row) => ({
        title: row.title,
        total_ngn: Number(row.total_ngn.toFixed(2)),
        line_count: row.line_count,
        currency_breakdown: row.currencies.join(", "),
      }));

      data = data.sort((a, b) => a.title.localeCompare(b.title));

      if (exportCsv) {
        const csv = toCsv(data);
        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename=\"add-ons-report.csv\"",
          },
        });
      }

      const total = data.length;
      const pageRows = data.slice(offset, offset + pageSize);
      return NextResponse.json({
        ok: true,
        rows: pageRows,
        pagination: { page, page_size: pageSize, total },
      });
    }

    if (type === "payments") {
      const clauses: string[] = [];
      const params: any[] = [];
      if (from) {
        clauses.push("p.created_at >= ?");
        params.push(from);
      }
      if (to) {
        clauses.push("p.created_at <= ?");
        params.push(to);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const [countRows]: any = await conn.query(
        `SELECT COUNT(*) AS total FROM linescout_quote_payments p ${where}`,
        params
      );
      const total = Number(countRows?.[0]?.total || 0);

      const [rows]: any = await conn.query(
        `
        SELECT
          p.id,
          p.quote_id,
          q.token AS quote_token,
          p.purpose,
          p.method,
          p.status,
          p.amount,
          p.currency,
          p.created_at,
          p.paid_at
        FROM linescout_quote_payments p
        LEFT JOIN linescout_quotes q ON q.id = p.quote_id
        ${where}
        ORDER BY p.created_at ${sort.toUpperCase()}
        LIMIT ? OFFSET ?
        `,
        [...params, pageSize, offset]
      );

      if (exportCsv) {
        const csv = toCsv(rows || []);
        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename=\"quote-payments.csv\"",
          },
        });
      }

      return NextResponse.json({
        ok: true,
        rows: rows || [],
        pagination: { page, page_size: pageSize, total },
      });
    }

    if (type === "shipping") {
      const clauses: string[] = [];
      const params: any[] = [];
      if (from) {
        clauses.push("q.created_at >= ?");
        params.push(from);
      }
      if (to) {
        clauses.push("q.created_at <= ?");
        params.push(to);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const statusClause = statusFilter ? `WHERE t.payment_status = ?` : "";

      const [countRows]: any = await conn.query(
        `
        SELECT COUNT(*) AS total
        FROM (
          SELECT
            q.id,
            CASE
              WHEN COALESCE(paid.total_paid, 0) >= COALESCE(q.total_due_ngn, 0) AND COALESCE(q.total_due_ngn, 0) > 0 THEN 'paid'
              WHEN COALESCE(paid.total_paid, 0) <= 0 THEN 'unpaid'
              ELSE 'partial'
            END AS payment_status
          FROM linescout_shipping_quotes q
          LEFT JOIN (
            SELECT shipping_quote_id, COALESCE(SUM(amount), 0) AS total_paid
            FROM linescout_shipping_quote_payments
            WHERE status = 'paid'
            GROUP BY shipping_quote_id
          ) paid ON paid.shipping_quote_id = q.id
          ${where}
        ) t
        ${statusClause}
        `,
        statusFilter ? [...params, statusFilter] : params
      );
      const total = Number(countRows?.[0]?.total || 0);

      const [rows]: any = await conn.query(
        `
        SELECT *
        FROM (
          SELECT
            q.id,
            q.token,
            q.created_at,
            COALESCE(c.name, 'Unknown') AS country,
            q.total_due_ngn,
            COALESCE(paid.total_paid, 0) AS total_paid,
            CASE
              WHEN COALESCE(paid.total_paid, 0) >= COALESCE(q.total_due_ngn, 0) AND COALESCE(q.total_due_ngn, 0) > 0 THEN 'paid'
              WHEN COALESCE(paid.total_paid, 0) <= 0 THEN 'unpaid'
              ELSE 'partial'
            END AS payment_status
          FROM linescout_shipping_quotes q
          LEFT JOIN linescout_countries c ON c.id = q.country_id
          LEFT JOIN (
            SELECT shipping_quote_id, COALESCE(SUM(amount), 0) AS total_paid
            FROM linescout_shipping_quote_payments
            WHERE status = 'paid'
            GROUP BY shipping_quote_id
          ) paid ON paid.shipping_quote_id = q.id
          ${where}
        ) t
        ${statusClause}
        ORDER BY created_at ${sort.toUpperCase()}
        LIMIT ? OFFSET ?
        `,
        statusFilter ? [...params, statusFilter, pageSize, offset] : [...params, pageSize, offset]
      );

      if (exportCsv) {
        const csv = toCsv(rows || []);
        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename=\"shipping-quotes.csv\"",
          },
        });
      }

      return NextResponse.json({
        ok: true,
        rows: rows || [],
        pagination: { page, page_size: pageSize, total },
      });
    }

    const clauses: string[] = [];
    const params: any[] = [];
    if (from) {
      clauses.push("q.created_at >= ?");
      params.push(from);
    }
    if (to) {
      clauses.push("q.created_at <= ?");
      params.push(to);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const statusClause = statusFilter ? `WHERE t.payment_status = ?` : "";

    const [countRows]: any = await conn.query(
      `
      SELECT COUNT(*) AS total
      FROM (
        SELECT
          q.id,
          CASE
            WHEN COALESCE(paid.total_paid, 0) >= COALESCE(q.total_due_ngn, 0) AND COALESCE(q.total_due_ngn, 0) > 0 THEN 'paid'
            WHEN COALESCE(paid.total_paid, 0) <= 0 THEN 'unpaid'
            ELSE 'partial'
          END AS payment_status
        FROM linescout_quotes q
        LEFT JOIN (
          SELECT quote_id, COALESCE(SUM(amount), 0) AS total_paid
          FROM linescout_quote_payments
          WHERE status = 'paid'
          GROUP BY quote_id
        ) paid ON paid.quote_id = q.id
        ${where}
      ) t
      ${statusClause}
      `,
      statusFilter ? [...params, statusFilter] : params
    );
    const total = Number(countRows?.[0]?.total || 0);

    const [rows]: any = await conn.query(
      `
      SELECT *
      FROM (
        SELECT
          q.id,
          q.token,
          q.created_at,
          COALESCE(c.name, 'Unknown') AS country,
          q.total_product_ngn,
          q.total_markup_ngn,
          q.total_addons_ngn,
          q.total_vat_ngn,
          q.total_due_ngn,
          q.vat_rate_percent,
          COALESCE(paid.total_paid, 0) AS total_paid,
          CASE
            WHEN COALESCE(paid.total_paid, 0) >= COALESCE(q.total_due_ngn, 0) AND COALESCE(q.total_due_ngn, 0) > 0 THEN 'paid'
            WHEN COALESCE(paid.total_paid, 0) <= 0 THEN 'unpaid'
            ELSE 'partial'
          END AS payment_status
        FROM linescout_quotes q
        LEFT JOIN linescout_countries c ON c.id = q.country_id
        LEFT JOIN (
          SELECT quote_id, COALESCE(SUM(amount), 0) AS total_paid
          FROM linescout_quote_payments
          WHERE status = 'paid'
          GROUP BY quote_id
        ) paid ON paid.quote_id = q.id
        ${where}
      ) t
      ${statusClause}
      ORDER BY created_at ${sort.toUpperCase()}
      LIMIT ? OFFSET ?
      `,
      statusFilter ? [...params, statusFilter, pageSize, offset] : [...params, pageSize, offset]
    );

    if (exportCsv) {
      const csv = toCsv(rows || []);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"quote-breakdown.csv\"",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      rows: rows || [],
      pagination: { page, page_size: pageSize, total },
    });
  } finally {
    conn.release();
  }
}
