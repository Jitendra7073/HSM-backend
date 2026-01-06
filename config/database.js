const { Pool } = require("pg");

/* ---------------- NEON POSTGRES CONNECTION ---------------- */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, 
  },
});

/* ---------------- CONNECTING WITH DATABASE ---------------- */
const ConnectDB = async () => {
  try {
    const client = await pool.connect();
    console.log("DB Connected Successfully");
    client.release();
  } catch (error) {
    console.error("Failed to connect with DB:", error.message);
  }
};

module.exports = {
  pool,
  ConnectDB,
};
