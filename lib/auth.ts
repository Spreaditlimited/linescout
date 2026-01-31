// lib/auth.ts
import { queryOne } from "./db";
import type { RowDataPacket } from "mysql2/promise";

type UserRow = RowDataPacket & { id: number; email: string };

type StaffRow = RowDataPacket & {
  id: number;
  username: string;
  role: "admin" | "agent" | string;
  is_active: 0 | 1;
};

export async function requireUser(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!token) throw new Error("Unauthorized");

  const user = await queryOne<UserRow>(
    `SELECT u.id, u.email
     FROM users u
     JOIN linescout_user_sessions s ON s.user_id = u.id
     WHERE s.refresh_token_hash = SHA2(?, 256)
     LIMIT 1`,
    [token]
  );

  if (!user) throw new Error("Unauthorized");
  return { id: user.id, email: user.email };
}

/**
 * Staff auth for Agent App + Admin (role-based).
 * Agent app must send: Authorization: Bearer <internal_sessions.session_token>
 */
export async function requireAgent(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("Unauthorized");

  const staff = await queryOne<StaffRow>(
    `SELECT u.id, u.username, u.role, u.is_active
     FROM internal_sessions s
     JOIN internal_users u ON u.id = s.user_id
     WHERE s.session_token = ?
       AND s.revoked_at IS NULL
       AND u.is_active = 1
     LIMIT 1`,
    [token]
  );

  if (!staff) throw new Error("Unauthorized");

  const role = String(staff.role || "");
  if (role !== "admin" && role !== "agent") throw new Error("Unauthorized");

  // return shape compatible with existing routes
  return { id: Number(staff.id), name: String(staff.username || ""), role };
}