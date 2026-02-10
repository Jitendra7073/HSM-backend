const express = require("express");
const route = express.Router();

const AuthController = require("../controllers/auth.controller");

/* ---------------- REGISTER ROUTE ---------------- */
route.post("/register", AuthController.register);

/* ---------------- LOGIN ROUTE ---------------- */
route.post("/login", AuthController.login);

/* ---------------- FORGOT PASSWORD ROUTE ---------------- */
route.post("/forgot-password", AuthController.forgotPassword);

/* ---------------- RESET PASSWORD ROUTE ---------------- */
route.post("/reset-password", AuthController.resetPassword);

/* ---------------- REFRESH TOKEN ROUTE ---------------- */
route.post("/refresh-token", AuthController.refreshToken);

/* ---------------- LOGOUT ROUTE ---------------- */
route.post("/logout", AuthController.logout);

module.exports = route;
