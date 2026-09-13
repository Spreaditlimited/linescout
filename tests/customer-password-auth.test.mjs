import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.resolve(import.meta.dirname,"..");

function loader(mocks = {}) {
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    if (!name.startsWith("@/")) return require(name);
    const file=path.join(root,name.slice(2)+".ts");
    if(cache.has(file)) return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const js=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    new Function("require","module","exports",js)(load,module,module.exports);
    return module.exports;
  }
  return load;
}
const security=loader()("@/lib/password-security");
const sender=loader()("@/lib/email-sender");
const password="orchard lantern cobalt rivers";

test("Argon2id hashes are salted and reject wrong or oversized passwords",async()=>{
 const a=await security.hashPassword(password),b=await security.hashPassword(password);
 assert.match(a,/^\$argon2id\$/);assert.notEqual(a,b);
 assert.equal(await security.verifyPassword(a,password),true);
 assert.equal(await security.verifyPassword(a,"incorrect"),false);
 assert.equal(await security.verifyPassword(a,"x".repeat(129)),false);
 assert.equal(await security.verifyPassword("broken",password),false);
 assert.equal(await security.verifyPassword(a,undefined),false);
});
test("password policy, normalized email and random tokens",()=>{
 assert.ok(security.passwordError("short"));assert.equal(security.passwordError(password),"");
 assert.ok(security.passwordError("x".repeat(129)));
 assert.equal(security.normalizedEmail(" Person@Example.com "),"person@example.com");
 assert.equal(security.normalizedEmail("not-an-email"),"");
 const token=security.newToken();assert.match(token,/^[a-f0-9]{64}$/);assert.notEqual(token,security.newToken());assert.notEqual(security.hashToken(token),token);
});
test("only same-origin browser authentication is accepted",()=>{
 for(const host of ["http://localhost:3004","https://linescout.sureimports.com"]){
  assert.equal(security.authOriginAllowed(new Request(host+"/api/auth/password/sign-in",{headers:{origin:host}})),true);
  assert.equal(security.authOriginAllowed(new Request(host+"/api/auth/password/sign-in",{headers:{origin:"https://evil.example"}})),false);
 }
 assert.equal(security.authOriginAllowed(new Request("https://linescout.sureimports.com/api/auth/password/sign-in")),false);
});
test("all configured sender names become Sure Imports without changing mailbox",()=>{
 assert.deepEqual(sender.sureImportsSender("hello@example.com"),{name:"Sure Imports",address:"hello@example.com"});
 assert.deepEqual(sender.sureImportsSender('"hello" <hello@example.com>'),{name:"Sure Imports",address:"hello@example.com"});
 assert.throws(()=>sender.sureImportsSender("hello@example.com\r\nBcc: other@example.com"));
});

