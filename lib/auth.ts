// lib/auth.ts
import { queryOne } from "./db";
import { RowDataPacket } from "mysql2/promise";

type UserRow = RowDataPacket & { id: number; email: string };


export async function requireUser(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!token) throw new Error("Unauthorized");

  // Example: adjust this SQL to match how your refresh token is stored/validated
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