// Uses connection-local TEMPORARY tables. No permanent customer records or emails are created.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import mysql from "mysql2/promise";
const require=createRequire(import.meta.url),ts=require("typescript");
const root=path.resolve(import.meta.dirname,"..");
const conn=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
const mails=[],claims=[];
try {
  for(const table of ["users","linescout_leads","linescout_user_credentials","linescout_password_tokens","linescout_auth_rate_limits","linescout_user_sessions","pending_users","email_otps"]) {
    const [definition] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
    const ddl = definition[0]["Create Table"].replace(/^CREATE TABLE/, "CREATE TEMPORARY TABLE").replace(/,\n\s*CONSTRAINT [^\n]+/g, "");
    await conn.query(ddl);
  }
  const wrapped={execute:conn.execute.bind(conn),query:conn.query.bind(conn),beginTransaction:conn.beginTransaction.bind(conn),commit:conn.commit.bind(conn),rollback:conn.rollback.bind(conn),release(){}};
  const db={...wrapped,getConnection:async()=>wrapped};
  const mocks={"@/lib/db":{db},"@/lib/auth":{requireUser:async()=>{const [rows]=await conn.query("SELECT id,email FROM users LIMIT 1");return rows[0];}},"@/lib/country-config":{getNigeriaDefaults:async()=>({country_id:1,display_currency_code:"NGN"})},"@/lib/affiliates":{attachAffiliateReferral:async(_c,p)=>{if(!claims.some(c=>c.referred_user_id===p.referred_user_id))claims.push(p);}},"@/lib/central-affiliate-attribution":{SUREIMPORTS_ATTRIBUTION_COOKIE:"central_ref",parseCentralAffiliateAttribution:()=>null},"@/lib/notice-email":{sendNoticeEmail:async mail=>{mails.push(mail);return {ok:true};}}};
  const cache=new Map();
  function load(name){if(name in mocks)return mocks[name];if(!name.startsWith("@/"))return require(name);const file=path.join(root,name.slice(2)+".ts");if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const js=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function("require","module","exports",js)(load,module,module.exports);return module.exports;}
  const {POST}=load("@/app/api/auth/password/[action]/route");
  async function call(action,body){const res=await POST(new Request("http://localhost:3004/api/auth/password/"+action,{method:"POST",headers:{origin:"http://localhost:3004","content-type":"application/json",cookie:"linescout_affiliate_ref=example-ref"},body:JSON.stringify(body)}),{params:Promise.resolve({action})});return {status:res.status,body:await res.json(),cookie:res.headers.get("set-cookie")};}
  const email="auth-smoke@example.invalid",password="sunlight orchard lantern cobalt";
  assert.equal((await call("email-link",{email,purpose:"signup"})).status,200);
  let [users]=await conn.query("SELECT id FROM users");assert.equal(users.length,0);
  let token=mails.findLast(x=>x.ctaUrl).ctaUrl.split("#token=")[1];
  let result=await call("set-password",{token,password});assert.equal(result.status,200,JSON.stringify(result.body));
  [users]=await conn.query("SELECT id FROM users");assert.equal(users.length,1);assert.equal(claims.length,1);
  assert.equal((await call("set-password",{token,password})).status,400);
  const login=await call("sign-in",{email,password});assert.equal(login.status,200,JSON.stringify(login.body));assert.match(login.cookie,/HttpOnly/);
  const [sessions]=await conn.query("SELECT refresh_token_hash FROM linescout_user_sessions");assert.equal(sessions.length,1);assert.ok(!login.cookie.includes(sessions[0].refresh_token_hash));
  assert.equal((await call("email-link",{email,purpose:"reset"})).status,200);
  token=mails.findLast(x=>x.ctaUrl).ctaUrl.split("#token=")[1];
  result=await call("set-password",{token,password:password+" new"});assert.equal(result.status,200,JSON.stringify(result.body));
  const [revoked]=await conn.query("SELECT revoked_at FROM linescout_user_sessions");assert.ok(revoked[0].revoked_at);
  assert.equal((await call("sign-in",{email,password})).status,401);
  assert.equal((await call("sign-in",{email,password:password+" new"})).status,200);
  result=await call("change-password",{currentPassword:password+" new",password:password+" changed"});assert.equal(result.status,200,JSON.stringify(result.body));
  const [finalUsers]=await conn.query("SELECT id FROM users");assert.equal(finalUsers.length,1);
  console.log("PASS: real SQL signup, password setup, single-use tokens, sign-in, reset, revocation, change-password; original account ID retained.");
  console.log("All records were connection-local temporary fixtures. No email sent; closing removes all fixtures.");
} finally {await conn.end();}
