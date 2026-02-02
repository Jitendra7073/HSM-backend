const express = require("express");
const route = express.Router();
const StaffController = require("../controllers/staff.controller");
const { checkAuthToken } = require("../middleware/checkToken");
const { RoleBasedAccess } = require("../middleware/checkRole");
const CustomerController = require("../controllers/customer.controller");
/* ---------------- STAFF PROFILE ROUTES ---------------- */
route.get("/providers", CustomerController.getAllProviders);

route
  .route("/profile/:staffId")
  .get(StaffController.getStaffProfileById)
  .patch(StaffController.updateStaffProfile)
  .delete(StaffController.deleteStaffProfile);

/* ---------------- SERVICE ASSIGNMENT ROUTES ---------------- */
route.post("/assign-service", StaffController.assignServiceToStaff);
route.get("/:staffId/services", StaffController.getStaffServiceAssignments);

route
  .route("/assignment/:assignmentId")
  .patch(StaffController.updateServiceAssignment)
  .delete(StaffController.removeServiceAssignment);

/* ---------------- AVAILABILITY ROUTES ---------------- */
route.post("/availability", StaffController.setStaffAvailability);
route.get("/:staffId/availability", StaffController.getStaffAvailability);

/* ---------------- STAFF BOOKING ROUTES ---------------- */
route.get("/bookings", StaffController.getStaffAssignedBookings);
route.patch(
  "/booking/:bookingId/status",
  StaffController.updateBookingStatusByStaff,
);

/* ---------------- STAFF DASHBOARD ---------------- */
route.get("/dashboard/stats", StaffController.getStaffDashboardStats);

/* ---------------- EARNINGS ROUTES ---------------- */
route.get("/earnings", StaffController.getStaffEarnings);

/* ---------------- GLOBAL STAFF ROUTES ---------------- */
route.post("/register-global", StaffController.registerAsGlobalStaff);

/* ---------------- ADMIN ROUTES ---------------- */
route.patch("/admin/approve/:staffId", StaffController.approveGlobalStaff);

/* ---------------- BUSINESS APPLICATION ROUTES ---------------- */
route.get("/businesses/browse", StaffController.browseBusinesses);
route.post(
  "/apply-business",
  checkAuthToken,
  RoleBasedAccess("staff"),
  StaffController.applyToBusiness,
);
route.get(
  "/my-applications",
  checkAuthToken,
  RoleBasedAccess("staff"),
  StaffController.getMyApplications,
);

// Provider routes for managing applications
route.get(
  "/provider/applications",
  checkAuthToken,
  RoleBasedAccess("provider"),
  StaffController.getBusinessApplications,
);
route.patch(
  "/provider/applications/:applicationId/respond",
  checkAuthToken,
  RoleBasedAccess("provider"),
  StaffController.respondToApplication,
);

/* ---------------- BOOKING ASSIGNMENT ROUTES ---------------- */
route.get(
  "/provider/bookings/:bookingId/available-staff",
  checkAuthToken,
  RoleBasedAccess("provider"),
  StaffController.getAvailableStaffForBooking,
);
route.patch(
  "/provider/bookings/:bookingId/assign-staff",
  checkAuthToken,
  RoleBasedAccess("provider"),
  StaffController.assignStaffToBooking,
);
route.patch(
  "/provider/bookings/:bookingId/remove-staff",
  checkAuthToken,
  RoleBasedAccess("provider"),
  StaffController.removeStaffFromBooking,
);

module.exports = route;
