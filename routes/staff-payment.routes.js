const express = require("express");
const router = express.Router();
const {
  requestPaymentFromProvider,
  getStaffPaymentHistory,
  getStripeOnboardingLink,
  getBookingPaymentStatus,
  checkStripeAccountStatus,
  getStaffBankAccountDetails,
  getStaffBankAccounts,
  syncStaffBankAccounts,
  refreshStaffStripeStatus,
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

/**
 * @route   GET /api/v1/staff/payments/booking/:bookingId/status
 * @desc    Get payment request status for a specific booking
 * @access  Staff (Private)
 */
router.get("/booking/:bookingId/status", authenticateStaff, getBookingPaymentStatus);

/**
 * @route   GET /api/v1/staff/payments/stripe/status
 * @desc    Check staff's Stripe account connection status
 * @access  Staff (Private)
 */
router.get("/stripe/status", authenticateStaff, checkStripeAccountStatus);

/**
 * @route   GET /api/v1/staff/stripe/bank-account
 * @desc    Get staff's bank account details from Stripe
 * @access  Staff (Private)
 */
router.get("/stripe/bank-account", authenticateStaff, getStaffBankAccountDetails);

/**
 * @route   GET /api/v1/staff/bank-accounts
 * @desc    Get staff's bank accounts from database
 * @access  Staff (Private)
 */
router.get("/bank-accounts", authenticateStaff, getStaffBankAccounts);

/**
 * @route   POST /api/v1/staff/bank-accounts/sync
 * @desc    Sync bank accounts from Stripe to database
 * @access  Staff (Private)
 */
router.post("/bank-accounts/sync", authenticateStaff, syncStaffBankAccounts);

/**
 * @route   POST /api/v1/staff/stripe/refresh
 * @desc    Refresh Stripe account status and sync bank accounts
 * @access  Staff (Private)
 */
router.post("/stripe/refresh", authenticateStaff, refreshStaffStripeStatus);

module.exports = router;
