function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getAgentEarningsSnapshot(conn: any, internalUserId: number) {
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

  const grossEarnedNgn = toNum(creditRows?.[0]?.total_earned);
  const paidOutNgn = toNum(paidRows?.[0]?.paid_kobo) / 100;
  const lockedNgn = toNum(lockedRows?.[0]?.locked_kobo) / 100;
  const availableNgn = Math.max(0, grossEarnedNgn - paidOutNgn - lockedNgn);

  return {
    gross_earned_ngn: grossEarnedNgn,
    paid_out_ngn: paidOutNgn,
    locked_ngn: lockedNgn,
    available_ngn: availableNgn,
  };
}

