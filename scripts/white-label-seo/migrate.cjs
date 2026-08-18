const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

async function run() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? {} : undefined,
    multipleStatements: true,
  });
  try {
    await connection.query(sql);
    console.log("White-label SEO schema is ready.");
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

