const express = require("express");
const route = express.Router();
const AdminController = require("../controllers/admin.controller");

/* ------------------ USER MANAGEMENT ROUTES ------------------ */
route.get("/users", AdminController.getAllUsers);
route.get("/users/:userId", AdminController.getUserById);
route.patch("/users/:userId/restrict", AdminController.restrictUser);
route.patch("/users/:userId/lift-restriction", AdminController.liftUserRestriction);

/* ------------------ BUSINESS MANAGEMENT ROUTES ------------------ */
route.get("/businesses", AdminController.getAllBusinesses);
route.get("/businesses/:businessId", AdminController.getBusinessById);
route.patch("/businesses/:businessId/approve", AdminController.approveBusiness);
route.patch("/businesses/:businessId/restrict", AdminController.restrictBusiness);
route.patch(
  "/businesses/:businessId/lift-restriction",
  AdminController.liftBusinessRestriction
);

/* ------------------ SERVICE MANAGEMENT ROUTES ------------------ */
route.get("/services", AdminController.getAllServices);
route.get("/services/:serviceId", AdminController.getServiceById);
route.patch("/services/:serviceId/restrict", AdminController.restrictService);
route.patch(
  "/services/:serviceId/lift-restriction",
  AdminController.liftServiceRestriction
);

/* ------------------ DASHBOARD STATS ROUTE ------------------ */
route.get("/dashboard/stats", AdminController.getDashboardStats);

module.exports = route;
