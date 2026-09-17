/** User-entered planning assumptions. No live marketplace fees or sales forecasts. */
export type TikTokMarket = 'GB' | 'US';
export const TIKTOK_FEES = {
  GB: 'https://seller-uk.tiktok.com/university/essay?knowledge_id=7753824408913665&lang=en-GB',
  US: 'https://seller-us.tiktok.com/university/essay?knowledge_id=5988482086864682',
} as const;
export const tiktokLabels = {
  price:'Selling price per product', shippingIncome:'Delivery income retained per unit',
  outputTax:'Tax included in product and delivery income (%)', landed:'Product cost, including import and shipping',
  prep:'Extra packing and preparation per unit', fulfilment:'Delivery / fulfilment fee per product',
  storage:'Storage allowance per unit', feeRate:'TikTok Shop platform fee (%)', fixedFee:'Other platform fees per unit',
  feeTax:'Extra unrecoverable tax on platform fees (%)', creatorRate:'Creator commission (%)',
  creatorShare:'Sales attributed to creators (%)', advertising:'Advertising allowance (% of product price)',
  content:'Samples and content cost allocated per unit', returns:'Returns and refund loss allowance per unit',
  other:'Other costs per unit', targetMargin:'Target profit margin (%)', units:'Units sold per month', overhead:'Monthly overhead',
} as const;
export type TikTokKey = keyof typeof tiktokLabels;
export type TikTokBasis = 'orderGross' | 'orderNet' | 'productGross' | 'productNet';
export type TikTokInputs = Record<TikTokKey,number> & {feeBasis:TikTokBasis;creatorBasis:'gross'|'net'};
export type TikTokDraft = Record<TikTokKey,string> & Pick<TikTokInputs,'feeBasis'|'creatorBasis'>;
export const TIKTOK_DEFAULT_FEE:Record<TikTokMarket,string>={GB:'9',US:'6'};
export function blankTikTok(market:TikTokMarket='GB'):TikTokDraft {
  return {price:'',shippingIncome:'0',outputTax:'0',landed:'',prep:'0',fulfilment:'',storage:'0',feeRate:TIKTOK_DEFAULT_FEE[market],fixedFee:'0',feeTax:'0',creatorRate:'0',creatorShare:'100',advertising:'0',content:'0',returns:'0',other:'0',targetMargin:'20',units:'100',overhead:'0',feeBasis:'orderGross',creatorBasis:'gross'};
}
export function parseTikTok(d:TikTokDraft) {
  const errors:Partial<Record<TikTokKey,string>>={};
  const values = {} as TikTokInputs;
  for(const key of Object.keys(tiktokLabels) as TikTokKey[]) {
    const raw=d[key];const value=typeof raw==='string'&&/^\d+(\.\d+)?$/.test(raw.trim())?Number(raw):NaN;
    const percent=['outputTax','feeRate','feeTax','creatorRate','creatorShare','advertising','targetMargin'].includes(key);
    if(!Number.isFinite(value)||value<0) errors[key]='Enter a number of zero or more.';
    else if((key==='price'||key==='units')&&value===0) errors[key]='Enter a value greater than zero.';
    else if(key==='units'&&(!Number.isInteger(value)||value>1000000)) errors[key]='Enter a whole number of units, up to 1,000,000.';
    else if(percent&&(value>100||(key==='targetMargin'&&value===100))) errors[key]=key==='targetMargin'?'Margin must be below 100%.':'Enter a percentage from 0 to 100.';
    else if(value>10000000) errors[key]='This value is too large.';
    values[key]=value;
  }
  if(!['orderGross','orderNet','productGross','productNet'].includes(d.feeBasis)||!['gross','net'].includes(d.creatorBasis))errors.feeRate='Please reset this calculation.';
  return {errors,values:Object.keys(errors).length?null:{...values,feeBasis:d.feeBasis,creatorBasis:d.creatorBasis}};
}
export function evaluateTikTok(i:TikTokInputs,price=i.price) {
  const productNet=price/(1+i.outputTax/100);
  const receipts=price+i.shippingIncome,revenue=receipts/(1+i.outputTax/100);
  const feeBase={orderGross:receipts,orderNet:revenue,productGross:price,productNet}[i.feeBasis];
  const platformFee=feeBase*i.feeRate/100+i.fixedFee;
  const feeTax=platformFee*i.feeTax/100;
  const creator=(i.creatorBasis==='gross'?price:productNet)*i.creatorRate/100*i.creatorShare/100;
  const advertising=price*i.advertising/100;
  const total=i.landed+i.prep+i.fulfilment+i.storage+platformFee+feeTax+creator+advertising+i.content+i.returns+i.other;
  const contribution=revenue-total;
  const profit=contribution-i.overhead/i.units;
  return {profit,profitMargin:revenue?profit/revenue*100:0,receipts,revenue,tax:receipts-revenue,platformFee,feeTax,creator,advertising,total,contribution,
    margin:revenue?contribution/revenue*100:0,monthly:contribution*i.units-i.overhead,
    inventoryCash:(i.landed+i.prep)*i.units,adHeadroom:price?(contribution+advertising)/price*100:0};
}
/** Solves for product price; delivery income and all per-unit costs stay fixed. */
export function tiktokPriceForMargin(i:TikTokInputs,margin=0):number|null {
  const score=(price:number)=>{const r=evaluateTikTok(i,price);return r.contribution-r.revenue*margin/100;};
  const intercept=score(0),slope=score(1)-intercept;
  if(slope<=1e-10)return null;
  const price=Math.max(0,-intercept/slope);
  return price>10000000?null:Math.ceil((price-1e-8)*100)/100;
}
