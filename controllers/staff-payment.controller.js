const prisma = require("../prismaClient");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

/**
 * Staff requests payment from provider after completing service
 */
const requestPaymentFromProvider = async (req, res) => {
  const staffId = req.user.id;
  const { bookingId, staffFeedback } = req.body;

  try {
    // 1. Validate input
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        msg: "Booking ID is required.",
      });
    }

    // 2. Batch multiple queries for better performance
    const [staff, cardDetails, assignment, existingRequest] = await Promise.all(
      [
        // Check staff profile
        prisma.user.findUnique({
          where: { id: staffId },
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true,
            addresses: {
              select: { id: true },
            },
            stripeAccountId: true,
            stripeAccountStatus: true,
          },
        }),
        // Check if staff has saved card details
        prisma.userCardDetails.findFirst({
          where: {
            userId: staffId,
            isActive: true,
          },
        }),
        // Verify staff is assigned to this booking
        prisma.staffAssignBooking.findFirst({
          where: {
            bookingId: bookingId,
            assignedStaffId: staffId,
          },
          include: {
            booking: {
              include: {
                service: true,
                businessProfile: true,
                slot: {
                  select: { time: true },
                },
              },
            },
          },
        }),
        // Check if payment request already exists
        prisma.staffPaymentRequest.findFirst({
          where: {
            bookingId: bookingId,
            staffId: staffId,
          },
        }),
      ],
    );

    if (!staff) {
      return res.status(404).json({
        success: false,
        msg: "Staff not found.",
      });
    }

    // 2.1 Check if staff has connected Stripe account
    if (!staff.stripeAccountId || staff.stripeAccountStatus !== "VERIFIED") {
      return res.status(400).json({
        success: false,
        msg: "Please connect your Stripe account to receive payments.",
        requirement: "stripeAccount",
        stripeAccountStatus: staff.stripeAccountStatus || "NOT_CONNECTED",
      });
    }

    // Check if staff has at least one address
    if (!staff.addresses || staff.addresses.length === 0) {
      return res.status(400).json({
        success: false,
        msg: "Please add your address before requesting payment.",
        requirement: "address",
      });
    }

    if (!cardDetails) {
      return res.status(400).json({
        success: false,
        msg: "Please add your card details before requesting payment.",
        requirement: "card",
      });
    }

    if (!assignment) {
      return res.status(403).json({
        success: false,
        msg: "You are not assigned to this booking.",
      });
    }

    const booking = assignment.booking;

    // 3. Verify booking is completed
    if (
      booking.trackingStatus !== "COMPLETED" &&
      booking.bookingStatus !== "COMPLETED"
    ) {
      return res.status(400).json({
        success: false,
        msg: "You can only request payment for completed bookings.",
      });
    }

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        msg: "Payment request already exists for this booking.",
        existingRequest,
      });
    }

    // 4. Get provider info for the business
    const providerBusiness = await prisma.businessProfile.findUnique({
      where: { id: booking.businessProfileId },
      select: { userId: true },
    });

    if (!providerBusiness) {
      return res.status(404).json({
        success: false,
        msg: "Business not found.",
      });
    }

    // 5. Get provider email for notification
    const providerUser = await prisma.user.findUnique({
      where: { id: providerBusiness.userId },
      select: { email: true },
    });

    // 6. Create payment request
    const paymentRequest = await prisma.staffPaymentRequest.create({
      data: {
        bookingId: bookingId,
        staffId: staffId,
        providerId: providerBusiness.userId,
        requestedAmount: booking.totalAmount,
        staffFeedback: staffFeedback || "",
        requestStatus: "PENDING",
      },
    });

    // 7. Send notification to provider
    await prisma.notification.create({
      data: {
        title: "💰 New Payment Request",
        message: `Staff member has requested payment for completed service: ${booking.service.name}`,
        receiverId: providerBusiness.userId,
        senderId: staffId,
      },
    });

    // 8. Send email to provider
    const { sendMail } = require("../utils/sendmail");
    const { paymentRequestProviderEmail } = require("../utils/emailTemplates");

    const providerEmailHTML = paymentRequestProviderEmail(
      staff.name,
      booking.service.name,
      booking.totalAmount,
      staffFeedback || "No feedback provided",
      new Date(booking.date).toLocaleDateString(),
      booking.id,
      booking.slot?.time || "N/A",
      paymentRequest.id,
    );

    await sendMail({
      email: providerUser?.email || "",
      subject: "💰 New Payment Request - Staff Payment",
      message: providerEmailHTML,
      isHTML: true,
    });

    return res.status(201).json({
      success: true,
      msg: "Payment request submitted successfully.",
      request: paymentRequest,
    });
  } catch (error) {
    console.error("requestPaymentFromProvider error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not request payment.",
      error: error.message,
    });
  }
};

