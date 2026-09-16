"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./MarketDestinations.module.css";

const markets = [
  { value: "NG", label: "Nigeria", flag: "🇳🇬", currency: "NGN" },
  { value: "GB", label: "United Kingdom", flag: "🇬🇧", currency: "GBP" },
  { value: "CA", label: "Canada", flag: "🇨🇦", currency: "CAD" },
  { value: "US", label: "United States", flag: "🇺🇸", currency: "USD" },
];

export default function MarketDestinations({ value, options, home = false }: { value?: string; options?: { value: string; label: string }[]; home?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [requested, setRequested] = useState<string | null>(null);
  const available = options ? markets.filter(market => options.some(option => option.value === market.value)) : markets;
  return <section className={`${styles.section} ${home ? styles.home : ''}`} aria-label="Choose your destination market" aria-busy={pending}>
    <div className={styles.intro}><span>{home ? 'KNOW YOUR LANDED COST' : 'START HERE · YOUR DESTINATION'}</span><h2>{home ? 'Product landed-cost estimates for four markets.' : 'Where are you importing to?'}</h2><p>{home ? 'Explore product ideas with estimated landed costs for Nigeria, the UK, Canada and the USA.' : 'Choose your country first to see product landed-cost estimates in your market’s currency.'}</p></div>
    <div className={styles.markets}>{available.map(market => <button key={market.value} type="button" disabled={pending} aria-pressed={!home && value === market.value} onClick={() => {
      setRequested(market.value);
      document.cookie = `wl_country=${market.value}; Path=/; Max-Age=31536000; SameSite=Lax`;
      startTransition(() => { if (home) router.push('/white-label'); else { const url = new URL(window.location.href); url.searchParams.delete('page'); url.searchParams.delete('price'); router.replace(url.pathname + url.search, {scroll:false}); router.refresh(); } });
    }}><span className={styles.flag} aria-hidden="true">{market.flag}</span><span><strong>{market.label}</strong><small>{pending && requested === market.value ? 'Loading prices…' : `${market.currency} estimates`}</small></span><span className={styles.indicator} aria-hidden="true">{!home && value === market.value ? '✓' : ''}</span></button>)}</div>
    <div className={styles.note} role="status">{pending ? 'Updating your destination and pricing…' : 'Based on sea-freight estimates. Final costs are confirmed in your quotation.'}</div>
  </section>;
}
