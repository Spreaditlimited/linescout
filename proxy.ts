import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import {
  type WebinarKind,
  verifyWebinarAccessToken,
  webinarAccessCookieName,
} from "@/lib/webinar-access";

export const config = {
  matcher: [
    "/internal/:path*",
    "/api/internal/:path*",
    "/affiliates",
    "/affiliates/:path*",
    "/white-label-webinar",
    "/machine-sourcing-webinar-video",
    "/agent-app/:path*",
    "/agents",
  ],
};

const pool = db;

type InternalAccessRow = RowDataPacket & {
  role: string;
  can_view_leads: number;
  can_view_handoffs: number;
  can_view_analytics: number;
};

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/agents" || pathname === "/agent-app" || pathname.startsWith("/agent-app/")) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
    return response;
  }

  if (pathname === "/white-label-webinar") {
    return handleWebinarAccess(req, "white-label", "/white-label-leads");
  }
  if (pathname === "/machine-sourcing-webinar-video") {
    return handleWebinarAccess(req, "machine-sourcing", "/machine-sourcing-webinar");
  }

  if (pathname.startsWith("/affiliates/")) {
    const segments = pathname.split("/").filter(Boolean);
    const slug = segments[1] || "";
    const reserved = new Set([
      "sign-in",
      "dashboard",
      "promotions",
      "referrals",
      "activity",
      "payouts",
      "payout-history",
    ]);

    if (segments.length === 2 && slug && !reserved.has(slug)) {
      const referral = slug.trim().toUpperCase();
      const url = req.nextUrl.clone();
      url.pathname = "/sign-in";
      const res = NextResponse.redirect(url);
      res.cookies.set({
        name: "linescout_affiliate_ref",
        value: referral,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
      });
      return res;
    }
  }

  if (!pathname.startsWith("/internal") && !pathname.startsWith("/api/internal")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/internal/")) {
    return handleInternalApi(req);
  }

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
    const [rows] = await conn.query<InternalAccessRow[]>(
      `SELECT
         u.id,
         u.role,
         COALESCE(p.can_view_leads, 0) AS can_view_leads,
         COALESCE(p.can_view_handoffs, 0) AS can_view_handoffs,
         COALESCE(p.can_view_analytics, 0) AS can_view_analytics
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

    const canLeads = role === "admin" || !!rows[0].can_view_leads;
    const canHandoffs = role === "admin" || !!rows[0].can_view_handoffs;
    const canAnalytics = role === "admin" || !!rows[0].can_view_analytics;

    // Settings stays admin-only
    if (pathname.startsWith("/internal/settings")) {
      if (role !== "admin") {
        return NextResponse.redirect(new URL("/internal/agent-handoffs", req.url));
      }
      return NextResponse.next();
    }

    // Leads: admin OR permission flag
    if (pathname.startsWith("/internal/leads")) {
      if (!canLeads) {
        return NextResponse.redirect(new URL("/internal/agent-handoffs", req.url));
      }
      return NextResponse.next();
    }

    // Analytics: admin OR permission flag
    if (pathname.startsWith("/internal/analytics")) {
      if (!canAnalytics) {
        return NextResponse.redirect(new URL("/internal/agent-handoffs", req.url));
      }
      return NextResponse.next();
    }

    // Handoffs: admin OR permission flag
    if (pathname.startsWith("/internal/agent-handoffs")) {
      if (!canHandoffs) return redirectToSignIn(req, pathname);
      return NextResponse.next();
    }

    return NextResponse.next();
  } finally {
    conn.release();
  }
}

function handleWebinarAccess(req: NextRequest, kind: WebinarKind, registrationPath: string) {
  const accessToken = req.nextUrl.searchParams.get("access")?.trim() || "";
  const cookieName = webinarAccessCookieName(kind);
  const cookieToken = req.cookies.get(cookieName)?.value || "";

  if (accessToken) {
    const access = verifyWebinarAccessToken(accessToken, kind);
    if (access) {
      const cleanUrl = req.nextUrl.clone();
      cleanUrl.searchParams.delete("access");
      const response = NextResponse.redirect(cleanUrl);
      response.cookies.set({
        name: cookieName,
        value: accessToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: Math.max(1, access.expiresAt - Math.floor(Date.now() / 1000)),
      });
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }

  if (cookieToken && verifyWebinarAccessToken(cookieToken, kind)) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }

  const registrationUrl = req.nextUrl.clone();
  registrationUrl.pathname = registrationPath;
  registrationUrl.search = "";
  registrationUrl.searchParams.set("access", "required");
  const response = NextResponse.redirect(registrationUrl);
  response.cookies.delete(cookieName);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function redirectToSignIn(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = "/internal/sign-in";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

function handleInternalApi(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/internal/admin/")) {
    return NextResponse.next();
  }

  const adminCookieName = (process.env.INTERNAL_AUTH_COOKIE_NAME || "linescout_admin_session").trim();
  const agentCookieName = (process.env.AGENT_AUTH_COOKIE_NAME || "linescout_agent_session").trim();

  const appHeader = String(req.headers.get("x-linescout-app") || "").toLowerCase();
  const referer = String(req.headers.get("referer") || "");
  const isAgent = appHeader === "agent" || referer.includes("/agent-app");

  if (!isAgent) return NextResponse.next();

  const agentToken = req.cookies.get(agentCookieName)?.value || "";
  if (!agentToken) return NextResponse.next();
  const cookieHeader = req.headers.get("cookie") || "";
  const filtered = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      const [name] = part.split("=");
      return name && name !== adminCookieName && name !== agentCookieName;
    });

  if (agentToken) {
    filtered.push(`${adminCookieName}=${agentToken}`);
  }

  const headers = new Headers(req.headers);
  headers.set("cookie", filtered.join("; "));

  return NextResponse.next({ request: { headers } });
}