/**
 * Get staff's payment history
 */
const getStaffPaymentHistory = async (req, res) => {
  const staffId = req.user.id;
  const { status, page = 1, limit = 20 } = req.query;

  try {
    const pageNumber = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 20;
    const skip = (pageNumber - 1) * pageSize;

    const whereClause = { staffId };

    if (
      status &&
      ["PENDING", "PAID", "FAILED", "CANCELLED"].includes(status.toUpperCase())
    ) {
      whereClause.status = status.toUpperCase();
    }

    const [payments, totalCount] = await Promise.all([
      prisma.staffPayment.findMany({
        where: whereClause,
        include: {
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
        orderBy: { createdAt: "desc" },
        take: pageSize,
        skip: skip,
      }),
      prisma.staffPayment.count({ where: whereClause }),
    ]);

    // Get provider details for each payment
    const paymentsWithDetails = await Promise.all(
      payments.map(async (payment) => {
        const provider = await prisma.user.findUnique({
          where: { id: payment.providerId },
          select: {
            id: true,
            name: true,
            businessProfile: { select: { businessName: true } },
          },
        });

        return {
          ...payment,
          providerName: provider?.businessProfile?.businessName || "Unknown",
        };
      }),
    );

    return res.status(200).json({
      success: true,
      msg: "Payment history fetched successfully.",
      payments: paymentsWithDetails,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error) {
    console.error("getStaffPaymentHistory error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch payment history.",
      error: error.message,
    });
  }
};

/**
 * Get Stripe onboarding link for staff
 */
const getStripeOnboardingLink = async (req, res) => {
  const staffId = req.user.id;

  try {
    const staff = await prisma.user.findUnique({
      where: { id: staffId },
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

    // If already has verified Stripe account, return that info
    if (staff.stripeAccountId && staff.stripeAccountStatus === "VERIFIED") {
      return res.status(200).json({
        success: true,
        msg: "Stripe account already connected.",
        stripeAccountStatus: staff.stripeAccountStatus,
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
      businessProfile.url = `${clientUrl}/staff/profile`;
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
      email: staff.email,
    });
    console.log("Stripe Account Details:", account);

    // Generate onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      type: "account_onboarding",
      refresh_url: `${process.env.CLIENT_URL}/staff/profile?tab=payments`,
      return_url: `${process.env.CLIENT_URL}/staff/profile?tab=payments`,
    });

    console.log("Stripe Account Link:", accountLink);
    console.log("Stripe Account Id:", account.id);
    console.log("Stripe Account URL:", accountLink.url);

    // Update user with Stripe account info
    await prisma.user.update({
      where: { id: staffId },
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
    console.error("getStripeOnboardingLink error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not generate onboarding link.",
      error: error.message,
    });
  }
};

/**
 * Check staff's Stripe account connection status
 */
const checkStripeAccountStatus = async (req, res) => {
  const staffId = req.user.id;

  try {
    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
        stripeOnboardingUrl: true,
      },
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        msg: "Staff not found.",
      });
    }

    return res.status(200).json({
      success: true,
      msg: "Stripe account status retrieved successfully.",
      stripeAccountId: staff.stripeAccountId,
      stripeAccountStatus: staff.stripeAccountStatus || "NOT_CONNECTED",
      stripeOnboardingUrl: staff.stripeOnboardingUrl,
      hasConnected:
        !!staff.stripeAccountId && staff.stripeAccountStatus === "VERIFIED",
    });
  } catch (error) {
    console.error("checkStripeAccountStatus error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not check Stripe account status.",
      error: error.message,
    });
  }
};

