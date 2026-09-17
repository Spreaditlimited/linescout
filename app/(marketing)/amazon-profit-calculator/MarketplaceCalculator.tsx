'use client';

import { useState } from 'react';
import Link from 'next/link';
import Calculator from './Calculator';
import TikTokCalculator from './TikTokCalculator';
import type {CalculationRecord} from '@/lib/calculation-records';
import type { Market } from '@/lib/amazon-calculator';
import styles from './Calculator.module.css';

type Props={initialMarket:Market;product:string;low:number|null;high:number|null;initialPlatform:'amazon'|'tiktok';initialRecord?:CalculationRecord};
export default function MarketplaceCalculator({initialPlatform,initialRecord,...props}:Props) {
  const [platform,setPlatform]=useState(initialPlatform);
  return <div className={styles.page}>
    <header className={styles.hero}><span className={styles.kicker}>KNOW YOUR NUMBERS BEFORE YOU ORDER</span><h1>What could you earn<br/>from each product?</h1><p>Choose where you want to sell. Enter your product cost, selling price and fees to see your estimated profit per product.</p><div className={styles.actions}><Link href="/white-label">Explore product ideas</Link><Link href="/calculations">My calculations</Link><Link href="/sell-on-amazon">Amazon selling guide</Link><Link href="/sell-on-tiktok-shop">TikTok Shop selling guide</Link></div></header>
    <section className={`${styles.container} ${styles.platformSection}`} aria-label="Selling platform"><h2>Where will you sell?</h2><div className={styles.platformTabs} role="group" aria-label="Choose selling platform">{(['amazon','tiktok'] as const).map(p=><button type="button" key={p} aria-pressed={platform===p} aria-controls={p+'-calculator'} onClick={()=>setPlatform(p)}>{p==='amazon'?'Amazon':'TikTok Shop'}</button>)}</div><p className={styles.note}>Your inputs stay separate for each platform while you compare.</p></section>
    <div id="amazon-calculator" hidden={platform!=='amazon'}><Calculator {...props} initialRecord={initialRecord?.platform==='amazon'?initialRecord:undefined}/></div>
    <div id="tiktok-calculator" hidden={platform!=='tiktok'}><TikTokCalculator {...props} initialRecord={initialRecord?.platform==='tiktok'?initialRecord:undefined}/></div>
  </div>;
}
