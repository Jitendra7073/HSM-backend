const express = require("express");
const route = express.Router();
const StaffController = require("../controllers/staff.controller");
const {
  requestPaymentFromProvider,
  getStaffPaymentHistory,
  getStripeOnboardingLink,
  checkStaffProfileCompletion,
} = require("../controllers/staff-payment.controller");

/* ---------------- STAFF PROFILE ROUTES ---------------- */
route.get("/dashboard/stats", StaffController.getDashboardStats);
route.get("/profile", StaffController.getStaffProfile);
route.put("/profile", StaffController.updateStaffProfile);
route.put("/availability", StaffController.updateStaffAvailability);
route.get("/providers", StaffController.getAllProviders);

/* ---------------- STAFF LEAVE MANAGEMENT ROUTES ---------------- */
route.post("/leave/request", StaffController.createStaffLeaveRequest);
route.get("/leave", StaffController.getStaffLeaveRequests);

/* ---------------- STAFF WEEKLY SCHEDULE ROUTES ---------------- */
route.post("/schedule/set", StaffController.setWeeklySchedule);
route.get("/schedule", StaffController.getWeeklySchedule);

/* ---------------- STAFF AVAILABILITY CHECK ROUTES ---------------- */
route.get("/availability/check", StaffController.checkStaffAvailability);

// Stafff Application for Businesses
route.get("/applications", StaffController.getStaffApplications);
route.post("/applications/apply", StaffController.applyForStaffApplication);
route.delete(
  "/applications/:applicationId",
  StaffController.cancelStaffApplication,
);
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

module.exports = route;
