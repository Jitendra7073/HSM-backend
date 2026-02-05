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

    // 2. Check staff profile completeness
    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        name: true,
        addresses: {
          select: {
            id: true,
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

    // Check if staff has at least one address
    if (!staff.addresses || staff.addresses.length === 0) {
      return res.status(400).json({
        success: false,
        msg: "Please add your address before requesting payment.",
        requirement: "address",
      });
    }

    // Check if staff has saved card details
    const cardDetails = await prisma.staffCardDetails.findFirst({
      where: {
        userId: staffId,
        isActive: true,
      },
    });

    if (!cardDetails) {
      return res.status(400).json({
        success: false,
        msg: "Please add your card details before requesting payment.",
        requirement: "card",
      });
    }

    // 2. Verify staff is assigned to this booking
    const assignment = await prisma.staffAssignBooking.findFirst({
      where: {
        bookingId: bookingId,
        assignedStaffId: staffId,
      },
      include: {
        booking: {
          include: {
            service: true,
            businessProfile: true,
          },
        },
      },
    });

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

    // 4. Check if payment request already exists
    const existingRequest = await prisma.staffPaymentRequest.findFirst({
      where: {
        bookingId: bookingId,
        staffId: staffId,
      },
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        msg: "Payment request already exists for this booking.",
        existingRequest,
      });
    }

    // 5. Get provider info
    const businessProfile = await prisma.businessProfile.findUnique({
      where: { id: booking.businessProfileId },
      select: { userId: true },
    });

    if (!businessProfile) {
      return res.status(404).json({
        success: false,
        msg: "Business not found.",
      });
    }

    // 6. Create payment request
    const paymentRequest = await prisma.staffPaymentRequest.create({
      data: {
        bookingId: bookingId,
        staffId: staffId,
        providerId: businessProfile.userId,
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
        receiverId: businessProfile.userId,
        senderId: staffId,
      },
    });

    // 8. Send email to provider
    const { sendMail } = require("../utils/sendmail");
    const { paymentRequestProviderEmail } = require("../utils/emailTemplates");

    const staffUser = await prisma.user.findUnique({
      where: { id: staffId },
      select: { name: true },
    });

    const providerUser = await prisma.user.findUnique({
      where: { id: businessProfile.userId },
      select: { email: true },
    });

    const providerEmailHTML = paymentRequestProviderEmail(
      staffUser?.name || "Staff Member",
      booking.service.name,
      booking.totalAmount,
      staffFeedback || "No feedback provided",
      new Date(booking.date).toLocaleDateString(),
      booking.id,
      assignment.booking.slot?.time || "N/A",
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
      businessProfile.url = "https://example.com";
    }

    // Create Stripe Express account and onboarding link
    const account = await stripe.accounts.create({
      type: "express",
      country: "IN", // India
      capabilities: {
        transfers: { requested: true },
      },
      business_type: "individual",
      business_profile: businessProfile,
    });

    // Generate onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      type: "account_onboarding",
      refresh_url: `${process.env.CLIENT_URL}/staff/settings?tab=payments`,
      return_url: `${process.env.CLIENT_URL}/staff/settings?tab=payments`,
    });

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
    const cardDetails = await prisma.staffCardDetails.findMany({
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

module.exports = {
  requestPaymentFromProvider,
  getStaffPaymentHistory,
  getStripeOnboardingLink,
  checkStaffProfileCompletion,
};
