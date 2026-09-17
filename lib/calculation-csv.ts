import { MARKETS, parseDraft, evaluate, priceForMargin, csvCell, type Draft, type NumericKey } from './amazon-calculator';
import { parseTikTok, evaluateTikTok, tiktokPriceForMargin, tiktokLabels, type TikTokDraft, type TikTokKey } from './tiktok-calculator';
import { CALCULATION_VERSION, type CalculationRecord } from './calculation-records';
const labels:Record<NumericKey,string>={price:'Selling price per product',landed:'Product cost, including import and shipping',product:'Product + branding per unit',freight:'Freight per unit',importCosts:'Import costs per unit',prep:'Additional preparation per unit',fulfilment:'Delivery / fulfilment fee per product',storage:'Storage allowance per unit',other:'Other selling costs per unit',referral:'Referral fee (%)',minimumReferral:'Minimum referral fee per unit',feeTax:'Unrecoverable tax on Amazon fees (%)',advertising:'Advertising allowance (% of price)',returns:'Returns allowance (% of price)',outputTax:'Tax included in selling price (%)',targetMargin:'Target profit margin (%)',units:'Units sold per month',overhead:'Monthly business overhead'};
export function calculationCsv(record:CalculationRecord){
 if(record.modelVersion!==CALCULATION_VERSION)throw new Error('Open and save this calculation with the current calculator before downloading.');
 const {name}=record,m=MARKETS[record.market],ack=true;
 let rows:unknown[][];
 if(record.platform==='amazon'){
  const draft=record.draft as Draft,v=parseDraft(draft).values;
  if(!v)throw new Error('Open and check this calculation before downloading.');
  const r=evaluate(v);rows=[['LineScout Amazon planning calculation',name],['Marketplace',m.name],['Currency',m.currency],['Created',new Date().toISOString()],['Status',ack?'User-confirmed assumptions':'Unconfirmed assumptions'],['Cost method',v.costMode],['Fulfilment',v.fulfilmentMode],['Referral fee basis',v.feeBasis],...Object.entries(labels).map(([k,l])=>[l,draft[k as NumericKey]]),['Net sales revenue',r.revenue],['Estimated profit per product',r.profit],['Estimated profit margin (%)',r.profitMargin],['Estimated monthly profit',r.monthly],['Break-even price',priceForMargin({...v,other:v.other+v.overhead/v.units})??'Not achievable'],['Target-margin price',priceForMargin({...v,other:v.other+v.overhead/v.units},v.targetMargin)??'Not achievable'],['Notice','Planning estimate, not Amazon-verified fees or guaranteed profit. Recheck fees when price, category, dimensions or fulfilment changes.']];
 }else{
  const draft=record.draft as TikTokDraft,v=parseTikTok(draft).values;
  if(!v)throw new Error('Open and check this calculation before downloading.');
  const r=evaluateTikTok(v);rows=[['Platform','TikTok Shop'],['Name',name],['Market',m.name],['Currency',m.currency],['Created',new Date().toISOString()],['Status',ack?'User-confirmed assumptions':'Unconfirmed assumptions'],['Platform fee basis',draft.feeBasis],['Creator fee basis',draft.creatorBasis],...Object.entries(tiktokLabels).map(([k,l])=>[l,draft[k as TikTokKey]]),['Estimated profit per product',r.profit],['Estimated profit margin (%)',r.profitMargin],['Estimated monthly profit',r.monthly],['Break-even product price',tiktokPriceForMargin({...v,other:v.other+v.overhead/v.units})??'Not achievable'],['Target-margin product price',tiktokPriceForMargin({...v,other:v.other+v.overhead/v.units},v.targetMargin)??'Not achievable'],['Notice','Planning estimate, not live TikTok Shop fees or guaranteed profit. No platform-funded subsidies modelled.']];
 }
 rows.push(['Saved at',record.updatedAt]);
 return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
