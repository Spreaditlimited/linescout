import Link from 'next/link';
import { calculatorHref } from '@/lib/amazon-calculator';
export default function CalculatorLink({name,currency,low,high}:{name:string;currency:string;low?:number|null;high?:number|null}){
  if(!['GBP','CAD','USD'].includes(currency))return null;
  return <Link href={calculatorHref(name,currency,low,high)} className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-700">Calculate potential margin</Link>;
}
