const express = require("express");
const route = express.Router();
const StaffController = require("../controllers/staff.controller");
const {
  requestPaymentFromProvider,
  getStaffPaymentHistory,
  getBookingPaymentStatus,
  getStaffEarnings,
  checkStaffProfileCompletion,
  addBankAccount,
  getBankAccount,
  deleteBankAccount,
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

// Staff assigned Bookings
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

// Get staff's earnings
route.get("/earnings", getStaffEarnings);

// Get payment status for a specific booking
route.get("/payments/booking/:bookingId/status", getBookingPaymentStatus);

// Bank Account Management
route.post("/bank-account", addBankAccount);
route.get("/bank-account", getBankAccount);
route.delete("/bank-account/:accountId", deleteBankAccount);

// Check staff profile completion status
route.get("/profile/completion", checkStaffProfileCompletion);

module.exports = route;
