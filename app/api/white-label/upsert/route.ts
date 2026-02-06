import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

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
    const user = await requireUser(req);

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

    const conn = await db.getConnection();
    try {
      // Fetch existing draft (latest)
      const [rows] = await conn.query<RowDataPacket[]>(
        `
        SELECT id, status
        FROM linescout_white_label_projects
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
        `,
        [user.id]
      );

      let projectId: number;

      if (!rows.length) {
        const [ins] = await conn.query<ResultSetHeader>(
          `
          INSERT INTO linescout_white_label_projects (user_id, step, status, handoff_id)
          VALUES (?, 1, 'draft', NULL)
          `,
          [user.id]
        );
        projectId = Number(ins.insertId);
      } else {
        projectId = Number(rows[0].id);
        // If it's paid, we shouldn't mutate it in MVP.
        if (String(rows[0].status) === "paid") {
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
        await conn.query(
          `
          UPDATE linescout_white_label_projects
          SET ${sets.join(", ")}
          WHERE id = ?
          `,
          params
        );
      }

      const [out] = await conn.query<RowDataPacket[]>(
        `
        SELECT *
        FROM linescout_white_label_projects
        WHERE id = ?
        LIMIT 1
        `,
        [projectId]
      );

      return NextResponse.json({ ok: true, project: out[0] });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const statusCode = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}
