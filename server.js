const express = require("express");
const http = require("http");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const { ConnectDB } = require("./config/database");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

/* ---------------- STRIPE WEBHOOK ---------------- */
const {
  stripeWebhookHandler,
} = require("./controllers/stripeWebHooks.controller");

app.post(
  "/api/v1/payment/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

/* ---------------- MIDDLEWARES ---------------- */
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

ConnectDB();

const { checkAuthToken } = require("./middleware/checkToken");
const { RoleBasedAccess } = require("./middleware/checkRole");

const AuthRoutes = require("./routes/auth.route");
const CommonRoute = require("./routes/common.route");
const PaymentRoute = require("./routes/payment.route");
const CustomerRoute = require("./routes/customer.route");
const ProviderRoute = require("./routes/provider.route");
const NotificationRoute = require("./routes/notification.route");

/* ---------------- SCHEDULER IMPORTS ---------------- */
const { startBookingCleanupJob, startBookingCancellationCleanupJob } = require("./controllers/scheduler/bookingCleanUp");

/* ---------------- PUBLIC ROUTE ---------------- */
app.use("/auth", AuthRoutes);
app.use("/api/v1", CommonRoute);

/* ---------------- PROTECTED ROUTE ---------------- */
app.use(checkAuthToken());
app.use("/api/v1/payment", PaymentRoute);
app.use("/api/v1/notification", NotificationRoute);
app.use("/api/v1/customer", RoleBasedAccess("customer"), CustomerRoute)
app.use("/api/v1/provider", RoleBasedAccess("provider"), ProviderRoute);

/* ---------------- GLOBAL ERROR HANDLERS ---------------- */
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit process - log and continue
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  // Don't exit process for database connection errors
  if (error.message && error.message.includes('Connection terminated')) {
    console.error('Database connection lost - will reconnect on next request');
  } else {
    console.error('Stack:', error.stack);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  /* ---------------- START SCHEDULER JOBS ---------------- */
  startBookingCleanupJob();
  console.log("Booking cleanup job started - runs every 30 seconds");
});
