const express = require("express");
const route = express.Router();
const ProviderController = require("../controllers/provider.controller");

/* ---------------- BUSINESS ROUTE ---------------- */
route
  .route("/business")
  .get(ProviderController.getBusinessProfile)
  .post(ProviderController.createBusiness)
  .patch(ProviderController.updateBusiness)
  .delete(ProviderController.deleteBusiness);

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
  .post(ProviderController.createSlot);
route.delete("/slot/:slotId", ProviderController.deleteSlot);

/* ---------------- BOOKING ROUTE ---------------- */
route.get("/booking", ProviderController.bookingList);
route.patch("/booking/:bookingId", ProviderController.updateBooking);

/* ---------------- BUSINESS CATEGORY ROUTE ---------------- */
route
  .route("/business-category")
  .get(ProviderController.getAllBusinessCategory)
  .post(ProviderController.createBusinessCategory);

/* ---------------- DASHBOARD STATES ROUTE ---------------- */
route.get("/dashboard/stats", ProviderController.getDashboardStats);

/* ---------------- SERVICE FEEDBACK  ---------------- */
route.get("/service-feedback", ProviderController.getAllFeedbacks);
// route.patch("/service-feedback/:feedbackId", ProviderController.updateServiceFeedbackStatus);

/* ----------------- SUBSCTION DATA ----------------- */
route.get("/subscription-plans", ProviderController.getAllSubscriptionPlans);

module.exports = route;
