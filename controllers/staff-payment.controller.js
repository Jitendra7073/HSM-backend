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
    const [staff, cardDetails, assignment, existingRequest, bankAccount] =
      await Promise.all([
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
        // Check if staff has bank account
        prisma.bankAccount.findFirst({
          where: {
            userId: staffId,
            isActive: true,
          },
        }),
      ]);

    if (!staff) {
      return res.status(404).json({
        success: false,
        msg: "Staff not found.",
      });
    }

    // 2.1 Check if staff has added bank account
    if (!bankAccount) {
      return res.status(400).json({
        success: false,
        msg: "Please add your bank account details to receive payments.",
        requirement: "bankAccount",
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
 * Add manual bank account
 */
const addBankAccount = async (req, res) => {
  const staffId = req.user.id;
  const { bankName, accountNumber, ifscCode, accountHolderName, upiId } =
    req.body;

  try {
    if (!bankName || !accountNumber || !ifscCode || !accountHolderName) {
      return res.status(400).json({
        success: false,
        msg: "All bank details are required.",
      });
    }

    // Check if account already exists
    const existingAccount = await prisma.bankAccount.findFirst({
      where: { userId: staffId },
    });

    if (existingAccount) {
      // Update existing
      const updatedAccount = await prisma.bankAccount.update({
        where: { id: existingAccount.id },
        data: {
          bankName,
          accountNumber,
          ifscCode,
          accountHolderName,
          upiId,
          isActive: true,
        },
      });
      return res.status(200).json({
        success: true,
        msg: "Bank account updated successfully.",
        bankAccount: updatedAccount,
      });
    }

    // Create new
    const newAccount = await prisma.bankAccount.create({
      data: {
        userId: staffId,
        bankName,
        accountNumber,
        ifscCode,
        accountHolderName,
        upiId,
        isActive: true,
        status: "ACTIVE",
        isDefault: true,
        stripeAccountId: null,
        stripeExternalId: null,
        last4: accountNumber.slice(-4),
        country: "IN",
        currency: "inr",
      },
    });

    return res.status(201).json({
      success: true,
      msg: "Bank account added successfully.",
      bankAccount: newAccount,
    });
  } catch (error) {
    console.error("addBankAccount error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not add bank account.",
      error: error.message,
    });
  }
};

/**
 * Get staff's bank account
 */
const getBankAccount = async (req, res) => {
  const staffId = req.user.id;

  try {
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { userId: staffId },
    });

    return res.status(200).json({
      success: true,
      msg: "Bank account fetched successfully.",
      bankAccount: bankAccount,
      hasAccount: !!bankAccount,
    });
  } catch (error) {
    console.error("getBankAccount error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch bank account.",
      error: error.message,
    });
  }
};

/**
 * Delete staff's bank account
 */
const deleteBankAccount = async (req, res) => {
  const staffId = req.user.id;
  const { accountId } = req.params;

  try {
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: accountId, userId: staffId },
    });

    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        msg: "Bank account not found.",
      });
    }

    // Check if this is the last bank account — at least one must remain
    const bankAccountCount = await prisma.bankAccount.count({
      where: { userId: staffId },
    });

    if (bankAccountCount <= 1) {
      return res.status(400).json({
        success: false,
        msg: "You must have at least one bank account. Add another bank account before deleting this one.",
      });
    }

    await prisma.bankAccount.delete({
      where: { id: accountId },
    });

    return res.status(200).json({
      success: true,
      msg: "Bank account deleted successfully.",
    });
  } catch (error) {
    console.error("deleteBankAccount error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not delete bank account.",
      error: error.message,
    });
  }
};

/**
 * Get staff's earnings
 */
const getStaffEarnings = async (req, res) => {
  const staffId = req.user.id;
  const { paymentStatus, page = 1, limit = 20 } = req.query;

  try {
    const pageNumber = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 20;
    const skip = (pageNumber - 1) * pageSize;

    const whereClause = { staffId };

    if (
      paymentStatus &&
      ["PENDING", "PAID", "FAILED", "PROCESSING"].includes(
        paymentStatus.toUpperCase(),
      )
    ) {
      whereClause.status = paymentStatus.toUpperCase();
    }

    const [payments, totalCount] = await Promise.all([
      prisma.staffPayment.findMany({
        where: whereClause,
        include: {
          booking: {
            select: {
              id: true,
              totalAmount: true,
              platformFee: true,
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

    const formattedEarnings = payments.map((payment) => ({
      id: payment.id,
      booking: payment.booking,
      totalAmount: payment.booking.totalAmount,
      platformFee: payment.booking.platformFee,
      staffShare: payment.staffAmount,
      paymentStatus: payment.status,
      createdAt: payment.createdAt,
      paidAt: payment.paidAt,
    }));

    return res.status(200).json({
      success: true,
      msg: "Earnings fetched successfully.",
      earnings: formattedEarnings,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error) {
    console.error("getStaffEarnings error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch earnings.",
      error: error.message,
    });
  }
};

/**
 * Get payment status for a specific booking
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
        requestedAmount: true,
        requestStatus: true,
        requestedAt: true,
        reviewedAt: true,
        rejectionReason: true,
        staffFeedback: true,
      },
    });

    // Get actual payment if exists
    const payment = await prisma.staffPayment.findFirst({
      where: {
        bookingId: bookingId,
        staffId: staffId,
      },
      select: {
        id: true,
        staffAmount: true,
        percentage: true,
        paymentMethod: true,
        stripeTransferId: true,
        paidAt: true,
        status: true,
      },
    });

    // Get booking details for additional context
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        totalAmount: true,
        staffPaymentStatus: true,
        staffEarnings: true,
        staffPaidAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Payment status fetched successfully.",
      hasRequested: !!paymentRequest,
      isPaid:
        payment?.status === "PAID" || booking?.staffPaymentStatus === "PAID",
      paymentRequest: paymentRequest,
      payment: payment,
      bookingPaymentInfo: booking
        ? {
            totalAmount: booking.totalAmount,
            staffPaymentStatus: booking.staffPaymentStatus,
            staffEarnings: booking.staffEarnings,
            staffPaidAt: booking.staffPaidAt,
          }
        : null,
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
 * Check staff profile completion status
 */
const checkStaffProfileCompletion = async (req, res) => {
  const staffId = req.user.id;

  try {
    const [addressCount, cardCount, bankCount] = await Promise.all([
      prisma.address.count({ where: { userId: staffId } }),
      prisma.userCardDetails.count({
        where: { userId: staffId, isActive: true },
      }),
      prisma.bankAccount.count({
        where: { userId: staffId, isActive: true },
      }),
    ]);

    const hasAddress = addressCount > 0;
    const hasCard = cardCount > 0;
    const hasBankAccount = bankCount > 0;

    const isComplete = hasAddress && hasCard && hasBankAccount;

    return res.status(200).json({
      success: true,
      profileCompletion: {
        isComplete,
        hasAddress,
        hasCard,
        hasBankAccount,
        addressCount,
        cardCount,
      },
      msg: "Profile completion status fetched successfully.",
    });
  } catch (error) {
    console.error("checkStaffProfileCompletion error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not check profile status.",
      error: error.message,
    });
  }
};

module.exports = {
  requestPaymentFromProvider,
  getStaffPaymentHistory,
  getBookingPaymentStatus,
  getStaffEarnings,
  checkStaffProfileCompletion,
  addBankAccount,
  getBankAccount,
  deleteBankAccount,
};
