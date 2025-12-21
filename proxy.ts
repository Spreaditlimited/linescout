import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";

export const config = {
  matcher: ["/internal/:path*"],
};

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // allow auth endpoints
  if (pathname === "/internal/sign-in") return NextResponse.next();
  if (pathname.startsWith("/internal/auth/")) return NextResponse.next();
  if (pathname.startsWith("/api/internal/auth")) return NextResponse.next();

  const cookieName = (process.env.INTERNAL_AUTH_COOKIE_NAME ?? "").trim();
  if (!cookieName) return NextResponse.next();

  const token = req.cookies.get(cookieName)?.value;
  if (!token) return redirectToSignIn(req, pathname);

  const conn = await pool.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         u.id,
         u.role,
         COALESCE(p.can_view_leads, 0) AS can_view_leads,
         COALESCE(p.can_view_handoffs, 0) AS can_view_handoffs
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       LEFT JOIN internal_user_permissions p ON p.user_id = u.id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows.length) return redirectToSignIn(req, pathname);

    const role = String(rows[0].role || "");
    const canHandoffs = !!rows[0].can_view_handoffs;

    // RULE: Leads + Settings are admin-only, always.
    if (pathname.startsWith("/internal/leads") || pathname.startsWith("/internal/settings")) {
      if (role !== "admin") {
        return NextResponse.redirect(new URL("/internal/agent-handoffs", req.url));
      }
      return NextResponse.next();
    }

    // Handoffs still respects permissions for agents/admin
    if (pathname.startsWith("/internal/agent-handoffs")) {
      if (!canHandoffs) return redirectToSignIn(req, pathname);
      return NextResponse.next();
    }

    // default: allow other internal routes (if any later)
    return NextResponse.next();
  } finally {
    conn.release();
  }
}

function redirectToSignIn(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = "/internal/sign-in";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}