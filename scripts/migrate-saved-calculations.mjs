import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
const sql=await fs.readFile(new URL('../migrations/20260918000000_saved_calculations.sql',import.meta.url),'utf8');
const conn=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
try {await conn.query('SELECT id FROM users LIMIT 0');await conn.query(sql);console.log('Saved calculations migration 20260918000000 applied.');}finally{await conn.end();}
