type CreditCommissionInput = {
  quotePaymentId: number;
  quoteId: number;
  handoffId: number;
  purpose: string;
  amountNgn: number;
  currency?: string | null;
};

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function creditAgentCommissionForQuotePayment(conn: any, input: CreditCommissionInput) {
  const quotePaymentId = Number(input.quotePaymentId || 0);
  const quoteId = Number(input.quoteId || 0);
  const handoffId = Number(input.handoffId || 0);
  const amountNgn = num(input.amountNgn, 0);
  const purpose = String(input.purpose || "").trim().toLowerCase();
  const currency = String(input.currency || "NGN").trim().toUpperCase() || "NGN";

  if (!quotePaymentId || !quoteId || !handoffId || amountNgn <= 0) return;
  if (purpose === "shipping_payment") return;

  const [dupRows]: any = await conn.query(
    `SELECT id
     FROM linescout_wallet_transactions
     WHERE reference_type = 'quote_payment_commission'
       AND reference_id = ?
     LIMIT 1`,
    [String(quotePaymentId)]
  );
  if (dupRows?.length) return;

  const [agentRows]: any = await conn.query(
    `SELECT assigned_agent_id
     FROM linescout_conversations
     WHERE handoff_id = ?
       AND assigned_agent_id IS NOT NULL
     ORDER BY id DESC
     LIMIT 1`,
    [handoffId]
  );
  const agentId = Number(agentRows?.[0]?.assigned_agent_id || 0);
  if (!agentId) return;

  const [quoteRows]: any = await conn.query(
    `SELECT agent_percent
     FROM linescout_quotes
     WHERE id = ?
     LIMIT 1`,
    [quoteId]
  );
  let agentPercent = num(quoteRows?.[0]?.agent_percent, 0);
  if (agentPercent <= 0) {
    const [settingsRows]: any = await conn.query(
      `SELECT agent_percent
       FROM linescout_settings
       ORDER BY id DESC
       LIMIT 1`
    );
    agentPercent = num(settingsRows?.[0]?.agent_percent, 0);
  }
  if (agentPercent <= 0) return;

  const commissionAmount = Math.max(0, Number((amountNgn * (agentPercent / 100)).toFixed(2)));
  if (commissionAmount <= 0) return;

  const [walletRows]: any = await conn.query(
    `SELECT id, balance
     FROM linescout_wallets
     WHERE owner_type = 'agent' AND owner_id = ?
     LIMIT 1`,
    [agentId]
  );

  let walletId = Number(walletRows?.[0]?.id || 0);
  let balance = num(walletRows?.[0]?.balance, 0);
  if (!walletId) {
    const [ins]: any = await conn.query(
      `INSERT INTO linescout_wallets (owner_type, owner_id, currency, balance, status)
       VALUES ('agent', ?, ?, 0, 'active')`,
      [agentId, currency]
    );
    walletId = Number(ins?.insertId || 0);
    balance = 0;
  }

  const nextBalance = balance + commissionAmount;
  await conn.query(
    `INSERT INTO linescout_wallet_transactions
      (wallet_id, type, amount, currency, reason, reference_type, reference_id, meta_json)
     VALUES (?, 'credit', ?, ?, 'agent_quote_commission', 'quote_payment_commission', ?, ?)`,
    [
      walletId,
      commissionAmount,
      currency,
      String(quotePaymentId),
      JSON.stringify({
        quote_id: quoteId,
        handoff_id: handoffId,
        purpose,
        base_amount: amountNgn,
        agent_percent: agentPercent,
      }),
    ]
  );

  await conn.query(
    `UPDATE linescout_wallets
     SET balance = ?, updated_at = NOW()
     WHERE id = ?`,
    [nextBalance, walletId]
  );
}

