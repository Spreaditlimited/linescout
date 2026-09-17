import {blankDraft,parseDraft,evaluate,MARKETS,type Draft,type Market} from './amazon-calculator';
import {blankTikTok,parseTikTok,evaluateTikTok,type TikTokDraft} from './tiktok-calculator';
export const CALCULATION_VERSION=1;
export type Platform='amazon'|'tiktok';
export type CalculationInput={name:string;platform:Platform;market:Market;draft:Draft|TikTokDraft;modelVersion:number};
export type CalculationRecord=CalculationInput & {id:string;revision:number;createdAt:string;updatedAt:string;result:{profit:number;profitMargin:number;monthly:number;price:number};currency:string};
export function validateCalculation(value:unknown):CalculationInput {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Enter a valid calculation.');
  const b=value as Record<string,unknown>;
  if(b.platform!=='amazon'&&b.platform!=='tiktok')throw Error('Choose Amazon or TikTok Shop.');
  if(typeof b.market!=='string'||!Object.hasOwn(MARKETS,b.market)||(b.platform==='tiktok'&&b.market==='CA'))throw Error('Choose a supported market.');
  if(b.modelVersion!==CALCULATION_VERSION)throw Error('The calculator has changed. Reload it and check your figures before saving.');
  if(typeof b.name!=='string'||b.name.trim().length>160)throw Error('Use a calculation name of up to 160 characters.');
  if(!b.draft||typeof b.draft!=='object'||Array.isArray(b.draft))throw Error('Complete your calculation before saving.');
  const source=b.draft as Record<string,unknown>;
  const template=b.platform==='amazon'?blankDraft():blankTikTok();
  if(Object.keys(template).some(k=>typeof source[k]!=='string'||(source[k] as string).length>80))throw Error('Check the values in your calculation.');
  const draft=Object.fromEntries(Object.keys(template).map(k=>[k,source[k]]));
  const parsed=b.platform==='amazon'?parseDraft(draft as Draft):parseTikTok(draft as TikTokDraft);
  if(!parsed.values)throw Error('Check your figures. Complete every required field and use valid amounts.');
  return {name:b.name.trim()||'Untitled calculation',platform:b.platform,market:b.market as Market,draft:draft as Draft|TikTokDraft,modelVersion:CALCULATION_VERSION};
}
export function calculationResult(input:CalculationInput){
  const r=input.platform==='amazon'?evaluate(parseDraft(input.draft as Draft).values!):evaluateTikTok(parseTikTok(input.draft as TikTokDraft).values!);
  return {profit:r.profit,profitMargin:r.profitMargin,monthly:r.monthly,price:Number(input.draft.price)};
}
export const validCalculationId=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
