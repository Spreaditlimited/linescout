/** Planning model only: user-confirmed fees, not an Amazon quotation. */
export const MARKETS = {
  GB: { name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP', calculator: 'https://sell.amazon.co.uk/pricing', fees: 'https://sell.amazon.co.uk/pricing' },
  CA: { name: 'Canada', flag: '🇨🇦', currency: 'CAD', calculator: 'https://sell.amazon.ca/pricing/estimate', fees: 'https://sell.amazon.ca/pricing' },
  US: { name: 'United States', flag: '🇺🇸', currency: 'USD', calculator: 'https://sell.amazon.com/pricing/estimate', fees: 'https://sell.amazon.com/pricing' },
} as const;
export type Market = keyof typeof MARKETS;
export type Inputs = {
  price:number; landed:number; product:number; freight:number; importCosts:number;
  prep:number; fulfilment:number; storage:number; other:number; referral:number;
  minimumReferral:number; feeTax:number; advertising:number; returns:number;
  outputTax:number; targetMargin:number; units:number; overhead:number;
  costMode:'landed'|'itemised'; fulfilmentMode:'fba'|'self'; feeBasis:'gross'|'net';
};
export const numericKeys = ['price','landed','product','freight','importCosts','prep','fulfilment','storage','other','referral','minimumReferral','feeTax','advertising','returns','outputTax','targetMargin','units','overhead'] as const;
export type NumericKey = typeof numericKeys[number];
export type Draft = Record<NumericKey,string> & Pick<Inputs,'costMode'|'fulfilmentMode'|'feeBasis'>;
export function blankDraft():Draft { return {price:'',landed:'',product:'',freight:'0',importCosts:'0',prep:'0',fulfilment:'',storage:'0',other:'0',referral:'',minimumReferral:'0',feeTax:'0',advertising:'0',returns:'0',outputTax:'0',targetMargin:'20',units:'100',overhead:'0',costMode:'landed',fulfilmentMode:'fba',feeBasis:'gross'}; }
export function parseDraft(d:Draft):{values:Inputs|null;errors:Partial<Record<NumericKey,string>>} {
  const errors:Partial<Record<NumericKey,string>>={};const n:Partial<Inputs>={};
  const inactive=d.costMode==='landed'?['product','freight','importCosts']:['landed'];
  for(const key of numericKeys){
    if(inactive.includes(key)){Object.assign(n,{[key]:0});continue;}
    const raw=d[key];const v=typeof raw==='string'&&/^\d+(\.\d+)?$/.test(raw.trim())?Number(raw):NaN;
    const percent=['referral','feeTax','advertising','returns','outputTax','targetMargin'].includes(key);
    if(!Number.isFinite(v)||v<0)errors[key]='Enter a number of zero or more.';
    else if((key==='price'||key==='units')&&v<=0)errors[key]='Enter a value greater than zero.';
    else if(key==='units'&&!Number.isInteger(v))errors[key]='Enter a whole number of units.';
    else if(percent&&(v>100||(key==='targetMargin'&&v===100)))errors[key]=key==='targetMargin'?'Margin must be below 100%.':'Enter a percentage from 0 to 100.';
    else if(v>(key==='units'?1000000:10000000))errors[key]='This value is too large.';
    Object.assign(n,{[key]:v});
  }
  if(!['landed','itemised'].includes(d.costMode)||!['fba','self'].includes(d.fulfilmentMode)||!['gross','net'].includes(d.feeBasis))return {values:null,errors:{price:'Please reset this calculation.'}};
  return {values:Object.keys(errors).length?null:{...n,costMode:d.costMode,fulfilmentMode:d.fulfilmentMode,feeBasis:d.feeBasis} as Inputs,errors};
}
export function evaluate(i:Inputs,price=i.price) {
  const revenue=price/(1+i.outputTax/100), tax=price-revenue;
  const landed=i.costMode==='landed'?i.landed:i.product+i.freight+i.importCosts;
  const referral=Math.max((i.feeBasis==='gross'?price:revenue)*i.referral/100,i.minimumReferral);
  const feeTax=(referral+(i.fulfilmentMode==='fba'?i.fulfilment:0)+i.storage)*i.feeTax/100;
  const advertising=price*i.advertising/100, returns=price*i.returns/100;
  const total=landed+i.prep+i.fulfilment+i.storage+i.other+referral+feeTax+advertising+returns;
  const contribution=revenue-total;
  const profit=contribution-i.overhead/i.units;
  return {profit,profitMargin:revenue?profit/revenue*100:0,price,revenue,tax,landed,referral,feeTax,advertising,returns,total,contribution,margin:revenue?contribution/revenue*100:0,monthly:contribution*i.units-i.overhead,inventoryCash:(landed+i.prep)*i.units,adHeadroom:price?(contribution+advertising)/price*100:0};
}
/** Piecewise-linear (minimum referral fee); does NOT model tiered category/size fees. */
export function priceForMargin(i:Inputs,margin=0):number|null {
  const revenueFactor=1/(1+i.outputTax/100);
  const variableFactor=revenueFactor*(1-margin/100)-(i.feeBasis==='gross'?1:revenueFactor)*i.referral/100*(1+i.feeTax/100)-(i.advertising+i.returns)/100;
  if(variableFactor<=0)return null;
  const meets=(p:number)=>{const r=evaluate(i,p);return r.contribution>=r.revenue*margin/100;};
  let high=Math.max(1,i.price);while(!meets(high)&&high<10000000)high=Math.min(10000000,high*2);
  if(!meets(high))return null;
  let low=0;for(let n=0;n<80;n++){const mid=(low+high)/2;if(meets(mid))high=mid;else low=mid;}
  return Math.ceil((high-1e-8)*100)/100;
}
export function calculatorHref(name:string,currency:string,low:unknown,high:unknown){
  const market=Object.keys(MARKETS).find(k=>MARKETS[k as Market].currency===currency) as Market|undefined;
  if(!market)return '/amazon-profit-calculator';
  const valid=(v:unknown)=>v!==null&&v!==undefined&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=10000000;
  const q=new URLSearchParams({market,product:name.slice(0,160)});
  if(valid(low))q.set('low',String(Number(low)));if(valid(high))q.set('high',String(Number(high)));
  return '/amazon-profit-calculator?'+q.toString();
}
export function csvCell(v:unknown){const s=String(v);return '"'+(/^[=+\-@\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
