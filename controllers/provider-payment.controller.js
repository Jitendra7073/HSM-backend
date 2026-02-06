const prisma = require("../prismaClient");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

/**
 * Get all payment requests for provider
 */
const getPaymentRequests = async (req, res) => {
  const providerId = req.user.id;
  const { status } = req.query;

  try {
    const businessProfile = await prisma.businessProfile.findFirst({
      where: { userId: providerId },
      select: { id: true },
    });

    if (!businessProfile) {
      return res.status(200).json({
        success: true,
        msg: "No business profile found.",
        requests: [],
      });
    }

    const whereClause = { providerId };

    if (
      status &&
      ["PENDING", "APPROVED", "REJECTED"].includes(status.toUpperCase())
    ) {
      whereClause.requestStatus = status.toUpperCase();
    }

    // Optimized: Fetch all data in a single query with includes
    const requests = await prisma.staffPaymentRequest.findMany({
      where: whereClause,
      include: {
        // Include staff details directly
        staff: {
          select: {
            id: true,
            name: true,
            mobile: true,
            email: true,
          },
        },
        booking: {
          select: {
            id: true,
            date: true,
            totalAmount: true,
            service: {
              select: {
                name: true,
              },
            },
            slot: {
              select: {
                time: true,
              },
            },
            user: {
              select: {
                name: true,
                mobile: true,
              },
            },
          },
        },
      },
      orderBy: { requestedAt: "desc" },
    });

    // Map data without additional queries (no N+1 problem)
    const requestsWithDetails = requests.map((request) => ({
      id: request.id,
      staffId: request.staffId,
      staffName: request.staff?.name || "Unknown",
      staffMobile: request.staff?.mobile || "N/A",
      staffEmail: request.staff?.email || "N/A",
      bookingId: request.bookingId,
      serviceName: request.booking.service.name,
      servicePrice: request.requestedAmount,
      bookingDate: request.booking.date,
      slotTime: request.booking.slot?.time || "N/A",
      customerName: request.booking.user.name,
      staffFeedback: request.staffFeedback,
      requestedAt: request.requestedAt,
      requestStatus: request.requestStatus,
      rejectionReason: request.rejectionReason,
    }));

    return res.status(200).json({
      success: true,
      msg: "Payment requests fetched successfully.",
      requests: requestsWithDetails,
    });
  } catch (error) {
    console.error("getPaymentRequests error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch payment requests.",
      error: error.message,
    });
  }
};

/**
 * Get single payment request details
 */
const getPaymentRequestDetails = async (req, res) => {
  const providerId = req.user.id;
  const { requestId } = req.params;

  try {
    const request = await prisma.staffPaymentRequest.findFirst({
      where: {
        id: requestId,
        providerId: providerId,
      },
      include: {
        booking: {
          select: {
            id: true,
            date: true,
            totalAmount: true,
            platformFee: true,
            providerEarnings: true,
            service: {
              select: {
                name: true,
                description: true,
              },
            },
            slot: {
              select: {
                time: true,
              },
            },
            user: {
              select: {
                name: true,
                mobile: true,
                email: true,
              },
            },
            address: {
              select: {
                street: true,
                city: true,
                state: true,
                postalCode: true,
              },
            },
          },
        },
      },
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        msg: "Payment request not found.",
      });
    }

    // Get staff details
    const staff = await prisma.user.findUnique({
      where: { id: request.staffId },
      select: {
        id: true,
        name: true,
        mobile: true,
        email: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Payment request details fetched successfully.",
      request: {
        id: request.id,
        staffId: request.staffId,
        staffName: staff?.name || "Unknown",
        staffMobile: staff?.mobile || "N/A",
        staffEmail: staff?.email || "N/A",
        stripeAccountId: staff?.stripeAccountId,
        stripeAccountStatus: staff?.stripeAccountStatus,
        bookingId: request.bookingId,
        serviceName: request.booking.service.name,
        serviceDescription: request.booking.service.description,
        servicePrice: request.requestedAmount,
        platformFee: request.booking.platformFee,
        providerEarnings: request.booking.providerEarnings,
        bookingDate: request.booking.date,
        slotTime: request.booking.slot?.time || "N/A",
        customerName: request.booking.user.name,
        customerMobile: request.booking.user.mobile,
        customerEmail: request.booking.user.email,
        serviceAddress: `${request.booking.address.street}, ${request.booking.address.city}, ${request.booking.address.state} ${request.booking.address.postalCode}`,
        staffFeedback: request.staffFeedback,
        requestedAt: request.requestedAt,
        requestStatus: request.requestStatus,
        rejectionReason: request.rejectionReason,
      },
    });
  } catch (error) {
    console.error("getPaymentRequestDetails error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch payment request details.",
      error: error.message,
    });
  }
};