/**
 * Get payment request status for a specific booking
 */
const getBookingPaymentStatus = async (req, res) => {
  const staffId = req.user.id;
  const { bookingId } = req.params;

  try {
    // Get payment request for this booking
    const paymentRequest = await prisma.staffPaymentRequest.findFirst({
      where: {
        bookingId: bookingId,
        staffId: staffId,
      },
      select: {
        id: true,
        requestStatus: true,
        requestedAmount: true,
        requestedAt: true,
        rejectionReason: true,
        reviewedAt: true,
      },
    });

    // Get payment record if exists
    const payment = await prisma.staffPayment.findFirst({
      where: {
        bookingId: bookingId,
        staffId: staffId,
      },
      select: {
        id: true,
        staffAmount: true,
        percentage: true,
        paidAt: true,
        status: true,
        stripeTransferId: true,
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Payment status retrieved successfully.",
      paymentRequest: paymentRequest || null,
      payment: payment || null,
      hasRequested: !!paymentRequest,
      status: paymentRequest?.requestStatus || null,
      isPaid: payment?.status === "PAID",
    });
  } catch (error) {
    console.error("getBookingPaymentStatus error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch payment status.",
      error: error.message,
    });
  }
};

/**
 * Get staff's bank account details from Stripe
 */
const getStaffBankAccountDetails = async (req, res) => {
  const staffId = req.user.id;

  try {
    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: {
        id: true,
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

    if (!staff.stripeAccountId) {
      return res.status(200).json({
        success: true,
        msg: "No Stripe account connected.",
        hasConnected: false,
        bankAccount: null,
      });
    }

    // Fetch external account details from Stripe
    const account = await stripe.accounts.retrieve(staff.stripeAccountId);
    console.log("Stripe retrive account details:", account);
    const externalAccounts = await stripe.accounts.listExternalAccounts(
      staff.stripeAccountId,
      { object: "bank_account" },
    );
    console.log("Stripe retrive external account details:", externalAccounts);

    const bankAccount =
      externalAccounts.data.length > 0 ? externalAccounts.data[0] : null;

    console.log("bank data lengths:", bankAccount);
    return res.status(200).json({
      success: true,
      msg: "Bank account details fetched successfully.",
      hasConnected: true,
      stripeAccountStatus: staff.stripeAccountStatus,
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
    console.error("getStaffBankAccountDetails error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch bank account details.",
      error: error.message,
    });
  }
};

/**
 * Check staff profile completion status
 */
const checkStaffProfileCompletion = async (req, res) => {
  const staffId = req.user.id;

  try {
    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        addresses: {
          select: {
            id: true,
            type: true,
            street: true,
            city: true,
            state: true,
            postalCode: true,
            country: true,
          },
        },
      },
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        msg: "Staff not found.",
      });
    }

    // Check for card details instead of Stripe
    const cardDetails = await prisma.userCardDetails.findMany({
      where: {
        userId: staffId,
        isActive: true,
      },
      select: {
        id: true,
        lastFourDigits: true,
        expiryMonth: true,
        expiryYear: true,
        cardType: true,
        isDefault: true,
      },
    });

    const hasAddress = staff.addresses && staff.addresses.length > 0;
    const hasCard = cardDetails && cardDetails.length > 0;
    const isProfileComplete = hasAddress && hasCard;

    return res.status(200).json({
      success: true,
      msg: "Profile completion status retrieved.",
      profileCompletion: {
        isComplete: isProfileComplete,
        hasAddress: hasAddress,
        hasCard: hasCard,
        cardCount: cardDetails.length,
        addressCount: staff.addresses?.length || 0,
        addresses: staff.addresses,
        cards: cardDetails.map((card) => ({
          ...card,
          maskedNumber: `•••• •••• •••• ${card.lastFourDigits}`,
        })),
      },
    });
  } catch (error) {
    console.error("checkStaffProfileCompletion error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not check profile completion.",
      error: error.message,
    });
  }
};

