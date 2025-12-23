const { Pool } = require("pg");

/* ---------------- POSTGRES CONNECTION CREDENTIALS ---------------- */
const pool = new Pool({
  host: "localhost",
  user: "postgres",
  port: 5432,
  password: "password",
  database: "home-service-management",
});

/* ---------------- CONNECTING WITH DATABASE ---------------- */
const ConnectDB = () => {
  pool
    .connect()
    .then(() => {
      console.log("Database Connected Successfully.");
    })
    .catch((error) => {
      console.error(`Failed to connect with database : ${error}`);
    });
};

module.exports = ConnectDB;