/**
 * Approve payment request and pay staff via Stripe
 */
const approvePaymentRequest = async (req, res) => {
  const providerId = req.user.id;
  const { requestId } = req.params;
  const { percentage } = req.body;

  try {
    // 1. Validate input
    if (typeof percentage !== "number" || percentage < 0 || percentage > 100) {
      return res.status(400).json({
        success: false,
        msg: "Percentage must be between 0 and 100.",
      });
    }

    // 2. Get payment request
    const paymentRequest = await prisma.staffPaymentRequest.findFirst({
      where: {
        id: requestId,
        providerId: providerId,
        requestStatus: "PENDING",
      },
      include: {
        booking: {
          select: {
            id: true,
            totalAmount: true,
            providerEarnings: true,
            service: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!paymentRequest) {
      return res.status(404).json({
        success: false,
        msg: "Payment request not found or already processed.",
      });
    }

    // 3. Get staff details
    const staff = await prisma.user.findUnique({
      where: { id: paymentRequest.staffId },
      select: {
        id: true,
        name: true,
        email: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
      },
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        msg: "Staff not found.",
      });
    }

    // 4. Check if staff has Stripe account
    if (!staff.stripeAccountId || staff.stripeAccountStatus !== "VERIFIED") {
      return res.status(400).json({
        success: false,
        msg: "Staff has not connected their Stripe account yet.",
        stripeAccountStatus: staff.stripeAccountStatus || "NOT_CONNECTED",
      });
    }

    // 5. Calculate amount
    const providerEarnings =
      paymentRequest.booking.providerEarnings ||
      paymentRequest.booking.totalAmount;
    const staffAmount = Math.round(providerEarnings * (percentage / 100));

    if (staffAmount <= 50) {
      return res.status(400).json({
        success: false,
        msg: "Amount to pay must be greater than 50.",
      });
    }

    // 6. Process Stripe transfer
    let stripeTransferId = null;
    try {
      const transfer = await stripe.transfers.create({
        amount: staffAmount * 100, // Convert to paise
        currency: "inr",
        destination: staff.stripeAccountId,
        metadata: {
          bookingId: paymentRequest.bookingId,
          staffId: paymentRequest.staffId,
          providerId: providerId,
          paymentRequestId: requestId,
        },
      });
      stripeTransferId = transfer.id;
    } catch (stripeError) {
      console.error("Stripe transfer error:", stripeError);
      return res.status(500).json({
        success: false,
        msg: "Failed to process Stripe transfer. Please try again.",
        error: stripeError.message,
      });
    }

    // 7. Create payment record
    const payment = await prisma.staffPayment.create({
      data: {
        bookingId: paymentRequest.bookingId,
        staffId: paymentRequest.staffId,
        providerId: providerId,
        requestedAmount: paymentRequest.requestedAmount,
        percentage: percentage,
        staffAmount: staffAmount,
        paymentMethod: "stripe",
        stripeTransferId: stripeTransferId,
        paidAt: new Date(),
        status: "PAID",
      },
    });

    // 8. Update payment request status
    await prisma.staffPaymentRequest.update({
      where: { id: requestId },
      data: {
        requestStatus: "APPROVED",
        reviewedAt: new Date(),
      },
    });

    // 9. Update booking payment status
    await prisma.booking.update({
      where: { id: paymentRequest.bookingId },
      data: {
        staffEarnings: staffAmount,
        staffPercentage: percentage,
        staffPaymentStatus: "PAID",
        staffPaidAt: new Date(),
      },
    });

    // 10. Send notification to staff
    await prisma.notification.create({
      data: {
        title: "💵 Payment Received",
        message: `You have received ₹${staffAmount} for ${paymentRequest.booking.service.name}`,
        receiverId: paymentRequest.staffId,
        senderId: providerId,
      },
    });

    // 11. Get provider name for email
    const provider = await prisma.user.findUnique({
      where: { id: providerId },
      select: {
        businessProfile: {
          select: {
            businessName: true,
          },
        },
      },
    });

    // 12. Send email to staff with invoice
    const { sendMail } = require("../utils/sendmail");
    const { staffPaymentReceivedEmail } = require("../utils/emailTemplates");

    const staffEmailHTML = staffPaymentReceivedEmail(
      staff.name,
      paymentRequest.booking.service.name,
      staffAmount,
      percentage,
      providerEarnings,
      stripeTransferId,
      new Date().toLocaleDateString(),
      paymentRequest.bookingId,
      provider?.businessProfile?.businessName || "Provider",
    );

    await sendMail({
      email: staff.email,
      subject: `💵 Payment Received - ₹${staffAmount} - Invoice`,
      message: staffEmailHTML,
      isHTML: true,
    });

    return res.status(200).json({
      success: true,
      msg: "Payment processed successfully.",
      payment: {
        id: payment.id,
        staffAmount: staffAmount,
        percentage: percentage,
        stripeTransferId: stripeTransferId,
        paidAt: payment.paidAt,
      },
    });
  } catch (error) {
    console.error("approvePaymentRequest error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not approve payment request.",
      error: error.message,
    });
  }
};

/**
 * Reject payment request
 */
const rejectPaymentRequest = async (req, res) => {
  const providerId = req.user.id;
  const { requestId } = req.params;
  const { reason } = req.body;

  try {
    // Validate input
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        msg: "Rejection reason is required.",
      });
    }

    // Get payment request
    const paymentRequest = await prisma.staffPaymentRequest.findFirst({
      where: {
        id: requestId,
        providerId: providerId,
        requestStatus: "PENDING",
      },
      include: {
        booking: {
          select: {
            service: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!paymentRequest) {
      return res.status(404).json({
        success: false,
        msg: "Payment request not found or already processed.",
      });
    }

    // Update request status
    await prisma.staffPaymentRequest.update({
      where: { id: requestId },
      data: {
        requestStatus: "REJECTED",
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });

    // Send notification to staff
    await prisma.notification.create({
      data: {
        title: "❌ Payment Request Rejected",
        message: `Your payment request for ${paymentRequest.booking.service.name} has been rejected. Reason: ${reason}`,
        receiverId: paymentRequest.staffId,
        senderId: providerId,
      },
    });

    // Send email to staff
    const { sendMail } = require("../utils/sendmail");
    const { paymentRequestRejectedEmail } = require("../utils/emailTemplates");

    const staff = await prisma.user.findUnique({
      where: { id: paymentRequest.staffId },
      select: { name: true, email: true },
    });

    const staffEmailHTML = paymentRequestRejectedEmail(
      staff?.name || "Staff Member",
      paymentRequest.booking.service.name,
      reason,
    );

    await sendMail({
      email: staff?.email || "",
      subject: "❌ Payment Request Rejected",
      message: staffEmailHTML,
      isHTML: true,
    });

    return res.status(200).json({
      success: true,
      msg: "Payment request rejected successfully.",
    });
  } catch (error) {
    console.error("rejectPaymentRequest error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not reject payment request.",
      error: error.message,
    });
  }
};

/**
 * Get provider's payment history
 */
const getPaymentHistory = async (req, res) => {
  const providerId = req.user.id;
  const { staffId, fromDate, toDate, page = 1, limit = 20 } = req.query;

  try {
    const pageNumber = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 20;
    const skip = (pageNumber - 1) * pageSize;

    const whereClause = { providerId };

    if (staffId) {
      whereClause.staffId = staffId;
    }

    if (fromDate || toDate) {
      whereClause.paidAt = {};
      if (fromDate) {
        whereClause.paidAt.gte = new Date(fromDate);
      }
      if (toDate) {
        whereClause.paidAt.lte = new Date(toDate);
      }
    }

    // Optimized: Fetch all data in a single query with includes
    const [payments, totalCount] = await Promise.all([
      prisma.staffPayment.findMany({
        where: whereClause,
        include: {
          // Include staff details directly
          staff: {
            select: {
              id: true,
              name: true,
              mobile: true,
              email: true,
            },
          },
          booking: {
            select: {
              id: true,
              date: true,
              service: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { paidAt: "desc" },
        take: pageSize,
        skip: skip,
      }),
      prisma.staffPayment.count({ where: whereClause }),
    ]);

    // Map data without additional queries (no N+1 problem)
    const paymentsWithDetails = payments.map((payment) => ({
      id: payment.id,
      bookingId: payment.bookingId,
      staffId: payment.staffId,
      staffName: payment.staff?.name || "Unknown",
      staffMobile: payment.staff?.mobile || "N/A",
      staffEmail: payment.staff?.email || "N/A",
      serviceName: payment.booking.service.name,
      serviceDate: payment.booking.date,
      requestedAmount: payment.requestedAmount,
      percentage: payment.percentage,
      staffAmount: payment.staffAmount,
      paymentMethod: payment.paymentMethod,
      stripeTransferId: payment.stripeTransferId,
      status: payment.status,
      paidAt: payment.paidAt,
    }));

    // Calculate statistics
    const stats = await prisma.staffPayment.groupBy({
      by: ["status"],
      where: whereClause,
      _sum: {
        staffAmount: true,
      },
      _count: {
        id: true,
      },
    });

    const totalPaid =
      stats.find((s) => s.status === "PAID")?._sum.staffAmount || 0;
    const totalPending =
      stats.find((s) => s.status === "PENDING")?._sum.staffAmount || 0;
    const totalTransactions = stats.reduce((acc, s) => acc + s._count.id, 0);

    return res.status(200).json({
      success: true,
      msg: "Payment history fetched successfully.",
      payments: paymentsWithDetails,
      stats: {
        totalPaid,
        totalPending,
        totalTransactions,
      },
      pagination: {
        page: pageNumber,
        limit: pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error) {
    console.error("getPaymentHistory error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch payment history.",
      error: error.message,
    });
  }
};

/**
 * Get payment statistics
 */
const getPaymentStats = async (req, res) => {
  const providerId = req.user.id;

  try {
    // Get all payment requests count by status
    const requestStats = await prisma.staffPaymentRequest.groupBy({
      by: ["requestStatus"],
      where: { providerId },
      _count: {
        id: true,
      },
    });

    // Get payment statistics
    const paymentStats = await prisma.staffPayment.aggregate({
      where: { providerId },
      _sum: {
        requestedAmount: true,
        staffAmount: true,
      },
      _count: {
        id: true,
      },
    });

    // Get pending requests amount
    const pendingRequests = await prisma.staffPaymentRequest.findMany({
      where: {
        providerId,
        requestStatus: "PENDING",
      },
      select: {
        requestedAmount: true,
      },
    });

    const pendingAmount = pendingRequests.reduce(
      (acc, req) => acc + req.requestedAmount,
      0,
    );

    return res.status(200).json({
      success: true,
      msg: "Payment statistics fetched successfully.",
      stats: {
        pendingRequests:
          requestStats.find((s) => s.requestStatus === "PENDING")?._count.id ||
          0,
        approvedRequests:
          requestStats.find((s) => s.requestStatus === "APPROVED")?._count.id ||
          0,
        rejectedRequests:
          requestStats.find((s) => s.requestStatus === "REJECTED")?._count.id ||
          0,
        totalPayments: paymentStats._count.id,
        totalPaidAmount: paymentStats._sum.staffAmount || 0,
        totalRequestedAmount: paymentStats._sum.requestedAmount || 0,
        pendingAmount,
      },
    });
  } catch (error) {
    console.error("getPaymentStats error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch payment statistics.",
      error: error.message,
    });
  }
};

/**
 * Get provider's bank account details from Stripe
 */
const getProviderBankAccountDetails = async (req, res) => {
  const providerId = req.user.id;

  try {
    const provider = await prisma.user.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
      },
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        msg: "Provider not found.",
      });
    }

    if (!provider.stripeAccountId) {
      return res.status(200).json({
        success: true,
        msg: "No Stripe account connected.",
        hasConnected: false,
        bankAccount: null,
      });
    }

    // Fetch external account details from Stripe
    const account = await stripe.accounts.retrieve(provider.stripeAccountId);
    const externalAccounts = await stripe.accounts.listExternalAccounts(
      provider.stripeAccountId,
      { object: "bank_account" },
    );

    const bankAccount =
      externalAccounts.data.length > 0 ? externalAccounts.data[0] : null;

    return res.status(200).json({
      success: true,
      msg: "Bank account details fetched successfully.",
      hasConnected: true,
      stripeAccountStatus: provider.stripeAccountStatus,
      bankAccount: bankAccount
        ? {
            bankName: bankAccount.bank_name,
            last4: bankAccount.last4,
            routingNumber: bankAccount.routing_number,
            status: bankAccount.status,
            country: bankAccount.country,
            currency: bankAccount.currency,
          }
        : null,
      payoutsEnabled: account.payouts_enabled,
      chargesEnabled: account.chargesEnabled,
    });
  } catch (error) {
    console.error("getProviderBankAccountDetails error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch bank account details.",
      error: error.message,
    });
  }
};

/**
 * Get Stripe onboarding link for provider
 */
const getProviderStripeOnboardingLink = async (req, res) => {
  const providerId = req.user.id;

  try {
    const provider = await prisma.user.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        name: true,
        email: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
      },
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        msg: "Provider not found.",
      });
    }

    // If already has verified Stripe account, return that info
    if (
      provider.stripeAccountId &&
      provider.stripeAccountStatus === "VERIFIED"
    ) {
      return res.status(200).json({
        success: true,
        msg: "Stripe account already connected.",
        stripeAccountStatus: provider.stripeAccountStatus,
      });
    }

    // Prepare business profile - only include URL if it's valid (not localhost)
    const businessProfile = {
      mcc: "5734", // MCC code for computer-related services
    };

    // Only add URL if it's a valid production URL (not localhost or 127.0.0.1)
    const clientUrl = process.env.CLIENT_URL || "";
    if (
      clientUrl &&
      !clientUrl.includes("localhost") &&
      !clientUrl.includes("127.0.0.1") &&
      !clientUrl.includes("http://localhost")
    ) {
      businessProfile.url = `${clientUrl}/provider/dashboard/profile`;
    } else {
      // Use a placeholder URL for development
      businessProfile.url = "https://fixora-services-vercel.app";
    }

    // Create Stripe Express account and onboarding link
    const account = await stripe.accounts.create({
      type: "express",
      country: "AU", // India
      capabilities: {
        transfers: { requested: true },
      },
      business_type: "individual",
      business_profile: businessProfile,
      email: provider.email,
    });

    // Generate onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      type: "account_onboarding",
      refresh_url: `${process.env.CLIENT_URL}/provider/dashboard/profile?tab=bank-account`,
      return_url: `${process.env.CLIENT_URL}/provider/dashboard/profile?tab=bank-account`,
    });

    // Update user with Stripe account info
    await prisma.user.update({
      where: { id: providerId },
      data: {
        stripeAccountId: account.id,
        stripeAccountStatus: "PENDING",
        stripeOnboardingUrl: accountLink.url,
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Stripe onboarding link generated.",
      onboardingUrl: accountLink.url,
      accountId: account.id,
    });
  } catch (error) {
    console.error("getProviderStripeOnboardingLink error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not generate onboarding link.",
      error: error.message,
    });
  }
};

