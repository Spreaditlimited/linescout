import { NextResponse } from "next/server";
import crypto from "crypto";
import mysql from "mysql2/promise";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function getDb() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!host || !user || !password || !database) {
    throw new Error("Missing DB env vars (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)");
  }

  return mysql.createConnection({ host, user, password, database });
}

async function getUserIdFromBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;

  const tokenHash = sha256(token);
  const conn = await getDb();

  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `
    SELECT u.id
    FROM linescout_user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.refresh_token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    LIMIT 1
    `,
    [tokenHash]
  );

  await conn.end();

  if (!rows.length) return null;
  return Number(rows[0].id);
}

const CATEGORIES = new Set([
  "Electronics",
  "Beauty",
  "Home Goods",
  "Fashion",
  "Food & Beverage",
  "Other",
]);
const QTIERS = new Set(["test", "scale"]);
const BRANDING = new Set(["logo", "packaging", "mould"]);

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromBearer(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    // Accept partial updates
    const step = body.step != null ? Number(body.step) : undefined;
    const status = body.status != null ? String(body.status) : undefined;

    const category = body.category != null ? String(body.category) : undefined;
    const productName = body.product_name != null ? String(body.product_name) : undefined;
    const productDesc = body.product_desc != null ? String(body.product_desc) : undefined;
    const referenceLink = body.reference_link != null ? String(body.reference_link) : undefined;
    const noLink = body.no_link != null ? Boolean(body.no_link) : undefined;

    const quantityTier = body.quantity_tier != null ? String(body.quantity_tier) : undefined;
    const brandingLevel = body.branding_level != null ? String(body.branding_level) : undefined;

    const targetNaira =
      body.target_landed_cost_naira != null ? Number(body.target_landed_cost_naira) : undefined;

    // Basic validation (lightweight, wizard enforces stronger UI checks)
    if (step !== undefined && (!Number.isFinite(step) || step < 1 || step > 5)) {
      return NextResponse.json({ ok: false, error: "Invalid step" }, { status: 400 });
    }
    if (status !== undefined && !["draft", "submitted", "paid"].includes(status)) {
      return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    }
    if (category !== undefined && category && !CATEGORIES.has(category)) {
      return NextResponse.json({ ok: false, error: "Invalid category" }, { status: 400 });
    }
    if (quantityTier !== undefined && quantityTier && !QTIERS.has(quantityTier)) {
      return NextResponse.json({ ok: false, error: "Invalid quantity tier" }, { status: 400 });
    }
    if (brandingLevel !== undefined && brandingLevel && !BRANDING.has(brandingLevel)) {
      return NextResponse.json({ ok: false, error: "Invalid branding level" }, { status: 400 });
    }
    if (targetNaira !== undefined && (!Number.isFinite(targetNaira) || targetNaira > 50_000_000)) {
      return NextResponse.json({ ok: false, error: "Invalid target cost" }, { status: 400 });
    }

    const conn = await getDb();

    // Fetch existing draft (latest)
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `
      SELECT id, status
      FROM linescout_white_label_projects
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [userId]
    );

    let projectId: number;

    if (!rows.length) {
      const [ins] = await conn.execute<mysql.ResultSetHeader>(
        `
        INSERT INTO linescout_white_label_projects (user_id, step, status)
        VALUES (?, 1, 'draft')
        `,
        [userId]
      );
      projectId = Number(ins.insertId);
    } else {
      projectId = Number(rows[0].id);
      // If it's paid, we shouldn't mutate it in MVP.
      if (String(rows[0].status) === "paid") {
        await conn.end();
        return NextResponse.json(
          { ok: false, error: "Project is locked after payment" },
          { status: 409 }
        );
      }
    }

    // Build update query dynamically
    const sets: string[] = [];
    const params: any[] = [];

    function setField(name: string, val: any) {
      sets.push(`${name} = ?`);
      params.push(val);
    }

    if (step !== undefined) setField("step", step);
    if (status !== undefined) setField("status", status);

    if (category !== undefined) setField("category", category || null);
    if (productName !== undefined) setField("product_name", productName || null);
    if (productDesc !== undefined) setField("product_desc", productDesc || null);
    if (referenceLink !== undefined) setField("reference_link", referenceLink || null);
    if (noLink !== undefined) setField("no_link", noLink ? 1 : 0);

    if (quantityTier !== undefined) setField("quantity_tier", quantityTier || null);
    if (brandingLevel !== undefined) setField("branding_level", brandingLevel || null);

    if (targetNaira !== undefined) setField("target_landed_cost_naira", targetNaira || null);

    if (sets.length) {
      params.push(projectId);
      await conn.execute(
        `
        UPDATE linescout_white_label_projects
        SET ${sets.join(", ")}
        WHERE id = ?
        `,
        params
      );
    }

    const [out] = await conn.execute<mysql.RowDataPacket[]>(
      `
      SELECT *
      FROM linescout_white_label_projects
      WHERE id = ?
      LIMIT 1
      `,
      [projectId]
    );

    await conn.end();

    return NextResponse.json({ ok: true, project: out[0] });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}