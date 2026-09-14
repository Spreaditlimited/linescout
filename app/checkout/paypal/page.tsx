import type { Metadata } from 'next';
import Link from 'next/link';
import { readPayPalCheckoutSession } from '@/lib/paypalCheckoutSession';
import { paypalClientId } from '@/lib/paypal';
import ExpandedCheckout from './ExpandedCheckout';
import styles from './checkout.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Secure checkout',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function PayPalCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session: token } = await searchParams;
  let session;
  try {
    session = readPayPalCheckoutSession(token || '');
  } catch {
    return (
      <main className={styles.page}>
        <section className={styles.panel}>
          <p className={styles.eyebrow}>SURE IMPORTS</p>
          <h1>Checkout link unavailable</h1>
          <p>
            This link is invalid or has expired. Return to your order and start
            payment again.
          </p>
          <Link href="/">Return to dashboard</Link>
        </section>
      </main>
    );
  }
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>SURE IMPORTS · SECURE CHECKOUT</p>
        <h1>Pay securely by card</h1>
        <p>No PayPal account needed for card checkout.</p>
        <div className={styles.summary}>
          <span>{session.description}</span>
          <strong>
            {session.currency} {session.amount}
          </strong>
        </div>
        {paypalClientId() ? (
          <ExpandedCheckout
            session={session}
            clientId={paypalClientId()}
          />
        ) : (
          <p role="alert">
            Card checkout is not configured for this environment yet. Please try
            again shortly.
          </p>
        )}
        <Link className={styles.back} href={session.cancelPath}>
          Cancel and return
        </Link>
      </section>
    </main>
  );
}
