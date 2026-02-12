import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,

  ssl: {
    ca: fs.readFileSync(new URL("./ca.pem", import.meta.url)),
  },

  waitForConnections: true,
  connectionLimit: 10,
});

(async () => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    console.log("✅ MySQL Connected:", rows);
  } catch (err) {
    console.error("❌ MySQL Connection Failed:", err);
  }
})();

export default pool;