/**
 * Check provider's Stripe account connection status
 */
const checkProviderStripeAccountStatus = async (req, res) => {
  const providerId = req.user.id;

  try {
    const provider = await prisma.user.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
        stripeOnboardingUrl: true,
      },
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        msg: "Provider not found.",
      });
    }

    return res.status(200).json({
      success: true,
      msg: "Stripe account status retrieved successfully.",
      stripeAccountId: provider.stripeAccountId,
      stripeAccountStatus: provider.stripeAccountStatus || "NOT_CONNECTED",
      stripeOnboardingUrl: provider.stripeOnboardingUrl,
      hasConnected:
        !!provider.stripeAccountId &&
        provider.stripeAccountStatus === "VERIFIED",
    });
  } catch (error) {
    console.error("checkProviderStripeAccountStatus error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not check Stripe account status.",
      error: error.message,
    });
  }
};

/**
 * Get provider's bank account details from our database
 * Also auto-syncs from Stripe if no accounts found
 */
const getProviderBankAccounts = async (req, res) => {
  const providerId = req.user.id;

  try {
    // First, check if user has a Stripe account
    const provider = await prisma.user.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
      },
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        msg: "Provider not found.",
      });
    }

    // Fetch bank accounts from our database
    let bankAccounts = await prisma.bankAccount.findMany({
      where: {
        userId: providerId,
        isActive: true,
      },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" },
      ],
    });

    // If no accounts found but Stripe is connected, auto-sync from Stripe
    if (bankAccounts.length === 0 && provider.stripeAccountId) {
      console.log(`No bank accounts found in DB for provider ${providerId}, auto-syncing from Stripe...`);

      try {
        // Fetch external accounts from Stripe
        const externalAccounts = await stripe.accounts.listExternalAccounts(
          provider.stripeAccountId,
          { object: "bank_account", limit: 10 }
        );

        console.log(`Found ${externalAccounts.data.length} external bank accounts in Stripe`);

        if (externalAccounts.data.length > 0) {
          // Store each bank account in our database
          for (const bankAccount of externalAccounts.data) {
            // Check if bank account already exists
            const existing = await prisma.bankAccount.findFirst({
              where: {
                stripeExternalId: bankAccount.id,
              },
            });

            if (!existing) {
              // Create new bank account record
              await prisma.bankAccount.create({
                data: {
                  userId: providerId,
                  stripeAccountId: provider.stripeAccountId,
                  stripeExternalId: bankAccount.id,
                  bankName: bankAccount.bank_name,
                  last4: bankAccount.last4,
                  routingNumber: bankAccount.routing_number,
                  country: bankAccount.country,
                  currency: bankAccount.currency,
                  status: bankAccount.status,
                  accountHolderType: bankAccount.account_holder_type,
                  fingerprint: bankAccount.fingerprint,
                  isDefault: externalAccounts.data.length === 1,
                },
              });

              console.log(`✓ Auto-synced bank account for provider ${providerId}: ${bankAccount.bank_name} ending in ${bankAccount.last4}`);
            }
          }

          // Fetch the newly created accounts
          bankAccounts = await prisma.bankAccount.findMany({
            where: {
              userId: providerId,
              isActive: true,
            },
            orderBy: [
              { isDefault: "desc" },
              { createdAt: "desc" },
            ],
          });
        }
      } catch (syncError) {
        console.error("Auto-sync error:", syncError);
        // Don't fail the request if sync fails
      }
    }

    return res.status(200).json({
      success: true,
      msg: "Bank accounts retrieved successfully.",
      bankAccounts,
      count: bankAccounts.length,
      autoSynced: bankAccounts.length > 0,
    });
  } catch (error) {
    console.error("getProviderBankAccounts error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch bank accounts.",
      error: error.message,
    });
  }
};

