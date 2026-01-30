const express = require("express");
const route = express.Router();

/* ---------------- CONTROLLER ---------------- */
const commonRoutes = require("../controllers/common.controller");
const { checkAuthToken } = require("../middleware/checkToken");
const ProviderController = require("../controllers/provider.controller");

/* ---------------- PROFILE ROUTE ---------------- */
route.get("/profile", checkAuthToken(), commonRoutes.getUserProfile);
route.get("/me/:token", commonRoutes.getMe);
route.delete("/profile/:userId", commonRoutes.deleteProfile);

/* ---------------- ADDRESS ROUTE ---------------- */
route
  .route("/address")
  .get(checkAuthToken(), commonRoutes.getAddress)
  .post(checkAuthToken(), commonRoutes.addAddress);

route.delete(
  "/address/:addressId",
  checkAuthToken(),
  commonRoutes.deleteAddress,
);

/* ---------------- BUSINESS CATEGORY ROUTE ---------------- */
route
  .route("/business-category")
  .get(checkAuthToken(), ProviderController.getAllBusinessCategory);

/* ---------------- CONTENT ROUTE ---------------- */
const ContentController = require("../controllers/content.controller");
route.get("/content/:key", ContentController.getContent);

module.exports = route;
