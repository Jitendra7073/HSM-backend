const express = require("express");
const router = express.Router();
const {
  getPaymentRequests,
  getPaymentRequestDetails,
  approvePaymentRequest,
  rejectPaymentRequest,
  getPaymentHistory,
  getPaymentStats,
  getProviderStripeOnboardingLink,
  checkProviderStripeAccountStatus,
  getProviderBankAccountDetails,
  getProviderBankAccounts,
  syncProviderBankAccounts,
  refreshProviderStripeStatus,
} = require("../controllers/provider-payment.controller");
const { authenticateProvider } = require("../middleware/auth");

// Provider Payment Routes
// All routes require provider authentication

/**
 * @route   GET /api/v1/provider/staff/payments/requests
 * @desc    Get all payment requests for provider
 * @query   status: PENDING|APPROVED|REJECTED (optional)
 * @access  Provider (Private)
 */
router.get("/requests", authenticateProvider, getPaymentRequests);

/**
 * @route   GET /api/v1/provider/staff/payments/requests/:requestId
 * @desc    Get single payment request details
 * @access  Provider (Private)
 */
router.get("/requests/:requestId", authenticateProvider, getPaymentRequestDetails);

/**
 * @route   POST /api/v1/provider/staff/payments/:requestId/approve
 * @desc    Approve payment request and pay staff via Stripe
 * @body    percentage: number (0-100)
 * @access  Provider (Private)
 */
router.post("/requests/:requestId/approve", authenticateProvider, approvePaymentRequest);

/**
 * @route   DELETE /api/v1/provider/staff/payments/:requestId
 * @desc    Reject payment request
 * @body    reason: string (required)
 * @access  Provider (Private)
 */
router.delete("/requests/:requestId", authenticateProvider, rejectPaymentRequest);

/**
 * @route   GET /api/v1/provider/staff/payments/history
 * @desc    Get provider's payment history
 * @query   staffId: string (optional - filter by staff)
 * @query   fromDate: date (optional - filter by date range)
 * @query   toDate: date (optional - filter by date range)
 * @query   page: number (default: 1)
 * @query   limit: number (default: 20)
 * @access  Provider (Private)
 */
router.get("/history", authenticateProvider, getPaymentHistory);

/**
 * @route   GET /api/v1/provider/staff/payments/stats
 * @desc    Get payment statistics
 * @access  Provider (Private)
 */
router.get("/stats", authenticateProvider, getPaymentStats);

/**
 * @route   GET /api/v1/provider/stripe/onboarding
 * @desc    Get Stripe onboarding link for provider to connect their bank account
 * @access  Provider (Private)
 */
router.get("/stripe/onboarding", authenticateProvider, getProviderStripeOnboardingLink);

/**
 * @route   GET /api/v1/provider/payments/stripe/status
 * @desc    Check provider's Stripe account connection status
 * @access  Provider (Private)
 */
router.get("/payments/stripe/status", authenticateProvider, checkProviderStripeAccountStatus);

/**
 * @route   GET /api/v1/provider/stripe/bank-account
 * @desc    Get provider's bank account details from Stripe
 * @access  Provider (Private)
 */
router.get("/stripe/bank-account", authenticateProvider, getProviderBankAccountDetails);

/**
 * @route   GET /api/v1/provider/bank-accounts
 * @desc    Get provider's bank accounts from database
 * @access  Provider (Private)
 */
router.get("/bank-accounts", authenticateProvider, getProviderBankAccounts);

/**
 * @route   POST /api/v1/provider/bank-accounts/sync
 * @desc    Sync bank accounts from Stripe to database
 * @access  Provider (Private)
 */
router.post("/bank-accounts/sync", authenticateProvider, syncProviderBankAccounts);

/**
 * @route   POST /api/v1/provider/stripe/refresh
 * @desc    Refresh Stripe account status and sync bank accounts
 * @access  Provider (Private)
 */
router.post("/stripe/refresh", authenticateProvider, refreshProviderStripeStatus);

module.exports = router;