/**
 * Refresh staff's Stripe account status from Stripe API
 */
const refreshStaffStripeStatus = async (req, res) => {
  const staffId = req.user.id;

  try {
    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: {
        id: true,
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

    if (!staff.stripeAccountId) {
      return res.status(400).json({
        success: false,
        msg: "No Stripe account connected.",
      });
    }

    // Fetch latest account details from Stripe
    const account = await stripe.accounts.retrieve(staff.stripeAccountId);

    console.log(`Refreshing Stripe status for staff ${staffId}:`, {
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
      where: { id: staffId },
      data: {
        stripeAccountStatus: newStatus,
      },
      select: {
        id: true,
        stripeAccountStatus: true,
        stripeAccountId: true,
      },
    });

    console.log(`✓ Refreshed Stripe status for staff ${staffId}: ${staff.stripeAccountStatus} → ${newStatus}`);

    // Fetch external accounts
    const externalAccounts = await stripe.accounts.listExternalAccounts(
      staff.stripeAccountId,
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
            userId: staffId,
            stripeAccountId: staff.stripeAccountId,
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
      previousStatus: staff.stripeAccountStatus,
      newStatus: updatedUser.stripeAccountStatus,
      bankAccountsFound: externalAccounts.data.length,
      bankAccountsSynced: syncedCount,
    });
  } catch (error) {
    console.error("refreshStaffStripeStatus error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not refresh Stripe status.",
      error: error.message,
    });
  }
};

/**
 * Sync staff's bank accounts from Stripe to our database
 */
const syncStaffBankAccounts = async (req, res) => {
  const staffId = req.user.id;

  try {
    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: {
        id: true,
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

    if (!staff.stripeAccountId) {
      return res.status(400).json({
        success: false,
        msg: "No Stripe account connected.",
      });
    }

    // Fetch external accounts from Stripe
    const account = await stripe.accounts.retrieve(staff.stripeAccountId);
    const externalAccounts = await stripe.accounts.listExternalAccounts(
      staff.stripeAccountId,
      { object: "bank_account", limit: 10 }
    );

    console.log(`Syncing bank accounts for staff ${staffId}: Found ${externalAccounts.data.length} accounts`);

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
            userId: staffId,
            stripeAccountId: staff.stripeAccountId,
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
    console.error("syncStaffBankAccounts error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not sync bank accounts.",
      error: error.message,
    });
  }
};

/**
 * Get staff's bank account details from our database
 * Also auto-syncs from Stripe if no accounts found
 */
const getStaffBankAccounts = async (req, res) => {
  const staffId = req.user.id;

  try {
    // First, check if user has a Stripe account
    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: {
        id: true,
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

    // Fetch bank accounts from our database
    let bankAccounts = await prisma.bankAccount.findMany({
      where: {
        userId: staffId,
        isActive: true,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    // If no accounts found but Stripe is connected, auto-sync from Stripe
    if (bankAccounts.length === 0 && staff.stripeAccountId) {
      console.log(`No bank accounts found in DB for staff ${staffId}, auto-syncing from Stripe...`);

      try {
        // Fetch external accounts from Stripe
        const externalAccounts = await stripe.accounts.listExternalAccounts(
          staff.stripeAccountId,
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
                  userId: staffId,
                  stripeAccountId: staff.stripeAccountId,
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

              console.log(`✓ Auto-synced bank account for staff ${staffId}: ${bankAccount.bank_name} ending in ${bankAccount.last4}`);
            }
          }

          // Fetch the newly created accounts
          bankAccounts = await prisma.bankAccount.findMany({
            where: {
              userId: staffId,
              isActive: true,
            },
            orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
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
    console.error("getStaffBankAccounts error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch bank accounts.",
      error: error.message,
    });
  }
};

module.exports = {
  requestPaymentFromProvider,
  getStaffPaymentHistory,
  getStripeOnboardingLink,
  checkStaffProfileCompletion,
  getBookingPaymentStatus,
  checkStripeAccountStatus,
  getStaffBankAccountDetails,
  getStaffBankAccounts,
  syncStaffBankAccounts,
  refreshStaffStripeStatus,
};
