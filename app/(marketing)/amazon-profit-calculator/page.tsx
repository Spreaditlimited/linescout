import type { Metadata } from 'next';
import Calculator from '@/components/calculations/AccountCalculatorLoader';
import { MARKETS, type Market } from '@/lib/amazon-calculator';
export const metadata:Metadata={title:'Amazon & TikTok Shop Profit Calculator | LineScout',description:'Estimate profit per product on Amazon or TikTok Shop. Enter your selling price, product costs and fees, then compare break-even prices and scenarios.',alternates:{canonical:'https://linescout.sureimports.com/amazon-profit-calculator'},robots:{index:true,follow:true}};
export default async function CalculatorPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const p=await searchParams;const code=typeof p.market==='string'?p.market:'';
  const market:Market=Object.hasOwn(MARKETS,code)?code as Market:'GB';
  const amount=(v:unknown)=>typeof v==='string'&&/^\d+(\.\d+)?$/.test(v)&&Number(v)<=10000000?Number(v):null;
  let low=Object.hasOwn(MARKETS,code)?amount(p.low):null,high=Object.hasOwn(MARKETS,code)?amount(p.high):null;
  if(low!==null&&high!==null&&low>high)[low,high]=[high,low];
  return <main><Calculator savedId={typeof p.saved==='string'?p.saved:''} pendingId={typeof p.pending==='string'&&/^[a-f0-9]{32}$/.test(p.pending)?p.pending:''} initialPlatform={p.platform==='tiktok'?'tiktok':'amazon'} initialMarket={market} product={typeof p.product==='string'?p.product.slice(0,160):''} low={low} high={high}/></main>;
}
