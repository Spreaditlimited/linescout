// test-db.js
require("dotenv").config({ path: ".env.local" });

const mysql = require("mysql2/promise");

(async () => {
  try {
    const cfg = {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    };

    console.log("DB CONFIG CHECK:", {
      host: cfg.host,
      user: cfg.user,
      database: cfg.database,
      port: cfg.port,
      hasPassword: Boolean(cfg.password),
    });

    const conn = await mysql.createConnection(cfg);
    const [rows] = await conn.query("SELECT 1 AS ok");
    console.log("DB OK:", rows);

    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error("DB FAIL:", err);
    process.exit(1);
  }
})();