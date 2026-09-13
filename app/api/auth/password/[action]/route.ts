import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSafeNextPath } from "@/lib/safe-next-path";
import { getNigeriaDefaults } from "@/lib/country-config";
import { attachAffiliateReferral } from "@/lib/affiliates";
import { parseCentralAffiliateAttribution, SUREIMPORTS_ATTRIBUTION_COOKIE } from "@/lib/central-affiliate-attribution";
import { sendNoticeEmail } from "@/lib/notice-email";
import { AuthError, authJson, cookieValue, issueSession, limitAuth } from "@/lib/customer-auth";
import { authOriginAllowed, hashPassword, hashToken, newToken, normalizedEmail, passwordError, verifyPassword } from "@/lib/password-security";

export const runtime = "nodejs";
const genericMailMessage = "If this email is eligible, we have sent a link. Check your inbox and spam folder.";
let dummyHash: Promise<string> | undefined;

function destination(next: unknown, user: RowDataPacket) {
  let path = getSafeNextPath(String(next || ""));
  if (path === "/white-label" || path.startsWith("/white-label?")) path = "/white-label/ideas";
  if (!path || /^\/(sign-in|sign-up|forgot-password|set-password|reset-password)(\/|\?|$)/.test(path)) path = "/dashboard";
  return !user.profile_name || user.profile_name === "Unknown" ? `/onboarding/name?next=${encodeURIComponent(path)}` : path;
}
async function passwordNotice(email: string) {
  try {
    const sent = await sendNoticeEmail({ to: email, subject: "Your LineScout password was updated", title: "Your password has been updated", lines: ["Your LineScout password was updated and previous sessions were signed out.", "If you did not make this change, reset your password immediately or contact hello@sureimports.com."], footerNote: "Security notification for your LineScout account." });
    if (!sent.ok) console.error("Password notification could not be sent");
  } catch { console.error("Password notification could not be sent"); }
}

