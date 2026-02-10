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
      },
    });

    // Get staff bank account
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { userId: request.staffId },
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
        bankDetails: bankAccount
          ? {
              bankName: bankAccount.bankName,
              accountNumber: bankAccount.accountNumber,
              ifscCode: bankAccount.ifscCode,
              accountHolderName: bankAccount.accountHolderName,
              upiId: bankAccount.upiId,
            }
          : null,
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
  const { percentage, paymentMethod } = req.body;

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
      },
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        msg: "Staff not found.",
      });
    }

    // 4. Calculate amount
    const providerEarnings =
      paymentRequest.booking.providerEarnings ||
      paymentRequest.booking.totalAmount;
    const staffAmount = Math.round(providerEarnings * (percentage / 100));

    if (staffAmount <= 1) {
      return res.status(400).json({
        success: false,
        msg: "Amount to pay must be greater than 1.",
      });
    }

    // 5. Create payment record (Manual Payment)
    const payment = await prisma.staffPayment.create({
      data: {
        bookingId: paymentRequest.bookingId,
        staffId: paymentRequest.staffId,
        providerId: providerId,
        requestedAmount: paymentRequest.requestedAmount,
        percentage: percentage,
        staffAmount: staffAmount,
        paymentMethod: paymentMethod || "MANUAL",
        stripeTransferId: null,
        paidAt: new Date(),
        status: "PAID",
      },
    });

    // 6. Update payment request status
    await prisma.staffPaymentRequest.update({
      where: { id: requestId },
      data: {
        requestStatus: "APPROVED",
        reviewedAt: new Date(),
      },
    });

    // 7. Update booking payment status
    await prisma.booking.update({
      where: { id: paymentRequest.bookingId },
      data: {
        staffEarnings: staffAmount,
        staffPercentage: percentage,
        staffPaymentStatus: "PAID",
        staffPaidAt: new Date(),
      },
    });

    // 8. Send notification to staff
    await prisma.notification.create({
      data: {
        title: "💵 Payment Received",
        message: `You have received ₹${staffAmount} for ${paymentRequest.booking.service.name}`,
        receiverId: paymentRequest.staffId,
        senderId: providerId,
      },
    });

    // 9. Get provider name for email
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

    // 10. Send email to staff with invoice
    const { sendMail } = require("../utils/sendmail");
    const { staffPaymentReceivedEmail } = require("../utils/emailTemplates");

    const staffEmailHTML = staffPaymentReceivedEmail(
      staff.name,
      paymentRequest.booking.service.name,
      staffAmount,
      percentage,
      providerEarnings,
      "Manual Transfer", // No Stripe Transfer ID
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
 * Add manual bank account
 */
const addBankAccount = async (req, res) => {
  const providerId = req.user.id;
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
      where: { userId: providerId },
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
        userId: providerId,
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
 * Get provider's bank account
 */
const getBankAccount = async (req, res) => {
  const providerId = req.user.id;

  try {
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { userId: providerId },
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
 * Delete provider's bank account
 */
const deleteBankAccount = async (req, res) => {
  const providerId = req.user.id;
  const { accountId } = req.params;

  try {
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: accountId, userId: providerId },
    });

    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        msg: "Bank account not found.",
      });
    }

    // Check if this is the last bank account — at least one must remain
    const bankAccountCount = await prisma.bankAccount.count({
      where: { userId: providerId },
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

module.exports = {
  getPaymentRequests,
  getPaymentRequestDetails,
  approvePaymentRequest,
  rejectPaymentRequest,
  getPaymentHistory,
  getPaymentStats,
  addBankAccount,
  getBankAccount,
  deleteBankAccount,
};
