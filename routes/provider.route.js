const express = require("express");
const route = express.Router();
const ProviderController = require("../controllers/provider.controller");
const {
  getPaymentRequests,
  getPaymentRequestDetails,
  approvePaymentRequest,
  rejectPaymentRequest,
  getPaymentHistory,
  getPaymentStats,
} = require("../controllers/provider-payment.controller");

/* ---------------- BUSINESS ROUTE ---------------- */
route
  .route("/business")
  .get(ProviderController.getBusinessProfile)
  .post(ProviderController.createBusiness)
  .patch(ProviderController.updateBusiness)
  .delete(ProviderController.deleteBusiness);

/* ---------------- STAFF ROUTES ---------------- */
route.get("/staff", ProviderController.getStaffMembers);
route.get("/staff-status", ProviderController.getStaffStatusTracking);
route.get("/staff/:staffId", ProviderController.getStaffMemberById);
route.get("/staff/:staffId/bookings", ProviderController.getStaffBookings);
route.patch("/staff/:staffId/status", ProviderController.updateStaffStatus);
route.post("/staff/:staffId/unlink", ProviderController.unlinkStaffMember);
route.delete("/staff/:staffId", ProviderController.deleteStaffMember);

/* ---------------- SERVICE ROUTE ---------------- */
route
  .route("/service")
  .get(ProviderController.getServices)
  .post(ProviderController.createService);
route
  .route("/service/:serviceId")
  .get(ProviderController.getServiceById)
  .patch(ProviderController.updateService)
  .delete(ProviderController.deleteService);

/* ---------------- SLOT ROUTE ---------------- */
route
  .route("/slots")
  .get(ProviderController.getAllSlots)
  .post(ProviderController.generateSlots);
route.post("/slot/create", ProviderController.createSingleSlot);
route.delete("/slot/:slotId", ProviderController.deleteSlot);

/* ---------------- BOOKING ROUTE ---------------- */
route.get("/booking", ProviderController.bookingList);
route.patch("/booking/:bookingId", ProviderController.updateBooking);

route.get(
  "/booking/cancellations",
  ProviderController.GetAllCancellationBookings,
);

/* ---------------- BUSINESS CATEGORY ROUTE ---------------- */
route
  .route("/business-category")
  .get(ProviderController.getAllBusinessCategory)
  .post(ProviderController.createBusinessCategory);

route
  .route("/business-category/:categoryId")
  .patch(ProviderController.updateBusinessCategory)
  .delete(ProviderController.deleteBusinessCategory);

/* ---------------- DASHBOARD STATES ROUTE ---------------- */
route.get("/dashboard/stats", ProviderController.getDashboardStats);

/* ---------------- SERVICE FEEDBACK  ---------------- */
route.get("/service-feedback", ProviderController.getAllFeedbacks);

/* ----------------- SUBSCTION DATA ----------------- */
route.get("/subscription-plans", ProviderController.getAllSubscriptionPlans);

/* ---------------- REQUEST UNRESTRICT ---------------- */
route.post("/request-unrestrict", ProviderController.requestUnrestrict);
route.post(
  "/request-service-unrestrict",
  ProviderController.requestServiceUnrestrict,
);

route.post("/assign-booking", ProviderController.assignBookingToProvider);

/* ---------------- STAFF PAYMENT ROUTES ---------------- */
// Get all payment requests
route.get("/staff/payments/requests", getPaymentRequests);

// Get single payment request details
route.get("/staff/payments/requests/:requestId", getPaymentRequestDetails);

// Approve payment request
route.post("/staff/payments/:requestId/approve", approvePaymentRequest);

// Reject payment request
route.delete("/staff/payments/:requestId", rejectPaymentRequest);

// Get payment history
route.get("/staff/payments/history", getPaymentHistory);

// Get payment statistics
route.get("/staff/payments/stats", getPaymentStats);

module.exports = route;
