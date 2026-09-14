'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import type { PayPalCheckoutSession } from '@/lib/paypalCheckoutSession';
import styles from './checkout.module.css';

type Field = { render: (selector: string) => Promise<void> };
type CardForm = {
  isEligible: () => boolean;
  NameField: () => Field;
  NumberField: () => Field;
  ExpiryField: () => Field;
  CVVField: () => Field;
  submit: (options?: {
    billingAddress: Record<string, string>;
  }) => Promise<void>;
  close?: () => void;
};
type PayPalSdk = {
  CardFields: (options: Record<string, unknown>) => CardForm;
  Buttons: (options: Record<string, unknown>) => {
    render: (selector: string) => Promise<void>;
    close: () => void;
  };
};

export default function ExpandedCheckout({
  session,
  clientId,
}: {
  session: PayPalCheckoutSession;
  clientId: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [cardsAvailable, setCardsAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [countries, setCountries] = useState<
    Array<{ code: string; label: string }>
  >([]);
  const cardRef = useRef<CardForm | null>(null);
  const params = new URLSearchParams({
    'client-id': clientId,
    components: 'card-fields,buttons',
    currency: session.currency,
    intent: 'capture',
  });

  useEffect(() => {
    if (!loaded) return;
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    const codes =
      'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
        ' ',
      );
    setCountries(
      codes
        .map((code) => ({ code, label: `${names.of(code)} (${code})` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    );
    const sdk = (window as unknown as { sureImportsPayPal?: PayPalSdk })
      .sureImportsPayPal;
    if (!sdk) return;
    let cancelled = false;
    const approve = () => {
      setBusy(true);
      // The existing service-specific return page verifies/captures on the server.
      // Approval alone never marks an order paid.
      const target = new URL(session.returnPath, window.location.origin);
      target.searchParams.set('token', session.orderId);
      window.location.assign(target.toString());
    };
    const fail = () => {
      if (cancelled) return;
      setBusy(false);
      setError(
        'Payment could not be completed. Check your card details and try again, or choose PayPal. If your bank shows a debit, check your order before retrying.',
      );
    };
    const cards = sdk.CardFields({
      createOrder: () => Promise.resolve(session.orderId),
      onApprove: approve,
      onError: fail,
      style: {
        input: {
          'font-size': '16px',
          'font-family': 'Arial, sans-serif',
          color: '#18243b',
          padding: '12px',
          border: '0',
          'box-shadow': 'none',
        },
        '.invalid': { color: '#b42318' },
      },
    });
    cardRef.current = cards;
    if (cards.isEligible()) {
      setCardsAvailable(true);
      Promise.all([
        cards.NameField().render('#si-card-name'),
        cards.NumberField().render('#si-card-number'),
        cards.ExpiryField().render('#si-card-expiry'),
        cards.CVVField().render('#si-card-cvv'),
      ])
        .then(() => {
          if (!cancelled) setReady(true);
        })
        .catch(fail);
    } else {
      setCardsAvailable(false);
      setError(
        'Direct card checkout is unavailable for this session. You can use the PayPal option below.',
      );
    }
    const buttons = sdk.Buttons({
      createOrder: () => Promise.resolve(session.orderId),
      onApprove: approve,
      onError: fail,
      onCancel: () => {
        if (!cancelled) setBusy(false);
      },
      style: { layout: 'vertical', shape: 'rect', label: 'paypal', height: 48 },
    });
    buttons.render('#si-paypal-wallet').catch(fail);
    return () => {
      cancelled = true;
      cards.close?.();
      buttons.close();
      cardRef.current = null;
    };
  }, [loaded, session.orderId, session.returnPath]);

  return (
    <div className={styles.checkout}>
      <Script
        id="sureimports-paypal-expanded"
        src={`https://www.paypal.com/sdk/js?${params}`}
        data-namespace="sureImportsPayPal"
        onReady={() => setLoaded(true)}
        onError={() =>
          setError(
            'The payment form could not load. Check your connection and reload this page.',
          )
        }
      />
      {!loaded && !error ? (
        <p role="status">Loading secure payment form…</p>
      ) : null}
      <form
        hidden={cardsAvailable === false}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!cardRef.current || !ready || busy) return;
          setBusy(true);
          setError('');
          const form = new FormData(event.currentTarget);
          const country = countries.find(
            (item) => item.label === form.get('country'),
          );
          if (!country) {
            setError(
              'Search for and select your billing country from the list.',
            );
            setBusy(false);
            return;
          }
          try {
            await cardRef.current.submit({
              billingAddress: {
                addressLine1: String(form.get('address') || ''),
                adminArea2: String(form.get('city') || ''),
                adminArea1: String(form.get('region') || ''),
                postalCode: String(form.get('postal') || ''),
                countryCode: country.code,
              },
            });
          } catch {
            setError(
              'Please check your card details and complete any verification requested by your bank.',
            );
            setBusy(false);
          }
        }}
      >
        <div className={styles.fields} aria-busy={!ready}>
          <div>
            <label htmlFor="si-card-name">Name on card</label>
            <div id="si-card-name" className={styles.field} />
          </div>
          <div>
            <label htmlFor="si-card-number">Card number</label>
            <div id="si-card-number" className={styles.field} />
          </div>
          <div className={styles.row}>
            <div>
              <label htmlFor="si-card-expiry">Expiry date</label>
              <div id="si-card-expiry" className={styles.field} />
            </div>
            <div>
              <label htmlFor="si-card-cvv">Security code</label>
              <div id="si-card-cvv" className={styles.field} />
            </div>
          </div>
          <div>
            <label htmlFor="si-billing-address">Billing address</label>
            <input
              className={styles.address}
              id="si-billing-address"
              name="address"
              autoComplete="billing address-line1"
              required
            />
          </div>
          <div className={styles.row}>
            <div>
              <label htmlFor="si-billing-city">City</label>
              <input
                className={styles.address}
                id="si-billing-city"
                name="city"
                autoComplete="billing address-level2"
                required
              />
            </div>
            <div>
              <label htmlFor="si-billing-region">State / region</label>
              <input
                className={styles.address}
                id="si-billing-region"
                name="region"
                autoComplete="billing address-level1"
              />
            </div>
          </div>
          <div className={styles.row}>
            <div>
              <label htmlFor="si-billing-country">Country</label>
              <input
                className={styles.address}
                id="si-billing-country"
                name="country"
                list="si-billing-countries"
                placeholder="Search countries"
                autoComplete="billing country-name"
                required
              />
              <datalist id="si-billing-countries">
                {countries.map((country) => (
                  <option key={country.code} value={country.label} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="si-billing-postal">Postal code</label>
              <input
                className={styles.address}
                id="si-billing-postal"
                name="postal"
                autoComplete="billing postal-code"
              />
            </div>
          </div>
        </div>
        <button className={styles.pay} type="submit" disabled={!ready || busy}>
          {busy
            ? 'Confirming payment…'
            : `Pay ${session.currency} ${session.amount}`}
        </button>
      </form>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.divider}>Or pay with PayPal</p>
      <div id="si-paypal-wallet" />
      <p className={styles.note}>
        Card details are handled securely by PayPal. Your bank may ask you to
        verify this payment.
      </p>
    </div>
  );
}