/**
 * Refresh provider's Stripe account status from Stripe API
 */
const refreshProviderStripeStatus = async (req, res) => {
  const providerId = req.user.id;

  try {
    const provider = await prisma.user.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
      },
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        msg: "Provider not found.",
      });
    }

    if (!provider.stripeAccountId) {
      return res.status(400).json({
        success: false,
        msg: "No Stripe account connected.",
      });
    }

    // Fetch latest account details from Stripe
    const account = await stripe.accounts.retrieve(provider.stripeAccountId);

    console.log(`Refreshing Stripe status for provider ${providerId}:`, {
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    });

    // Determine new status
    let newStatus = "PENDING";
    if (account.charges_enabled && account.payouts_enabled) {
      newStatus = "VERIFIED";
    } else if (account.details_submitted) {
      newStatus = "RESTRICTED";
    }

    // Update user's Stripe account status
    const updatedUser = await prisma.user.update({
      where: { id: providerId },
      data: {
        stripeAccountStatus: newStatus,
      },
      select: {
        id: true,
        stripeAccountStatus: true,
        stripeAccountId: true,
      },
    });

    console.log(`✓ Refreshed Stripe status for provider ${providerId}: ${provider.stripeAccountStatus} → ${newStatus}`);

    // Fetch external accounts
    const externalAccounts = await stripe.accounts.listExternalAccounts(
      provider.stripeAccountId,
      { object: "bank_account", limit: 10 }
    );

    // Sync bank accounts
    let syncedCount = 0;
    for (const bankAccount of externalAccounts.data) {
      const existing = await prisma.bankAccount.findFirst({
        where: {
          stripeExternalId: bankAccount.id,
        },
      });

      if (!existing) {
        await prisma.bankAccount.create({
          data: {
            userId: providerId,
            stripeAccountId: provider.stripeAccountId,
            stripeExternalId: bankAccount.id,
            bankName: bankAccount.bank_name,
            last4: bankAccount.last4,
            routingNumber: bankAccount.routing_number,
            country: bankAccount.country,
            currency: bankAccount.currency,
            status: bankAccount.status,
            accountHolderType: bankAccount.account_holder_type,
            fingerprint: bankAccount.fingerprint,
            isDefault: externalAccounts.data.length === 1,
          },
        });
        syncedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      msg: "Stripe account status refreshed successfully.",
      previousStatus: provider.stripeAccountStatus,
      newStatus: updatedUser.stripeAccountStatus,
      bankAccountsFound: externalAccounts.data.length,
      bankAccountsSynced: syncedCount,
    });
  } catch (error) {
    console.error("refreshProviderStripeStatus error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not refresh Stripe status.",
      error: error.message,
    });
  }
};

