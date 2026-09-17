'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import {Save,X} from 'lucide-react';
import {CALCULATION_VERSION,type CalculationInput,type CalculationRecord} from '@/lib/calculation-records';
import {CalculationRequestError,PENDING_PREFIX,requestKey,saveCalculation} from '@/lib/calculation-account-client';
import styles from './CalculationAccount.module.css';

export default function CalculationSave({input,confirmed,initialRecord}:{input:CalculationInput;confirmed:boolean;initialRecord?:CalculationRecord}){
 const [current,setCurrent]=useState(initialRecord),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false),[authPath,setAuthPath]=useState('');
 const request=useRef({fingerprint:'',key:''});
 async function save(asNew=false){
  if(busy)return;if(!confirmed){setError(true);setMessage('Check your figures and tick the confirmation above before saving.');return;}
  setBusy(true);setMessage('');setError(false);
  const existing=asNew?undefined:current;
  const payload={...input,modelVersion:CALCULATION_VERSION};
  const fingerprint=JSON.stringify([payload,existing?.id,existing?.revision]);
  if(request.current.fingerprint!==fingerprint)request.current={fingerprint,key:requestKey()};
  try{const result=await saveCalculation(payload,request.current.key,existing);setCurrent(result);setMessage(existing?'Your changes have been saved.':'Calculation saved to your account.');}
  catch(e){if(e instanceof CalculationRequestError&&e.status===401){try{const token=request.current.key;localStorage.setItem(PENDING_PREFIX+token,JSON.stringify({...payload,requestKey:token,...(existing?{id:existing.id,revision:existing.revision}:{}),expires:Date.now()+2*86400000}));setAuthPath('/amazon-profit-calculator?pending='+token);}catch{setError(true);setMessage('Your browser could not keep this draft for sign-in. Allow browser storage and try again before leaving this page.');}}else{setError(true);setMessage(e instanceof Error?e.message:'We could not save your calculation. Please try again.');}}
  finally{setBusy(false);}
 }
 return <div className={styles.saveArea}>
  {initialRecord&&initialRecord.modelVersion!==CALCULATION_VERSION&&<p className={styles.warning}>The calculation method has changed since this was saved. Review the updated estimate before saving. Your original record has not been overwritten.</p>}
  <p>Save your calculation to download a CSV from My calculations.</p><div className={styles.actions}><button type="button" disabled={busy} onClick={()=>save()}><Save size={16}/>{busy?'Saving…':current?'Save changes':'Save to my account'}</button>{current&&<button type="button" disabled={busy} onClick={()=>save(true)}>Save as a new calculation</button>}<Link href="/calculations">My calculations</Link></div>
  {message&&<p className={error?styles.error:styles.success} role={error?'alert':'status'}>{message}</p>}
  <Dialog.Root open={!!authPath} onOpenChange={open=>{if(!open)setAuthPath('');}}><Dialog.Portal><Dialog.Overlay className={styles.overlay}/><Dialog.Content className={styles.dialog}><Dialog.Close className={styles.close} aria-label="Close"><X size={20}/></Dialog.Close><Dialog.Title>Keep your calculations, wherever you sign in.</Dialog.Title><Dialog.Description>Create a free LineScout account to save this calculation, edit it later and compare your product ideas.</Dialog.Description><p>Your figures are kept in this browser while you sign up. Open your verification email link in this same browser to finish saving them.</p><div className={styles.actions}><Link className={styles.primary} href={'/sign-up?next='+encodeURIComponent(authPath)}>Create a free account</Link><Link href={'/sign-in?next='+encodeURIComponent(authPath)}>Already have an account? Sign in</Link></div></Dialog.Content></Dialog.Portal></Dialog.Root>
 </div>;
}
