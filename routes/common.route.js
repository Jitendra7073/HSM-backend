const express = require("express");
const route = express.Router();

/* ---------------- CONTROLLER ---------------- */
const ProfileRoute = require("../controllers/profile.controller");
const AddressRoute = require("../controllers/address.controller");
const CardRoute = require("../controllers/user-card.controller");
const { checkAuthToken } = require("../middleware/checkToken");
const ProviderController = require("../controllers/provider.controller");

/* ---------------- PROFILE ROUTE ---------------- */
route.get("/profile", checkAuthToken(), ProfileRoute.getUserProfile);
route.get("/me/:token", ProfileRoute.getMe);
route.delete("/profile/:userId", ProfileRoute.deleteProfile);

/* ---------------- ADDRESS ROUTE ---------------- */
route
  .route("/address")
  .get(checkAuthToken(), AddressRoute.getAddress)
  .post(checkAuthToken(), AddressRoute.addAddress);

route.delete(
  "/address/:addressId",
  checkAuthToken(),
  AddressRoute.deleteAddress,
);

/* ---------------- BUSINESS CATEGORY ROUTE ---------------- */
route
  .route("/business-category")
  .get(checkAuthToken(), ProviderController.getAllBusinessCategory);

/* ---------------- CONTENT ROUTE ---------------- */
const ContentController = require("../controllers/content.controller");
route.get("/content/:key", ContentController.getContent);

/* ---------------- USER CARD ROUTE ---------------- */
route.post("/cards", checkAuthToken(), CardRoute.addUserCardDetails);
route.get("/cards", checkAuthToken(), CardRoute.getUserCardDetails);
route.put("/cards/:cardId", checkAuthToken(), CardRoute.updateUserCardDetails);
route.delete(
  "/cards/:cardId",
  checkAuthToken(),
  CardRoute.deleteUserCardDetails,
);
route.patch(
  "/cards/:cardId/default",
  checkAuthToken(),
  CardRoute.setDefaultCard,
);

module.exports = route;
