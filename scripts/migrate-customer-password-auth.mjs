import fs from "node:fs/promises";
import mysql from "mysql2/promise";
const sql = await fs.readFile(new URL("../migrations/20260914000000_customer_password_auth.sql", import.meta.url), "utf8");
const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, multipleStatements: true });
try {
  // Validate existing dependencies before applying additive tables. Never run from an auth request.
  await conn.query("SELECT id,email,email_normalized,country_id,display_currency_code FROM users LIMIT 0");
  await conn.query("SELECT user_id,refresh_token_hash,expires_at,revoked_at FROM linescout_user_sessions LIMIT 0");
  await conn.query(sql);
  console.log("Customer password authentication migration applied (3 additive tables).");
} finally { await conn.end(); }
