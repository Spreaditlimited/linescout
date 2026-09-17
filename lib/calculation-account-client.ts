'use client';
import type {CalculationInput,CalculationRecord} from './calculation-records';
export type PendingCalculation=CalculationInput & {requestKey:string;id?:string;revision?:number;expires:number};
export const PENDING_PREFIX='linescout-pending-calculation:';
export class CalculationRequestError extends Error {constructor(message:string,public status:number){super(message);}}
export function requestKey(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
export async function calculationRequest(path='',init:RequestInit={}){
 let response:Response;try{response=await fetch('/api/calculations'+path,{...init,credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',...init.headers}});}catch{throw new CalculationRequestError('We could not connect. Your figures are still here; try saving again.',0);}
 const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new CalculationRequestError(data?.error||'We could not complete that action. Please try again.',response.status);return data;
}
export async function saveCalculation(input:CalculationInput,key:string,current?:Pick<CalculationRecord,'id'|'revision'>){return (await calculationRequest('',{method:current?'PATCH':'POST',body:JSON.stringify({...input,requestKey:key,...current})})).calculation as CalculationRecord;}
