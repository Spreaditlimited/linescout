import { shouldBypassLocalCaptcha } from './localCaptchaBypass';
export async function verifyRecaptchaToken(token:unknown,request:Request,action:string):Promise<boolean>{
 if(shouldBypassLocalCaptcha(new URL(request.url).hostname))return true;
 const secret=process.env.GOOGLE_CAPTCHA_SECRET_KEY;
 if(!secret||typeof token!=='string'||!token||token.length>4096)return false;
 try{
  const response=await fetch('https://www.google.com/recaptcha/api/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret,response:token}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)return false;const result=await response.json();
  const hosts=new Set(['linescout.sureimports.com',process.env.VERCEL_URL,process.env.VERCEL_BRANCH_URL].filter(Boolean));
  return result.success===true&&result.action===action&&typeof result.score==='number'&&result.score>=0.5&&hosts.has(result.hostname);
 }catch{return false;}
}
