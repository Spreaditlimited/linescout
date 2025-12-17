import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/internal/:path*"],
};

export default function proxy(req: NextRequest) {
  const user = (process.env.INTERNAL_USER ?? "").trim();
  const pass = (process.env.INTERNAL_PASS ?? "").trim();

  // Prevent lockout if env isn't set
  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = auth.split(" ");

  if (scheme === "Basic" && encoded) {
    try {
      const decoded = atob(encoded); // "username:password"
      const idx = decoded.indexOf(":");
      const u = (idx >= 0 ? decoded.slice(0, idx) : "").trim();
      const p = (idx >= 0 ? decoded.slice(idx + 1) : "").trim();

      if (u === user && p === pass) return NextResponse.next();
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="LineScout Internal"',
    },
  });
}