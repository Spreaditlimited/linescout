'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import MarketplaceCalculator from '@/app/(marketing)/amazon-profit-calculator/MarketplaceCalculator';
import {CALCULATION_VERSION,validateCalculation,validCalculationId,type CalculationRecord} from '@/lib/calculation-records';
import {calculationRequest,CalculationRequestError,PENDING_PREFIX,saveCalculation,type PendingCalculation} from '@/lib/calculation-account-client';
import type {Market} from '@/lib/amazon-calculator';
import styles from './CalculationAccount.module.css';
type Props={initialMarket:Market;product:string;low:number|null;high:number|null;initialPlatform:'amazon'|'tiktok';savedId:string;pendingId:string};
export default function AccountCalculatorLoader({savedId,pendingId,...props}:Props){
 const [record,setRecord]=useState<CalculationRecord>(),[loading,setLoading]=useState(!!savedId||!!pendingId),[error,setError]=useState(''),[auth,setAuth]=useState(false),[notice,setNotice]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!savedId&&!pendingId)return;let active=true;setLoading(true);setError('');setAuth(false);
  async function load(){try{let result:CalculationRecord;
   if(pendingId){let pending:PendingCalculation;try{const text=localStorage.getItem(PENDING_PREFIX+pendingId);if(!text)throw Error();pending=JSON.parse(text);if(!pending.expires||pending.expires<Date.now()||pending.requestKey!==pendingId)throw Error();validateCalculation(pending);}catch{throw Error('This draft is not available in this browser, or it has expired. Open the sign-in link in the browser where you created it, or start a new calculation.');}
    result=await saveCalculation(pending,pending.requestKey,pending.id?{id:pending.id,revision:pending.revision!}:undefined);
    if(active){try{localStorage.removeItem(PENDING_PREFIX+pendingId);}catch{}setNotice('Your calculation has been saved to your account.');window.history.replaceState(null,'','/amazon-profit-calculator?saved='+result.id);}
   }else{if(!validCalculationId(savedId))throw Error('Calculation not found.');result=(await calculationRequest('?id='+encodeURIComponent(savedId))).calculation;}
   // Saved assumptions remain unchanged even if defaults have changed.
   validateCalculation({...result,modelVersion:CALCULATION_VERSION});if(active)setRecord(result);
  }catch(e){if(active){if(e instanceof CalculationRequestError&&e.status===401)setAuth(true);setError((e as Error).message);}}finally{if(active)setLoading(false);}}
  void load();return ()=>{active=false;};
 },[savedId,pendingId,retry]);
 const next='/amazon-profit-calculator?'+new URLSearchParams(pendingId?{pending:pendingId}:{saved:savedId});
 if(loading||error)return <section className={styles.empty} style={{margin:'140px auto 60px',maxWidth:680}}><h1>{loading?'Opening your calculation…':auth?'Sign in to continue':'We could not open this calculation'}</h1><p role={loading?'status':'alert'}>{error||'Your saved figures will be restored in a moment.'}</p>{auth?<Link className={styles.button} href={'/sign-in?next='+encodeURIComponent(next)}>Sign in</Link>:error?<div className={styles.actions}><button onClick={()=>setRetry(v=>v+1)}>Try again</button><Link href="/calculations">My calculations</Link><Link href="/amazon-profit-calculator">Start a new calculation</Link></div>:null}</section>;
 return <>{notice&&<p className={styles.success} role="status" style={{margin:'110px 24px 0'}}>{notice}</p>}<MarketplaceCalculator key={record?.id||'new'} {...props} initialPlatform={record?.platform||props.initialPlatform} initialMarket={record?.market||props.initialMarket} initialRecord={record}/></>;
}
