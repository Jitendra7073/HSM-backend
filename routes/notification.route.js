const express = require("express");
const route = express.Router();
const NotificationController = require("../controllers/notification.controller");

/* ---------------- STORE FCM TOKEN ROUTE ---------------- */
route.post("/store-fcm-token",NotificationController.storeFcmToken)

module.exports = route;