function fixture() {
 const state={users:[],credentials:new Map(),tokens:new Map(),limits:new Map(),sessions:[],mails:[],claims:[],mailFails:false,authenticated:1};
 let snapshot;
 const clone=()=>structuredClone({users:state.users,credentials:state.credentials,tokens:state.tokens,sessions:state.sessions,claims:state.claims});
 const conn={
  async beginTransaction(){snapshot=clone();},async commit(){snapshot=undefined;},async rollback(){if(snapshot)Object.assign(state,snapshot);snapshot=undefined;},release(){},
  async query(sql,args){return this.execute(sql,args);},
  async execute(sql,args=[]) {
   const q=sql.replace(/\s+/g," ").trim();
   if(q.includes("GET_LOCK"))return [[{acquired:1}]];
   if(q.includes("RELEASE_LOCK"))return [[{released:1}]];
   if(q.startsWith("INSERT INTO linescout_auth_rate_limits")){state.limits.set(args[0],(state.limits.get(args[0])||0)+1);return [{affectedRows:1}];}
   if(q.startsWith("SELECT hits"))return [[{hits:state.limits.get(args[0])||0}]];
   if(q.startsWith("SELECT u.")){const u=state.users.find(x=>x.email_normalized===args[0]);return [u?[{...u,password_hash:state.credentials.get(u.id)}]:[]];}
   if(q.startsWith("SELECT u.id,(SELECT name FROM linescout_leads") && !q.includes("c.password_hash")){return [state.users.filter(x=>x.email_normalized===args[0])];}
   if(q.startsWith("SELECT password_hash")){const h=state.credentials.get(args[0]);return [h?[{password_hash:h}]:[]];}
   if(q.startsWith("INSERT INTO linescout_password_tokens")){const [token_hash,email_normalized,purpose,user_id,credential_version,next_path,affiliate_code]=args;state.tokens.set(token_hash,{token_hash,email_normalized,purpose,user_id,credential_version,next_path,affiliate_code,expired:false,consumed_at:null});return [{affectedRows:1}];}
   if(q.startsWith("SELECT email_normalized FROM linescout_password_tokens")||q.startsWith("SELECT * FROM linescout_password_tokens")){const t=state.tokens.get(args[0]);return [t&&!t.expired&&!t.consumed_at?[t]:[]];}
   if(q.startsWith("DELETE FROM linescout_password_tokens")){state.tokens.delete(args[0]);return [{affectedRows:1}];}
   if(q.startsWith("INSERT INTO users")){const id=state.users.length+1;state.users.push({id,email:args[0],email_normalized:args[1]});return [{insertId:id}];}
   if(q.startsWith("INSERT INTO linescout_user_credentials")){state.credentials.set(args[0],args[1]);return [{affectedRows:1}];}
   if(q.startsWith("UPDATE linescout_user_credentials")){state.credentials.set(args[1],args[0]);return [{affectedRows:1}];}
   if(q.startsWith("UPDATE linescout_password_tokens")){for(const t of state.tokens.values())if(t.email_normalized===args[0])t.consumed_at=true;return [{affectedRows:1}];}
   if(q.startsWith("UPDATE linescout_user_sessions")){for(const s of state.sessions)if(s.user_id===args[0])s.revoked=true;return [{affectedRows:1}];}
   if(q.startsWith("INSERT INTO linescout_user_sessions")){state.sessions.push({user_id:args[0],hash:args[1],revoked:false});return [{affectedRows:1}];}
   if(q.startsWith("UPDATE email_otps"))return [{affectedRows:1}];
   throw Error("Unhandled SQL in test: "+q);
  }
 };
 const db={execute:conn.execute.bind(conn),getConnection:async()=>conn};
 const load=loader({"@/lib/db":{db},"@/lib/auth":{requireUser:async()=>state.users.find(u=>u.id===state.authenticated)},"@/lib/country-config":{getNigeriaDefaults:async()=>({country_id:1,display_currency_code:"NGN"})},"@/lib/notice-email":{sendNoticeEmail:async mail=>{if(state.mailFails)throw Error("SMTP failed");state.mails.push(mail);return {ok:true};}},"@/lib/affiliates":{attachAffiliateReferral:async(_conn,claim)=>{if(!state.claims.some(x=>x.referred_user_id===claim.referred_user_id))state.claims.push(claim);return {ok:true};}},"@/lib/central-affiliate-attribution":{SUREIMPORTS_ATTRIBUTION_COOKIE:"central_ref",parseCentralAffiliateAttribution:()=>null}});
 const {POST}=load("@/app/api/auth/password/[action]/route");
 async function call(action,body,headers={}){const req=new Request("http://localhost:3004/api/auth/password/"+action,{method:"POST",headers:{origin:"http://localhost:3004","content-type":"application/json",...headers},body:JSON.stringify(body)});const response=await POST(req,{params:Promise.resolve({action})});return {response,data:await response.json()};}
 function latestToken(){return new URL(state.mails.findLast(m=>m.ctaUrl).ctaUrl).hash.split("=")[1];}
 return {state,call,latestToken};
}
test("registration verifies email before creating an account, preserves referral, consumes link once",async()=>{
 const f=fixture();
 assert.equal((await f.call("email-link",{email:"new@example.com",purpose:"signup",next:"/quotes"},{cookie:"linescout_affiliate_ref=partner123"})).response.status,200);
 assert.equal(f.state.users.length,0);const token=f.latestToken();
 assert.ok(!JSON.stringify([...f.state.tokens.keys()]).includes(token));
 const result=await f.call("set-password",{token,password});assert.equal(result.response.status,200);
 assert.equal(f.state.users.length,1);assert.equal(f.state.claims[0].affiliate_code,"partner123");
 assert.equal(result.response.headers.get("set-cookie"),null);
 assert.equal((await f.call("set-password",{token,password})).response.status,400);
 const login=await f.call("sign-in",{email:"new@example.com",password,next:"//evil.example"});
 assert.equal(login.response.status,200);assert.match(login.response.headers.get("set-cookie"),/HttpOnly/);
 assert.equal(login.data.refresh_token,undefined);assert.match(login.data.next,/^\/onboarding\/name/);
 assert.equal(f.state.sessions.length,1);
});
test("existing OTP customer sets password on same account; sign-in sends no email",async()=>{
 const f=fixture();f.state.users.push({id:7,email:"existing@example.com",email_normalized:"existing@example.com",profile_name:"Existing Customer"});
 await f.call("email-link",{email:"existing@example.com",purpose:"setup"});
 assert.equal((await f.call("set-password",{token:f.latestToken(),password})).response.status,200);
 const count=f.state.mails.length;
 const login=await f.call("sign-in",{email:"EXISTING@example.com",password,next:"/payments"});
 assert.equal(login.data.next,"/payments");assert.equal(f.state.users.length,1);assert.ok(f.state.credentials.has(7));assert.equal(f.state.mails.length,count);
});
test("password reset revokes sessions and earlier links; expired links fail",async()=>{
 const f=fixture();f.state.users.push({id:1,email:"reset@example.com",email_normalized:"reset@example.com"});f.state.credentials.set(1,await security.hashPassword(password));f.state.sessions.push({user_id:1,revoked:false},{user_id:2,revoked:false});
 await f.call("email-link",{email:"reset@example.com",purpose:"reset"});const first=f.latestToken();
 await f.call("email-link",{email:"reset@example.com",purpose:"reset"});const second=f.latestToken();
 f.state.tokens.get(security.hashToken(first)).expired=true;
 assert.equal((await f.call("set-password",{token:first,password})).response.status,400);
 assert.equal((await f.call("set-password",{token:second,password:"a new unique password sentence"})).response.status,200);
 assert.equal(f.state.sessions[0].revoked,true);assert.equal(f.state.sessions[1].revoked,false);
 assert.equal((await f.call("sign-in",{email:"reset@example.com",password})).response.status,401);
});
test("unknown accounts return generic email response; mail failure invalidates token",async()=>{
 const f=fixture();const unknown=await f.call("email-link",{email:"missing@example.com",purpose:"reset"});assert.equal(unknown.response.status,200);assert.equal(f.state.mails.length,0);
 f.state.mailFails=true;assert.equal((await f.call("email-link",{email:"new@example.com",purpose:"signup"})).response.status,503);assert.equal(f.state.tokens.size,0);
});
test("sign-up cannot overwrite a password account and invalid origins fail before writes",async()=>{
 const f=fixture();f.state.users.push({id:1,email:"known@example.com",email_normalized:"known@example.com"});f.state.credentials.set(1,await security.hashPassword(password));
 await f.call("email-link",{email:"known@example.com",purpose:"signup"});assert.equal(f.state.tokens.size,0);
 assert.equal((await f.call("sign-in",{email:"known@example.com",password},{origin:"https://evil.example"})).response.status,403);assert.equal(f.state.sessions.length,0);
});
test("email throttling limits sends and invalid token/password errors are explicit",async()=>{
 const f=fixture();for(let i=0;i<3;i++)await f.call("email-link",{email:"new@example.com",purpose:"signup"});
 assert.equal((await f.call("email-link",{email:"new@example.com",purpose:"signup"})).response.status,429);
 assert.equal((await f.call("set-password",{token:"bad",password})).response.status,400);
 assert.equal((await f.call("set-password",{token:f.latestToken(),password:"short"})).response.status,400);
});
test("change-password requires current password and rotates session",async()=>{
 const f=fixture();f.state.users.push({id:1,email:"profile@example.com",email_normalized:"profile@example.com"});f.state.credentials.set(1,await security.hashPassword(password));f.state.sessions.push({user_id:1,revoked:false});
 assert.equal((await f.call("change-password",{currentPassword:"wrong",password})).response.status,400);
 assert.equal((await f.call("change-password",{currentPassword:password,password:"another long and unique password"})).response.status,200);
 assert.equal(f.state.sessions[0].revoked,true);assert.equal(f.state.sessions[1].revoked,false);
});
