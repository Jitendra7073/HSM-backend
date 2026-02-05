const express = require("express");
const router = express.Router();
const {
  requestPaymentFromProvider,
  getStaffPaymentHistory,
  getStripeOnboardingLink,
} = require("../controllers/staff-payment.controller");
const { authenticateStaff } = require("../middleware/auth");

// Staff Payment Routes
// All routes require staff authentication

/**
 * @route   POST /api/v1/staff/payments/request
 * @desc    Staff requests payment from provider after completing service
 * @access  Staff (Private)
 */
router.post("/request", authenticateStaff, requestPaymentFromProvider);

/**
 * @route   GET /api/v1/staff/payments/history
 * @desc    Get staff's payment history with pagination
 * @query   status: PENDING|PAID|FAILED|CANCELLED
 * @query   page: Page number (default: 1)
 * @query   limit: Items per page (default: 20)
 * @access  Staff (Private)
 */
router.get("/history", authenticateStaff, getStaffPaymentHistory);

/**
 * @route   GET /api/v1/staff/stripe/onboarding
 * @desc    Get Stripe onboarding link for staff to connect their bank account
 * @access  Staff (Private)
 */
router.get("/stripe/onboarding", authenticateStaff, getStripeOnboardingLink);

module.exports = router;
