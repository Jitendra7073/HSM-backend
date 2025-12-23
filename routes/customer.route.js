const express = require("express");
const route = express.Router();

const CustomerController = require("../controllers/customer.controller");

/* ---------------- PROVIDER ROUTE ---------------- */
route.get("/providers", CustomerController.getAllProviders);
route.get("/providers/:providerId", CustomerController.getProviderById);

/* ---------------- SLOT ROUTE ---------------- */
route.get("/bookings", CustomerController.getCustomerBookings);
route.patch("/bookings/cancel", CustomerController.cancelBooking);

/* ---------------- CART ROUTE ---------------- */
route
  .route("/cart")
  .get(CustomerController.getCart)
  .post(CustomerController.addToCart)
  .delete(CustomerController.removeItemFromCart);

route.get("/all-services", CustomerController.getAllServices);

/* ---------------- GET ALL FEEDBACK ROUTE ---------------- */
route.get("/all-feedback", CustomerController.getAllFeedback)

/* ---------------- GIVE FEEDBACK ROUTE ---------------- */
route.post("/give-feedback", CustomerController.giveFeedback)

/* ---------------- CUSTOMER ALL NOTIFICATIONS---------------- */
route.get("/notifications", CustomerController.getAllCustomerReceivedNotifications);



module.exports = route;
