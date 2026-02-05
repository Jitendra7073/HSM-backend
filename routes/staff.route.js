const express = require("express");
const route = express.Router();
const CustomerController = require("../controllers/customer.controller");
const StaffController = require("../controllers/staff.controller");
const {
  requestPaymentFromProvider,
  getStaffPaymentHistory,
  getStripeOnboardingLink,
  checkStaffProfileCompletion,
} = require("../controllers/staff-payment.controller");
const {
  addStaffCardDetails,
  getStaffCardDetails,
  updateStaffCardDetails,
  deleteStaffCardDetails,
  setDefaultCard,
} = require("../controllers/staff-card.controller");

/* ---------------- STAFF PROFILE ROUTES ---------------- */
route.get("/dashboard/stats", StaffController.getDashboardStats);
route.get("/profile", StaffController.getStaffProfile);
route.put("/profile", StaffController.updateStaffProfile);
route.get("/providers", StaffController.getAllProviders);

// Staff details for provider (view staff performance)
route.get("/staff/:staffId/details", StaffController.getStaffDetailsForProvider);

// route.get("/business-staffs", StaffController.getAllBusinessStaffs);
// route.get("/all-staffs", StaffController.getAllStaffs);

// Stafff Application for Businesses
route.get("/applications", StaffController.getStaffApplications);
route.post("/applications/apply", StaffController.applyForStaffApplication);
route.delete("/applications/:applicationId", StaffController.cancelStaffApplication);
route.put("/applications/exist", StaffController.requestForExist);

// Staff Assigned Bookings
route.get("/bookings", StaffController.getStaffBookings);
route.put(
  "/bookings/:bookingId/status",
  StaffController.updateBookingTrackingStatus,
);

/* ---------------- STAFF PAYMENT ROUTES ---------------- */
// Request payment from provider after completing service
route.post("/payments/request", requestPaymentFromProvider);

// Get staff's payment history
route.get("/payments/history", getStaffPaymentHistory);

// Get Stripe onboarding link
route.get("/stripe/onboarding", getStripeOnboardingLink);

// Check staff profile completion status
route.get("/profile/completion", checkStaffProfileCompletion);

/* ---------------- STAFF CARD DETAILS ROUTES ---------------- */
// Add card details
route.post("/cards", addStaffCardDetails);

// Get all card details
route.get("/cards", getStaffCardDetails);

// Update card details
route.put("/cards/:cardId", updateStaffCardDetails);

// Delete card
route.delete("/cards/:cardId", deleteStaffCardDetails);

// Set default card
route.patch("/cards/:cardId/default", setDefaultCard);

module.exports = route;
