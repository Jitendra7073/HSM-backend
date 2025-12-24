const express = require("express");
const route = express.Router();
const NotificationController = require("../controllers/notification.controller");

/* ---------------- STORE FCM TOKEN ROUTE ---------------- */
route.post("/store-fcm-token",NotificationController.storeFcmToken)

/* ---------------- ALL NOTIFICATIONS---------------- */
route.get("/all", NotificationController.getAllReceivedNotifications);

/* ---------------- UPDATE NOTIFICATION STATUS ---------------- */
route.patch("/read/:notificationId", NotificationController.markNotificationAsRead);
module.exports = route;