export async function POST(req: Request, context: { params: Promise<{ action: string }> }) {
  let conn: PoolConnection | undefined;
  let lock = "";
  let transaction = false;
  try {
    if (!authOriginAllowed(req)) throw new AuthError("This request came from an invalid origin. Reload the page and try again.", 403);
    if (!req.headers.get("content-type")?.includes("application/json")) throw new AuthError("Send a JSON request.",415);
    const raw = await req.text();
    if (raw.length > 8192) throw new AuthError("Request is too large.",413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AuthError("Invalid request.");
    const { action } = await context.params;
    if (!["sign-in","email-link","set-password","change-password"].includes(action)) return authJson({ok:false,error:"Not found"},404);
    const email = normalizedEmail(body.email);

    if (action === "sign-in") {
      await limitAuth(req,"login",email);
      if (!email || typeof body.password !== "string" || body.password.length > 128) throw new AuthError("Email or password is incorrect.",401);
      const [rows] = await db.execute<RowDataPacket[]>(`SELECT u.id,(SELECT name FROM linescout_leads WHERE email=u.email ORDER BY created_at DESC LIMIT 1) AS profile_name,c.password_hash FROM users u LEFT JOIN linescout_user_credentials c ON c.user_id=u.id WHERE u.email_normalized=? LIMIT 1`,[email]);
      dummyHash ||= hashPassword(newToken());
      const user = rows[0];
      const valid = await verifyPassword(user?.password_hash || await dummyHash,body.password);
      if (!valid || !user?.password_hash) throw new AuthError("Email or password is incorrect. If you previously used a code, select Set your password.",401);
      conn = await db.getConnection();
      await conn.beginTransaction(); transaction = true;
      const [current] = await conn.execute<RowDataPacket[]>("SELECT password_hash FROM linescout_user_credentials WHERE user_id=? FOR UPDATE",[user.id]);
      if (current[0]?.password_hash !== user.password_hash) throw new AuthError("Your password changed. Please sign in again.",401);
      const attribution = parseCentralAffiliateAttribution(cookieValue(req,SUREIMPORTS_ATTRIBUTION_COOKIE));
      const referral = cookieValue(req,"linescout_affiliate_ref") || attribution?.referralCode;
      if (referral) await attachAffiliateReferral(conn,{affiliate_code:referral.slice(0,64),referred_user_id:Number(user.id),source:"web"});
      const response = await issueSession(conn,req,Number(user.id),destination(body.next,user));
      await conn.commit(); transaction = false;
      return response;
    }

    if (action === "email-link") {
      await limitAuth(req,"email",email);
      if (!email) throw new AuthError("Enter a valid email address.");
      const purpose = body.purpose;
      if (!["signup","setup","reset"].includes(purpose)) throw new AuthError("Choose a valid account action.");
      const [users] = await db.execute<RowDataPacket[]>("SELECT u.id,c.password_hash FROM users u LEFT JOIN linescout_user_credentials c ON c.user_id=u.id WHERE u.email_normalized=? LIMIT 1",[email]);
      const user = users[0];
      if ((!user && purpose !== "signup") || (user?.password_hash && purpose !== "reset")) return authJson({ok:true,message:genericMailMessage});
      const token = newToken();
      const next = getSafeNextPath(String(body.next || "")).slice(0,1024);
      const central = parseCentralAffiliateAttribution(cookieValue(req,SUREIMPORTS_ATTRIBUTION_COOKIE));
      const referral = (cookieValue(req,"linescout_affiliate_ref") || central?.referralCode || "").slice(0,64);
      await db.execute(`INSERT INTO linescout_password_tokens (token_hash,email_normalized,purpose,user_id,credential_version,next_path,affiliate_code,expires_at) VALUES (?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))`,[hashToken(token),email,purpose,user?.id || null,user?.password_hash || null,next,referral || null]);
      const origin = process.env.NODE_ENV === "production" ? "https://linescout.sureimports.com" : req.headers.get("origin")!;
      const link = `${origin}/set-password#token=${token}`;
      try {
        const sent = await sendNoticeEmail({ to: email, subject: purpose === "reset" ? "Reset your LineScout password" : "Set up your LineScout password", title: purpose === "signup" ? "Verify your email and create your password" : "Choose your LineScout password", lines: ["Use the secure link below to choose your password. This link expires in 30 minutes and can be used only once.", "If you did not request this, you can ignore this email. Your account will not be changed."], ctaLabel: "Choose your password", ctaUrl: link, footerNote: "Account security email from Sure Imports." });
        if (!sent.ok) throw new Error("Mail unavailable");
      } catch {
        await db.execute("DELETE FROM linescout_password_tokens WHERE token_hash=?",[hashToken(token)]);
        throw new AuthError("We could not send the email. Please try again shortly.",503);
      }
      return authJson({ok:true,message:genericMailMessage});
    }

    if (action === "change-password") {
      const user = await requireUser(req).catch(()=>{throw new AuthError("Please sign in again.",401);});
      await limitAuth(req,"change",String(user.id));
      const error = passwordError(body.password);
      if (error) throw new AuthError(error);
      const [rows] = await db.execute<RowDataPacket[]>("SELECT password_hash FROM linescout_user_credentials WHERE user_id=?",[user.id]);
      const old = rows[0]?.password_hash;
      if (!old) throw new AuthError("Set your first password using the email link option.");
      if (!await verifyPassword(old,body.currentPassword)) throw new AuthError("Your current password is incorrect.");
      const encoded = await hashPassword(body.password);
      conn = await db.getConnection();
      await conn.beginTransaction(); transaction = true;
      const [current] = await conn.execute<RowDataPacket[]>("SELECT password_hash FROM linescout_user_credentials WHERE user_id=? FOR UPDATE",[user.id]);
      if(current[0]?.password_hash !== old) throw new AuthError("Your password changed. Please sign in again.",409);
      await conn.execute("UPDATE linescout_user_credentials SET password_hash=?,password_changed_at=NOW() WHERE user_id=?",[encoded,user.id]);
      await conn.execute("UPDATE linescout_user_sessions SET revoked_at=NOW() WHERE user_id=? AND revoked_at IS NULL",[user.id]);
      await conn.execute("UPDATE linescout_password_tokens SET consumed_at=NOW() WHERE email_normalized=? AND consumed_at IS NULL",[user.email.toLowerCase()]);
      await conn.execute("UPDATE email_otps o JOIN pending_users p ON p.id=o.pending_user_id SET o.consumed_at=NOW() WHERE p.email_normalized=? AND o.consumed_at IS NULL",[user.email.toLowerCase()]);
      const response = await issueSession(conn,req,user.id,"/profile");
      await conn.commit(); transaction = false;
      conn.release(); conn = undefined;
      await passwordNotice(user.email);
      return response;
    }

    // A link authorizes password setup only; it never signs someone in on GET.
    await limitAuth(req,"token");
    if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token)) throw new AuthError("This link is invalid. Request a new password link.");
    const error = passwordError(body.password);
    if (error) throw new AuthError(error);
    const tokenHash = hashToken(body.token);
    const [candidates] = await db.execute<RowDataPacket[]>("SELECT email_normalized FROM linescout_password_tokens WHERE token_hash=? AND consumed_at IS NULL AND expires_at>NOW()",[tokenHash]);
    if (!candidates[0]) throw new AuthError("This link has expired or has already been used. Request a new link.");
    const encoded = await hashPassword(body.password);
    conn = await db.getConnection();
    lock = "ls-auth:" + hashToken(candidates[0].email_normalized).slice(0,48);
    const [locked] = await conn.execute<RowDataPacket[]>("SELECT GET_LOCK(?,5) AS acquired",[lock]);
    if(Number(locked[0]?.acquired)!==1) throw new AuthError("Another account update is in progress. Try again shortly.",409);
    await conn.beginTransaction(); transaction = true;
    const [tokens] = await conn.execute<RowDataPacket[]>("SELECT * FROM linescout_password_tokens WHERE token_hash=? AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE",[tokenHash]);
    const token = tokens[0];
    if(!token) throw new AuthError("This link has expired or has already been used. Request a new link.");
    const [users] = await conn.execute<RowDataPacket[]>("SELECT u.id,(SELECT name FROM linescout_leads WHERE email=u.email ORDER BY created_at DESC LIMIT 1) AS profile_name FROM users u WHERE email_normalized=? LIMIT 1 FOR UPDATE",[token.email_normalized]);
    let user = users[0];
    if (token.user_id && Number(user?.id) !== Number(token.user_id)) throw new AuthError("This link is no longer valid. Request a new link.");
    if (!user) {
      if (token.purpose !== "signup") throw new AuthError("This link is no longer valid.");
      const defaults = await getNigeriaDefaults(conn);
      const [created] = await conn.execute<import("mysql2/promise").ResultSetHeader>("INSERT INTO users (email,email_normalized,country_id,display_currency_code) VALUES (?,?,?,?)",[token.email_normalized,token.email_normalized,defaults.country_id || null,defaults.display_currency_code]);
      user = {id:created.insertId} as RowDataPacket;
    }
    const [credentials] = await conn.execute<RowDataPacket[]>("SELECT password_hash FROM linescout_user_credentials WHERE user_id=? FOR UPDATE",[user.id]);
    if ((credentials[0]?.password_hash || null) !== (token.credential_version || null)) throw new AuthError("Your password has changed since this link was sent. Request a new link.");
    await conn.execute(`INSERT INTO linescout_user_credentials (user_id,password_hash,email_verified_at,password_changed_at) VALUES (?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),email_verified_at=NOW(),password_changed_at=NOW()`,[user.id,encoded]);
    await conn.execute("UPDATE linescout_password_tokens SET consumed_at=NOW() WHERE email_normalized=? AND consumed_at IS NULL",[token.email_normalized]);
    await conn.execute("UPDATE linescout_user_sessions SET revoked_at=NOW() WHERE user_id=? AND revoked_at IS NULL",[user.id]);
    await conn.execute("UPDATE email_otps o JOIN pending_users p ON p.id=o.pending_user_id SET o.consumed_at=NOW() WHERE p.email_normalized=? AND o.consumed_at IS NULL",[token.email_normalized]);
    // Existing attribution is immutable; attachAffiliateReferral preserves an existing owner.
    if(token.affiliate_code) await attachAffiliateReferral(conn,{affiliate_code:token.affiliate_code,referred_user_id:Number(user.id),source:"web"});
    // Require a normal sign-in after recovery; no password-reset session is issued.
    const next = destination(token.next_path,user);
    await conn.commit(); transaction = false;
    await conn.execute("SELECT RELEASE_LOCK(?)",[lock]); lock = "";
    conn.release(); conn = undefined;
    await passwordNotice(token.email_normalized);
    return authJson({ok:true,message:"Your password is saved. Sign in with your email and password.",next});
  } catch (error) {
    if(transaction && conn) await conn.rollback();
    if(error instanceof AuthError) return authJson({ok:false,error:error.message},error.status);
    if(error instanceof SyntaxError) return authJson({ok:false,error:"Invalid request."},400);
    console.error("Customer authentication request failed", { code: (error as {code?:string})?.code || "UNKNOWN" });
    return authJson({ok:false,error:"Account service is temporarily unavailable. Please try again shortly."},503);
  } finally {
    if(conn) { if(lock) await conn.execute("SELECT RELEASE_LOCK(?)",[lock]).catch(()=>{}); conn.release(); }
  }
}
