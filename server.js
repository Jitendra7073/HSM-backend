const express = require("express");
const http = require("http");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const {ConnectDB} = require("./config/database");

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
const { startBookingCleanupJob, startTokenCleanupJob } = require("./controllers/scheduler/bookingCleanUp");

/* ---------------- PUBLIC ROUTE ---------------- */
app.use("/auth", AuthRoutes);
app.use("/api/v1", CommonRoute);

/* ---------------- PROTECTED ROUTE ---------------- */
app.use(checkAuthToken());
app.use("/api/v1/payment", PaymentRoute);
app.use("/api/v1/notification", NotificationRoute);
app.use("/api/v1/customer", RoleBasedAccess("customer"), CustomerRoute)
app.use("/api/v1/provider", RoleBasedAccess("provider"), ProviderRoute);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  
  /* ---------------- START SCHEDULER JOBS ---------------- */
  startBookingCleanupJob();
  console.log("Booking cleanup job started - runs every 30 seconds");
  
  startTokenCleanupJob();
  console.log("Token cleanup job started - runs every hour");
});
