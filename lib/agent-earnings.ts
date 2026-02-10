import { ensureAgentPointsTable } from "@/lib/agent-points";

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getAgentEarningsSnapshot(conn: any, internalUserId: number) {
  await ensureAgentPointsTable(conn);
  const [creditRows]: any = await conn.query(
    `SELECT COALESCE(SUM(t.amount), 0) AS total_earned
     FROM linescout_wallet_transactions t
     JOIN linescout_wallets w ON w.id = t.wallet_id
     WHERE w.owner_type = 'agent'
       AND w.owner_id = ?
       AND t.type = 'credit'
       AND t.reason = 'agent_quote_commission'`,
    [internalUserId]
  );

  const [pointsRows]: any = await conn.query(
    `SELECT COALESCE(SUM(points), 0) AS total_points
     FROM linescout_agent_points
     WHERE agent_id = ?`,
    [internalUserId]
  );

  const [settingsRows]: any = await conn.query(
    `SELECT points_value_ngn
     FROM linescout_settings
     ORDER BY id DESC
     LIMIT 1`
  );

  const [paidRows]: any = await conn.query(
    `SELECT COALESCE(SUM(amount_kobo), 0) AS paid_kobo
     FROM linescout_agent_payout_requests
     WHERE internal_user_id = ?
       AND status = 'paid'`,
    [internalUserId]
  );

  const [lockedRows]: any = await conn.query(
    `SELECT COALESCE(SUM(amount_kobo), 0) AS locked_kobo
     FROM linescout_agent_payout_requests
     WHERE internal_user_id = ?
       AND status IN ('pending', 'approved')`,
    [internalUserId]
  );

  const commissionEarnedNgn = toNum(creditRows?.[0]?.total_earned);
  const pointsTotal = toNum(pointsRows?.[0]?.total_points);
  const pointsValueNgn = toNum(settingsRows?.[0]?.points_value_ngn);
  const pointsRewardNgn = Math.max(0, Number((pointsTotal * pointsValueNgn).toFixed(2)));
  const grossEarnedNgn = commissionEarnedNgn + pointsRewardNgn;
  const paidOutNgn = toNum(paidRows?.[0]?.paid_kobo) / 100;
  const lockedNgn = toNum(lockedRows?.[0]?.locked_kobo) / 100;
  const availableNgn = Math.max(0, grossEarnedNgn - paidOutNgn - lockedNgn);

  return {
    gross_earned_ngn: grossEarnedNgn,
    commission_earned_ngn: commissionEarnedNgn,
    points_reward_ngn: pointsRewardNgn,
    paid_out_ngn: paidOutNgn,
    locked_ngn: lockedNgn,
    available_ngn: availableNgn,
  };
}
