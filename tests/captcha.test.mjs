import test from 'node:test';import assert from 'node:assert/strict';import{registerHooks}from'node:module';
const hook=registerHooks({resolve(s,c,n){if(s==='./localCaptchaBypass')return n(s+'.ts',c);return n(s,c)}});
const{verifyRecaptchaToken}=await import('../lib/security/recaptcha.ts');hook.deregister();
test('CAPTCHA fails closed in production, validates host/action/score and bypasses only local development',async()=>{
 const old={mode:process.env.NODE_ENV,secret:process.env.GOOGLE_CAPTCHA_SECRET_KEY,vercel:process.env.VERCEL,fetch:globalThis.fetch};let calls=0;let payload={success:true,score:.9,hostname:'linescout.sureimports.com',action:'linescout_sign_in'};
 globalThis.fetch=async()=>{calls++;return Response.json(payload)};process.env.NODE_ENV='production';process.env.GOOGLE_CAPTCHA_SECRET_KEY='mock';const request=new Request('https://linescout.sureimports.com/api/auth/password/sign-in');
 try{
 assert.equal(await verifyRecaptchaToken(null,request,'linescout_sign_in'),false);assert.equal(calls,0);
 assert.equal(await verifyRecaptchaToken('token',request,'linescout_sign_in'),true);
 for(const change of [{score:.1},{action:'other'},{hostname:'evil.example'},{success:false}]){const before=payload;payload={...payload,...change};assert.equal(await verifyRecaptchaToken('token',request,'linescout_sign_in'),false);payload=before;}
 delete process.env.GOOGLE_CAPTCHA_SECRET_KEY;assert.equal(await verifyRecaptchaToken('token',request,'linescout_sign_in'),false);
 const local=new Request('http://192.168.1.173:3004/api/auth/password/sign-in');assert.equal(await verifyRecaptchaToken(null,local,'linescout_sign_in'),false);
 process.env.NODE_ENV='development';delete process.env.VERCEL;assert.equal(await verifyRecaptchaToken(null,local,'linescout_sign_in'),true);assert.equal(await verifyRecaptchaToken(null,request,'linescout_sign_in'),false);
 process.env.VERCEL='1';assert.equal(await verifyRecaptchaToken(null,local,'linescout_sign_in'),false);
 }finally{globalThis.fetch=old.fetch;for(const[k,v]of Object.entries({NODE_ENV:old.mode,GOOGLE_CAPTCHA_SECRET_KEY:old.secret,VERCEL:old.vercel})){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
