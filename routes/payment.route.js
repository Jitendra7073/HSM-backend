const express = require("express");
const route = express.Router();

const paymentRoute = require("../controllers/payment.controller");

/* ---------------- CUSTOMER CHECKOUT (ONE-TIME PAYMENT) ---------------- */
route.post("/create-checkout-session", paymentRoute.customerPayment);

/* ---------------- PROVIDER SUBSCRIPTION CHECKOUT ---------------- */
route.post(
  "/create-subscription-checkout",
  paymentRoute.providerSubscriptionCheckout
);

/* ---------------- CREATE PROVIDER SUBSCRIPTION PLANS ---------------- */
route.post(
  "/create-subscription-plans",
  paymentRoute.seedProviderSubscriptionPlans
);

/* ---------------- GET PENDING PAYMENT BOOKINGS ---------------- */
route.get("/pending-payments", paymentRoute.getPendingPaymentBookings);

/* ---------------- CANCEL SUBSCRIPTION ---------------- */
route.post("/cancel-subscription", paymentRoute.cancelSubscription);

/* ---------------- USER BILLING PORTAL ---------------- */
route.get("/user-billing-portal", paymentRoute.userBillingPortal);

module.exports = route;
