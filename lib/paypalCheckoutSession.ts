import { createHmac, timingSafeEqual } from 'node:crypto';

export type PayPalCheckoutSession = {
  orderId: string;
  amount: string;
  currency: string;
  description: string;
  returnPath: string;
  cancelPath: string;
  expiresAt: number;
};

function signature(payload: string) {
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!secret)
    throw new Error('Sure Imports PayPal checkout is not configured.');
  return createHmac('sha256', secret).update(`checkout-v1:${payload}`).digest();
}

export function signPayPalCheckoutSession(session: PayPalCheckoutSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${signature(payload).toString('base64url')}`;
}

export function readPayPalCheckoutSession(
  token: string,
  allowExpired = false,
): PayPalCheckoutSession {
  if (!token || token.length > 8000) throw new Error('Invalid checkout link.');
  const [payload, mac, extra] = token.split('.');
  if (!payload || !mac || extra) throw new Error('Invalid checkout link.');
  const received = Buffer.from(mac, 'base64url');
  const expected = signature(payload);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    throw new Error('Invalid checkout link.');
  }
  const session = JSON.parse(
    Buffer.from(payload, 'base64url').toString(),
  ) as PayPalCheckoutSession;
  if (
    !Number.isFinite(session.expiresAt) ||
    (!allowExpired && session.expiresAt <= Date.now())
  ) {
    throw new Error(
      'This checkout link has expired. Return to your order to try again.',
    );
  }
  for (const path of [session.returnPath, session.cancelPath]) {
    if (
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      path.startsWith('//') ||
      path.includes('\\')
    ) {
      throw new Error('Invalid checkout destination.');
    }
  }
  return session;
}

export function refreshPayPalCheckoutUrl(value: string) {
  const url = new URL(value);
  if (url.pathname !== '/checkout/paypal') return value; // Preserve legacy in-flight approvals.
  const session = readPayPalCheckoutSession(
    url.searchParams.get('session') || '',
    true,
  );
  url.searchParams.set(
    'session',
    signPayPalCheckoutSession({
      ...session,
      expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    }),
  );
  return url.toString();
}
