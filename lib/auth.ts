// lib/auth.ts
import { queryOne } from "./db";
import type { RowDataPacket } from "mysql2/promise";

type UserRow = RowDataPacket & { id: number; email: string };
type AgentRow = RowDataPacket & { id: number; name: string; is_active: 0 | 1 };

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
 * TEMP agent auth:
 * Your DB currently shows linescout_agents has no session/token column.
 * So for now, we accept Bearer <agent_id> (numeric) and verify agent is active.
 * This unblocks build + routes. When agent auth is finalized, we swap this.
 */
export async function requireAgent(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!raw) throw new Error("Unauthorized");

  const agentId = Number(raw);
  if (!Number.isFinite(agentId) || agentId <= 0) throw new Error("Unauthorized");

  const agent = await queryOne<AgentRow>(
    `SELECT id, name, is_active
     FROM linescout_agents
     WHERE id = ?
     LIMIT 1`,
    [agentId]
  );

  if (!agent || Number(agent.is_active) !== 1) throw new Error("Unauthorized");

  return { id: Number(agent.id), name: String(agent.name) };
}