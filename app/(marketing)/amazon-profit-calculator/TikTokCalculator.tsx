'use client';
import CalculationSave from '@/components/calculations/CalculationSave';
import {CALCULATION_VERSION,type CalculationRecord} from '@/lib/calculation-records';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import SearchableSelect from '@/app/internal/_components/SearchableSelect';
import { MARKETS, type Market } from '@/lib/amazon-calculator';
import { blankTikTok, parseTikTok, evaluateTikTok, tiktokPriceForMargin, tiktokLabels, TIKTOK_FEES, type TikTokKey, type TikTokDraft, type TikTokMarket } from '@/lib/tiktok-calculator';
import styles from './Calculator.module.css';

const percentKeys=new Set(['outputTax','feeRate','feeTax','creatorRate','creatorShare','advertising','targetMargin']);
const basisOptions=[{value:'orderGross',label:'Product + delivery, including tax'},{value:'orderNet',label:'Product + delivery, excluding tax'},{value:'productGross',label:'Product only, including tax'},{value:'productNet',label:'Product only, excluding tax'}];

export default function TikTokCalculator({initialMarket,product,low,high,initialRecord}:{initialMarket:Market;product:string;low:number|null;high:number|null;initialRecord?:CalculationRecord}) {
  const supported=initialMarket!=='CA';
  const [market,setMarket]=useState<TikTokMarket>(initialMarket==='US'?'US':'GB');
  const [draft,setDraft]=useState<TikTokDraft>(()=>initialRecord?initialRecord.draft as TikTokDraft:({...blankTikTok(initialMarket==='US'?'US':'GB'),landed:supported&&high!==null?String(high):supported&&low!==null?String(low):''}));
  const [name,setName]=useState(initialRecord?.name||(supported?product:''));
  const [notice,setNotice]=useState(!supported?'TikTok Shop calculations here support the UK and US. Your CAD costs have not been copied or converted.':'');
  const [ack,setAck]=useState(false);
  const [touched,setTouched]=useState<Partial<Record<TikTokKey,boolean>>>({});
  const m=MARKETS[market],parsed=parseTikTok(draft),v=parsed.values,r=v?evaluateTikTok(v):null;
  const money=(n:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:m.currency}).format(n);
  const update=(key:TikTokKey,value:string)=>{setDraft(d=>({...d,[key]:value}));setAck(false);};
  function field(key:TikTokKey,help?:string) {
    const error=touched[key]?parsed.errors[key]:undefined;
    return <label key={key} className={styles.field} htmlFor={'tt-'+key}><span>{tiktokLabels[key]}{!percentKeys.has(key)&&key!=='units'?` (${m.currency})`:''}</span><input id={'tt-'+key} type="number" min="0" step={key==='units'?'1':'any'} inputMode="decimal" value={draft[key]} onChange={e=>update(key,e.target.value)} onInput={e=>update(key,e.currentTarget.value)} onBlur={()=>setTouched(t=>({...t,[key]:true}))} aria-invalid={!!error} aria-describedby={help||error?'tt-help-'+key:undefined}/>{key==='feeRate'&&<a className={styles.fieldLink} href={TIKTOK_FEES[market]} target="_blank" rel="noopener noreferrer">Check TikTok Shop fees</a>}{(help||error)&&<small id={'tt-help-'+key} className={error?styles.error:undefined}>{error||help}</small>}</label>;
  }
  function reset(next=market) {setMarket(next);setDraft(blankTikTok(next));setName('');setAck(false);setTouched({});setNotice(next===market?'TikTok Shop calculation cleared.':'Currency changed. Amounts cleared; no currency conversion was applied.');}
  function example() {setDraft({...blankTikTok(market),price:'25',landed:'8',fulfilment:'3',creatorRate:'10',creatorShare:'50',advertising:'8',content:'0.5',returns:'0.5'});setName('Illustrative TikTok Shop example');setAck(false);setTouched({});setNotice('Illustrative inputs loaded. These are not a quote or a verified fee schedule. Replace them with your own costs.');}
  const priceText=(target=0)=>{if(!v)return '—';const p=tiktokPriceForMargin({...v,other:v.other+v.overhead/v.units},target);return p===null?'Not achievable':money(p);};
  return <div className={styles.container}>
    <div className={`${styles.marketRow} ${styles.twoMarkets}`} aria-label="TikTok Shop marketplace">{(['GB','US'] as const).map(k=><button type="button" key={k} aria-pressed={market===k} onClick={()=>{if(k!==market)reset(k);}}><span aria-hidden="true">{MARKETS[k].flag}</span><strong>{MARKETS[k].name}</strong><small>{MARKETS[k].currency}</small></button>)}</div>
    <p className={styles.note}>UK and US TikTok Shop estimates · all amounts in {m.currency}. Changing market clears amounts. Canada remains available in the Amazon calculator. Seller eligibility must be checked separately.</p>
    {supported&&product&&<p className={styles.note}>Catalogue starting point: {product}. The upper landed-cost estimate is used where supplied. Confirm the quotation and included costs; this is not a verified quote.</p>}
    <div className={styles.toolbar}><label>Name (optional, for saving)<input maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="For example, branded travel bags"/></label><div className={styles.actions}><button type="button" onClick={example}>Try an example</button><button type="button" onClick={()=>reset()}><RotateCcw size={16}/>Reset</button></div></div>
    {notice&&<p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.workspace}><div className={styles.inputs}>
      <section className={styles.panel}><div className={styles.sectionTitle}><span>01</span><h2>Enter the essentials</h2></div><p>Start with your price and costs. Creator commission and advertising can stay at 0 if they do not apply.</p><div className={styles.fields}>
        {field('price','What you receive for the product after seller discounts. Do not include delivery income or tax collected separately by TikTok.')}
        {field('landed','Your cost to buy and import one product, including branding, freight and import charges.')}
        {field('feeRate',market==='GB'?'Prefilled at the published UK standard of 9%, including applicable fee tax. Edit if your category or offer differs.':'Prefilled at the standard US rate of 6%. Some categories and offers differ; check your rate and edit if needed.')}
        {field('fulfilment','Your delivery or fulfilment cost per product, separate from import shipping.')}
        {field('creatorRate','What you pay creators on a sale. Use 0 if not using creators. By default this applies to all sales; change that under More options.')}
        {field('advertising','Planned ad spend as a share of product sales, separate from creator commission.')}
      </div><p className={styles.note}>Default rates last checked 17 September 2026. No live fee schedule is retrieved; confirm your rate before relying on the estimate.</p></section>
      <details className={styles.panel}><summary className={styles.optionsSummary}>More options <span>Delivery income, tax, samples and monthly costs{['shippingIncome','outputTax','prep','storage','fixedFee','feeTax','content','returns','other','overhead'].some(k=>Number(draft[k as TikTokKey])>0)?' · adjustments included':''}</span></summary><div className={styles.advancedFields}><div className={styles.fields}>
        {field('shippingIncome','Only delivery income credited to you. Use 0 if TikTok retains it. Allocate multi-item delivery charges per product.')}
        {field('outputTax','Tax included in your product and delivery income and payable by you. The same rate applies to both. Leave 0 if none.')}
        {field('prep','Extra packing or labels not already included in product cost.')}{field('storage','Storage allocated per product over its expected holding period.')}
        <div className={styles.field}><span id="tt-fee-label">Platform percentage applies to</span><div className={styles.picker} role="group" aria-labelledby="tt-fee-label"><SearchableSelect variant="light" value={draft.feeBasis} options={basisOptions} onChange={value=>{setDraft(d=>({...d,feeBasis:value as TikTokDraft['feeBasis']}));setAck(false);}}/></div><small>Match the basis shown in Seller Center. This model does not add platform-funded discounts or reimbursements.</small></div>
        {field('fixedFee','Additional platform charges allocated per product, excluding the percentage above.')}
        {field('feeTax','Extra unrecoverable tax on platform fees only. Leave 0 when already included or recoverable; enter other costs inclusive of their unrecoverable tax.')}
        {field('creatorShare','Percentage of sales that pay creator commission. Default is 100%; use a lower share if some orders are not creator-driven.')}
        <div className={styles.field}><span id="tt-creator-label">Creator commission applies to</span><div className={styles.picker} role="group" aria-labelledby="tt-creator-label"><SearchableSelect variant="light" value={draft.creatorBasis} options={[{value:'gross',label:'Product price including tax'},{value:'net',label:'Product price excluding tax'}]} onChange={value=>{setDraft(d=>({...d,creatorBasis:value as TikTokDraft['creatorBasis']}));setAck(false);}}/></div><small>Delivery income is excluded. Match your collaboration terms; platform coupons may change the actual commission base.</small></div>
        {field('content','Samples, sample shipping and content costs spread across expected products sold. Do not count them twice in overhead.')}
        {field('returns','Expected average loss per product sold from returns, refunds and non-refundable fees. This is an amount, not a return percentage.')}
        {field('other')}{field('targetMargin','Desired profit as a percentage of revenue after included tax and all entered costs.')}
        {field('units','Used for monthly profit and allocating overhead. This is your assumption, not a forecast.')}
        {field('overhead','Fixed monthly costs. Divided by expected units and included in estimated profit per product.')}
      </div></div></details>
      <label className={styles.confirm}><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/><span>I have checked my costs and fees. I understand this is an estimate.</span></label>
    </div><aside className={styles.results} aria-label="TikTok Shop calculation results">
      {!v||!r?<section className={styles.panel}><h2>Start with your actual costs.</h2><p>Complete the required figures. Use 0 only where a cost does not apply.</p><ul>{Object.keys(parsed.errors).map(k=><li key={k}><a href={'#tt-'+k} onClick={()=>{const panel=document.getElementById('tt-'+k)?.closest('details');if(panel)panel.open=true;}}>{tiktokLabels[k as TikTokKey]}</a></li>)}</ul><button type="button" onClick={example}>Try an illustrative example</button></section>:<>
        <section className={styles.resultHero}><span className={styles.kicker}>{ack?'YOUR PLANNING ESTIMATE':'DRAFT · CONFIRM YOUR ASSUMPTIONS'}</span><h2>Estimated profit per product</h2><strong className={r.profit<0?styles.loss:undefined}>{money(r.profit)}</strong><p>{r.profitMargin.toFixed(1)}% estimated profit margin · before income tax</p>{r.profit<=0&&<p className={styles.warning}>These costs leave no estimated profit at this price.</p>}<dl><div><dt>Break-even product price</dt><dd>{priceText()}</dd></div><div><dt>Product price for {v.targetMargin}% margin</dt><dd>{priceText(v.targetMargin)}</dd></div><div><dt>Monthly profit at {v.units} sales</dt><dd>{money(r.monthly)}</dd></div><div><dt>Inventory + preparation for {v.units} units</dt><dd>{money(r.inventoryCash)}</dd></div></dl><small>After the costs you entered, including allocated monthly overhead. Before income tax. Add extra costs and change monthly sales in More options. Suggested product prices exclude delivery income.</small></section>
        <section className={styles.panel}><h2>Where the money goes</h2><dl>{([
          ['Product + retained delivery income',r.receipts],['Included tax removed',r.tax],['Net sales revenue',r.revenue],['Landed product',v.landed],['Preparation',v.prep],['Delivery / fulfilment',v.fulfilment],['Storage',v.storage],['Platform fees',r.platformFee],['Extra tax on platform fees',r.feeTax],['Creator commission (blended)',r.creator],['Advertising',r.advertising],['Samples and content',v.content],['Returns and refund allowance',v.returns],['Other costs',v.other],['Monthly overhead per product',v.overhead/v.units],['Estimated profit',r.profit],
        ] as const).filter(([label,amount])=>amount!==0||label==='Estimated profit').map(([label,amount])=><div key={label}><dt>{label}</dt><dd>{money(amount)}</dd></div>)}</dl><p>Maximum blended ad spend before unit break-even: {(r.profit+r.advertising)<0?'none; other costs exceed revenue':((r.profit+r.advertising)/v.price*100).toFixed(1)+'% of product sales'}. Includes allocated monthly overhead.</p></section>
        <section className={styles.panel}><h2>What if things change?</h2><p>Each scenario changes one assumption, not a prediction of sales.</p><div className={styles.scenarios}>{([
          ['Product price falls 10%',evaluateTikTok(v,v.price*.9)],['All sales attract creator commission',evaluateTikTok({...v,creatorShare:100})],['Landed cost rises 10%',evaluateTikTok({...v,landed:v.landed*1.1})],
        ] as const).map(([label,result])=><div key={label}><span>{label}</span><strong>{money(result.profit)}</strong><small>estimated profit per product</small></div>)}</div></section>
      </>}
    <div hidden={!v||!r}><CalculationSave input={{name,platform:'tiktok',market,draft,modelVersion:CALCULATION_VERSION}} confirmed={ack} initialRecord={initialRecord}/></div></aside></div>
    <section className={styles.method}><h2>Know what is—and isn’t—in the estimate.</h2><p>Estimated profit per product is product and retained delivery revenue after included tax, minus all entered per-product costs and monthly overhead divided by expected products sold. Creator cost is the chosen product-price basis × creator rate × share of creator-attributed sales. Estimated monthly profit is profit per product multiplied by expected units sold. Both estimates are before income tax.</p><p>This model does not calculate platform-funded coupons, reimbursements, tiered fees, campaign programmes, tax eligibility or settlement timing. Add known costs without double counting and verify the actual fee basis in Seller Center. A positive margin does not prove demand, eligibility or guaranteed profit.</p><a href={TIKTOK_FEES[market]} target="_blank" rel="noopener noreferrer">Check current TikTok Shop {m.name} fees</a><p>Independent planning tool from LineScout and Sure Imports. Not affiliated with TikTok Shop. No seller account connection, Keepa subscription or payment required.</p></section>
  </div>;
}