/**
 * Sync provider's bank accounts from Stripe to our database
 */
const syncProviderBankAccounts = async (req, res) => {
  const providerId = req.user.id;

  try {
    const provider = await prisma.user.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
      },
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        msg: "Provider not found.",
      });
    }

    if (!provider.stripeAccountId) {
      return res.status(400).json({
        success: false,
        msg: "No Stripe account connected.",
      });
    }

    // Fetch external accounts from Stripe
    const account = await stripe.accounts.retrieve(provider.stripeAccountId);
    const externalAccounts = await stripe.accounts.listExternalAccounts(
      provider.stripeAccountId,
      { object: "bank_account", limit: 10 }
    );

    console.log(`Syncing bank accounts for provider ${providerId}: Found ${externalAccounts.data.length} accounts`);

    let syncedCount = 0;
    for (const bankAccount of externalAccounts.data) {
      // Check if bank account already exists
      const existing = await prisma.bankAccount.findFirst({
        where: {
          stripeExternalId: bankAccount.id,
        },
      });

      if (!existing) {
        // Create new bank account record
        await prisma.bankAccount.create({
          data: {
            userId: providerId,
            stripeAccountId: provider.stripeAccountId,
            stripeExternalId: bankAccount.id,
            bankName: bankAccount.bank_name,
            last4: bankAccount.last4,
            routingNumber: bankAccount.routing_number,
            country: bankAccount.country,
            currency: bankAccount.currency,
            status: bankAccount.status,
            accountHolderType: bankAccount.account_holder_type,
            fingerprint: bankAccount.fingerprint,
            isDefault: externalAccounts.data.length === 1,
          },
        });
        syncedCount++;
        console.log(`✓ Synced bank account: ${bankAccount.bank_name} ending in ${bankAccount.last4}`);
      } else {
        // Update status if changed
        if (existing.status !== bankAccount.status) {
          await prisma.bankAccount.update({
            where: { id: existing.id },
            data: { status: bankAccount.status },
          });
          console.log(`✓ Updated bank account status: ${bankAccount.bank_name} → ${bankAccount.status}`);
        }
      }
    }

    return res.status(200).json({
      success: true,
      msg: `Bank accounts synced successfully.`,
      syncedCount,
      totalAccounts: externalAccounts.data.length,
    });
  } catch (error) {
    console.error("syncProviderBankAccounts error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not sync bank accounts.",
      error: error.message,
    });
  }
};

module.exports = {
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
};
