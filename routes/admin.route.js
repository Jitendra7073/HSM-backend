const express = require("express");
const route = express.Router();
const AdminController = require("../controllers/admin.controller");
const { checkAuthToken } = require("../middleware/checkToken");
const { RoleBasedAccess } = require("../middleware/checkRole");

// Apply middleware to all admin routes
route.use(checkAuthToken());
route.use(RoleBasedAccess("admin"));

/* ------------------ USER MANAGEMENT ROUTES ------------------ */
route.get("/users", AdminController.getAllUsers);
route.get("/users/:userId", AdminController.getUserById);
route.patch("/users/:userId/restrict", AdminController.restrictUser);

/* ------------------ STAFF MANAGEMENT ROUTES ------------------ */
route.get("/staff", AdminController.getAllStaff);
route.get("/staff/:staffId", AdminController.getStaffById);
// Staff leaves management
route.get("/staff/:staffId/leaves", AdminController.getStaffLeaves);
route.patch("/staff/leaves/:leaveId", AdminController.updateStaffLeaveStatus);
// Staff payments management
route.get("/staff/:staffId/payments", AdminController.getStaffPayments);
// Staff bookings management
route.get("/staff/:staffId/bookings", AdminController.getStaffBookings);
// Staff businesses management
route.get("/staff/:staffId/businesses", AdminController.getStaffBusinesses);
// Resusing User restriction logic as Staff are Users
route.patch("/staff/:userId/restrict", AdminController.restrictUser);
route.patch(
  "/staff/:userId/lift-restriction",
  AdminController.liftUserRestriction,
);

route.patch(
  "/users/:userId/lift-restriction",
  AdminController.liftUserRestriction,
);

/* ------------------ BUSINESS MANAGEMENT ROUTES ------------------ */
route.get("/businesses", AdminController.getAllBusinesses);
route.get("/businesses/:businessId", AdminController.getBusinessById);
route.patch("/businesses/:businessId/approve", AdminController.approveBusiness);
route.patch("/businesses/:businessId/reject", AdminController.rejectBusiness);
route.patch(
  "/businesses/:businessId/restrict",
  AdminController.restrictBusiness,
);
route.patch(
  "/businesses/:businessId/lift-restriction",
  AdminController.liftBusinessRestriction,
);

/* ------------------ SERVICE MANAGEMENT ROUTES ------------------ */
route.get("/services", AdminController.getAllServices);
route.get("/services/:serviceId", AdminController.getServiceById);
route.patch("/services/:serviceId/restrict", AdminController.restrictService);
route.patch(
  "/services/:serviceId/lift-restriction",
  AdminController.liftServiceRestriction,
);

/* ------------------ DASHBOARD STATS ROUTE ------------------ */
route.get("/dashboard/stats", AdminController.getDashboardStats);
route.get("/dashboard/analytics", AdminController.getDashboardAnalytics);

/* ------------------ ACTIVITY LOGS ROUTE ------------------ */
route.get("/users/:userId/activity-logs", AdminController.getUserActivityLogs);

/* ------------------ PLAN MANAGEMENT ROUTES ------------------ */
route.post("/plans", AdminController.createSubscriptionPlan);
route.get("/plans", AdminController.getAllSubscriptionPlans);
route.put("/plans/:planId", AdminController.updateSubscriptionPlan);
route.delete("/plans/:planId", AdminController.deleteSubscriptionPlan);

/* ------------------ SUBSCRIPTION MANAGEMENT ROUTES ------------------ */
route.get("/subscriptions", AdminController.getAllSubscriptions);
route.patch(
  "/subscriptions/:subscriptionId/cancel",
  AdminController.cancelUserSubscription,
);

/* ------------------ REVENUE & FINANCIALS ROUTES ------------------ */
route.get("/revenue", AdminController.getRevenueStats);

/* ------------------ CONTENT MANAGEMENT ROUTES ------------------ */
const ContentController = require("../controllers/content.controller");
route.put("/content/:key", ContentController.updateContent);

module.exports = route;
