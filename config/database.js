const { Pool } = require("pg");

/* ---------------- NEON POSTGRES CONNECTION ---------------- */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, 
  },
  // Connection pool settings to handle Neon's connection limits
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
});

// Handle pool errors globally to prevent crashes
pool.on('error', (err, client) => {
  console.error('Unexpected database pool error:', err.message);
  // Don't exit process - let the pool recover
});

/* ---------------- CONNECTING WITH DATABASE ---------------- */
const ConnectDB = async () => {
  try {
    const client = await pool.connect();
    console.log("Neon PostgreSQL Connected Successfully");
    client.release();
  } catch (error) {
    console.error("Failed to connect with Neon DB:", error.message);
    // Don't exit - let the app continue and retry connections
  }
};

module.exports = {
  pool,
  ConnectDB,
};
