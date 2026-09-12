function paystackReference(payload: any) {
  return String(
    payload?.data?.reference ||
      payload?.data?.transaction?.reference ||
      payload?.data?.metadata?.reference ||
      ""
  )
    .trim()
    .toUpperCase();
}

export function isLineScoutPaystackEvent(payload: unknown) {
  const data = (payload as any)?.data;
  const source = String(data?.metadata?.source || data?.metadata?.application || "")
    .trim()
    .toUpperCase();

  return source === "LINESCOUT" || /^LS(?:SQ|Q)?_/.test(paystackReference(payload));
}

export function shouldForwardPaystackEventToSureImports(event: string, payload: unknown) {
  const sharedEvent =
    event === "charge.success" ||
    event.startsWith("subscription.") ||
    event.startsWith("transfer.") ||
    event.startsWith("refund.") ||
    event.startsWith("charge.dispute.");

  return sharedEvent && !isLineScoutPaystackEvent(payload);
}
