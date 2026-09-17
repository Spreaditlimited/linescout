import {calculationCsv} from '@/lib/calculation-csv';
import type {CalculationRecord} from '@/lib/calculation-records';
import crypto from 'node:crypto';
import type {PoolConnection,RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import {db} from '@/lib/db';
import {requireUser} from '@/lib/auth';
import {authOriginAllowed} from '@/lib/password-security';
import {authJson,AuthError} from '@/lib/customer-auth';
import {validateCalculation,calculationResult,validCalculationId} from '@/lib/calculation-records';
import {MARKETS} from '@/lib/amazon-calculator';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(v:unknown)=>typeof v==='string'?JSON.parse(v):v;
function record(r:RowDataPacket){return {id:r.id,name:r.name,platform:r.platform,market:r.market,currency:r.currency,draft:json(r.draft),result:json(r.result),modelVersion:r.model_version,revision:r.revision,createdAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString()};}
async function user(req:Request){try{return await requireUser(req);}catch(e){if(e instanceof Error&&e.message==='Unauthorized')throw new AuthError('Sign in to save and manage your calculations.',401);throw e;}}
function fail(e:unknown){if(e instanceof AuthError)return authJson({ok:false,error:e.message},e.status);console.error('Saved calculation operation failed',e instanceof Error?e.name:'Unknown');return authJson({ok:false,error:'Your calculations are temporarily unavailable. Please try again. Your current figures have not been changed.'},503);}
async function body(req:Request){if(!authOriginAllowed(req))throw new AuthError('Refresh the page and try again.',403);if(!req.headers.get('content-type')?.includes('application/json'))throw new AuthError('Send a JSON request.',415);const raw=await req.text();if(raw.length>16000)throw new AuthError('This calculation is too large.',413);try{const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch{throw new AuthError('Check your request and try again.');}}
async function limit(uid:number){const key=crypto.createHash('sha256').update(`calculations:${uid}:${Math.floor(Date.now()/60000)}`).digest('hex');await db.execute('INSERT INTO linescout_auth_rate_limits (bucket_key,hits,expires_at) VALUES (?,1,DATE_ADD(NOW(),INTERVAL 5 MINUTE)) ON DUPLICATE KEY UPDATE hits=hits+1',[key]);const [r]=await db.execute<RowDataPacket[]>('SELECT hits FROM linescout_auth_rate_limits WHERE bucket_key=?',[key]);if(Number(r[0]?.hits)>60)throw new AuthError('Please wait a minute before saving more changes.',429);}
export async function GET(req:Request){try{
 const u=await user(req),q=new URL(req.url).searchParams,id=q.get('id');
 if(id){if(!validCalculationId(id))throw new AuthError('Calculation not found.',404);const [r]=await db.execute<RowDataPacket[]>('SELECT * FROM linescout_saved_calculations WHERE id=? AND user_id=?',[id,u.id]);if(!r[0])throw new AuthError('Calculation not found.',404);if(q.get('format')==='csv'){let csv;try{csv=calculationCsv(record(r[0]) as CalculationRecord);}catch(e){throw new AuthError((e as Error).message,409);}return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="linescout-calculation-'+id+'.csv"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}return authJson({ok:true,calculation:record(r[0])});}
 const page=Number(q.get('page')||1),platform=q.get('platform')||'',search=(q.get('q')||'').trim();
 if(!Number.isInteger(page)||page<1||page>100000||search.length>160||!['','amazon','tiktok'].includes(platform))throw new AuthError('Choose valid search filters.');
 const args:(string|number)[]=[u.id];let where='user_id=?';if(platform){where+=' AND platform=?';args.push(platform);}if(search){where+=' AND LOCATE(?,name)>0';args.push(search);}
 const [counts]=await db.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM linescout_saved_calculations WHERE ${where}`,args);
 const [rows]=await db.query<RowDataPacket[]>(`SELECT * FROM linescout_saved_calculations WHERE ${where} ORDER BY updated_at DESC,id DESC LIMIT 20 OFFSET ?`,[...args,(page-1)*20]);
 return authJson({ok:true,calculations:rows.map(record),total:Number(counts[0].total),page,pageSize:20});
 }catch(e){return fail(e);}}
export async function POST(req:Request){let conn:PoolConnection|undefined;try{
 const b=await body(req),u=await user(req);await limit(u.id);
 if(typeof b.requestKey!=='string'||!/^[-a-zA-Z0-9_:]{8,100}$/.test(b.requestKey))throw new AuthError('Please try saving again.');
 let input;try{input=validateCalculation(b);}catch(e){throw new AuthError((e as Error).message);}
 const hash=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
 conn=await db.getConnection();await conn.beginTransaction();await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[u.id]);
 const [existing]=await conn.execute<RowDataPacket[]>('SELECT * FROM linescout_saved_calculations WHERE user_id=? AND request_key=?',[u.id,b.requestKey]);
 if(existing[0]){if(existing[0].request_hash!==hash)throw new AuthError('This save request has already been used. Save this as a new calculation.',409);await conn.commit();return authJson({ok:true,calculation:record(existing[0]),existing:true});}
 const [count]=await conn.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM linescout_saved_calculations WHERE user_id=?',[u.id]);if(Number(count[0].total)>=1000)throw new AuthError('You have 1,000 saved calculations. Delete one before saving another.',409);
 const id=crypto.randomUUID();await conn.execute('INSERT INTO linescout_saved_calculations (id,user_id,name,platform,market,currency,draft,result,model_version,request_key,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[id,u.id,input.name,input.platform,input.market,MARKETS[input.market].currency,JSON.stringify(input.draft),JSON.stringify(calculationResult(input)),input.modelVersion,b.requestKey,hash]);
 const [rows]=await conn.execute<RowDataPacket[]>('SELECT * FROM linescout_saved_calculations WHERE id=? AND user_id=?',[id,u.id]);await conn.commit();return authJson({ok:true,calculation:record(rows[0])},201);
 }catch(e){if(conn)await conn.rollback().catch(()=>{});return fail(e);}finally{conn?.release();}}
export async function PATCH(req:Request){try{
 const b=await body(req),u=await user(req);await limit(u.id);if(!validCalculationId(b.id)||!Number.isSafeInteger(b.revision)||b.revision<1)throw new AuthError('Reload this calculation before saving changes.');
 let input;try{input=validateCalculation(b);}catch(e){throw new AuthError((e as Error).message);}
 const [r]=await db.execute<ResultSetHeader>('UPDATE linescout_saved_calculations SET name=?,platform=?,market=?,currency=?,draft=?,result=?,model_version=?,revision=revision+1,updated_at=NOW(3) WHERE id=? AND user_id=? AND revision=?',[input.name,input.platform,input.market,MARKETS[input.market].currency,JSON.stringify(input.draft),JSON.stringify(calculationResult(input)),input.modelVersion,b.id,u.id,b.revision]);
 if(!r.affectedRows){const [found]=await db.execute<RowDataPacket[]>('SELECT id FROM linescout_saved_calculations WHERE id=? AND user_id=?',[b.id,u.id]);throw new AuthError(found.length?'This calculation changed in another tab. Reopen it or save your edits as a new calculation.':'Calculation not found.',found.length?409:404);}
 const [rows]=await db.execute<RowDataPacket[]>('SELECT * FROM linescout_saved_calculations WHERE id=? AND user_id=?',[b.id,u.id]);if(!rows[0])throw new AuthError('Calculation not found.',404);return authJson({ok:true,calculation:record(rows[0])});
 }catch(e){return fail(e);}}
export async function DELETE(req:Request){try{const b=await body(req),u=await user(req);await limit(u.id);if(!validCalculationId(b.id))throw new AuthError('Calculation not found.',404);const [r]=await db.execute<ResultSetHeader>('DELETE FROM linescout_saved_calculations WHERE id=? AND user_id=?',[b.id,u.id]);if(!r.affectedRows)throw new AuthError('Calculation not found.',404);return authJson({ok:true});}catch(e){return fail(e);}}
