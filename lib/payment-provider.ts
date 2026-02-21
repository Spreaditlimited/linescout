export type PaymentProvider = "paystack" | "providus" | "paypal";

function normalizeProvider(v: any): PaymentProvider | null {
  const s = String(v || "").trim().toLowerCase();
  if (s === "paystack" || s === "providus" || s === "paypal") return s;
  return null;
}

export async function selectPaymentProvider(conn: any, ownerType: "user" | "agent", ownerId: number) {
  let allowOverrides = true;
  let provider: PaymentProvider | null = null;

  const [settingsRows]: any = await conn.query(
    `SELECT provider_default, allow_overrides
     FROM linescout_payment_settings
     ORDER BY id DESC
     LIMIT 1`
  );
  if (settingsRows?.length) {
    provider = normalizeProvider(settingsRows[0]?.provider_default);
    allowOverrides = settingsRows[0]?.allow_overrides != null ? !!settingsRows[0]?.allow_overrides : true;
  }

  if (allowOverrides) {
    const [overrideRows]: any = await conn.query(
      `SELECT provider
       FROM linescout_payment_provider_overrides
       WHERE owner_type = ? AND owner_id = ?
       LIMIT 1`,
      [ownerType, ownerId]
    );
    const override = normalizeProvider(overrideRows?.[0]?.provider);
    if (override) provider = override;
  }

  if (!provider) provider = "paystack";

  return { provider, allowOverrides };
}
