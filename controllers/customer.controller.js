const prisma = require("../prismaClient");
const {
  slotBookingRequestTemplate,
} = require("../helper/mail-tamplates/tamplates");
const { sendMail } = require("../utils/sendmail");
const {
  FeedbackValidation,
} = require("../helper/validation/feedback.validation");
const NotificationService = require("../service/notification-service");
const { storeNotification } = require("./notification.controller");
const {
  logUserActivity,
  logActionError,
  logError,
  LogStatus,
} = require("../utils/logger");

/* ---------------- GET ALL PROVIDERS (WITH PAGINATION) ---------------- */
const getAllProviders = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10)); // Default 10, max 100
  const skip = (page - 1) * limit;

  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Get total count of providers (Active or Trialing only)
    const totalCount = await prisma.user.count({
      where: {
        role: "provider",
        providerSubscription: {
          status: {
            in: ["active", "trialing"], // Free plan is also 'active'
          },
          currentPeriodEnd: {
            gt: new Date(),
          },
        },
        businessProfile: {
          isActive: true,
          isRestricted: false,
          isApproved: true,
          isRejected: false,
        },
      },
    });

    // Fetch paginated providers with optimized select
    const providers = await prisma.user.findMany({
      where: {
        role: "provider",
        providerSubscription: {
          status: {
            in: ["active", "trialing"], // Free plan is also 'active'
          },
          currentPeriodEnd: {
            gt: new Date(),
          },
        },
        businessProfile: {
          isActive: true,
          isRestricted: false,
          isApproved: true,
          isRejected: false,
        },
      },
      select: {
        id: true,
        name: true,
        mobile: true,
        providerSubscription: {
          select: {
            plan: {
              select: {
                maxServices: true,
                maxBookings: true,
              },
            },
          },
        },
        businessProfile: {
          select: {
            id: true,
            businessName: true,
            isActive: true,
            // Count monthly bookings for limit check
            _count: {
              select: {
                Booking: {
                  where: {
                    createdAt: { gte: startOfMonth },
                    bookingStatus: { not: "CANCELLED" },
                  },
                },
              },
            },
            services: {
              where: {
                isActive: true,
                isRestricted: false,
              },
              select: {
                id: true,
                name: true,
                category: true,
                durationInMinutes: true,
                price: true,
                averageRating: true,
                reviewCount: true,
              },
            },
          },
        },
        addresses: {
          select: {
            id: true,
            street: true,
            city: true,
            state: true,
            type: true,
          },
        },
      },
      orderBy: {
        businessProfile: {
          businessName: "asc",
        },
      },
      take: limit,
      skip: skip,
    });

    // Post-process to filter by limits
    const processedProviders = providers
      .map((provider) => {
        const plan = provider.providerSubscription?.plan;
        const maxServices = plan?.maxServices ?? 5;
        const maxBookings = plan?.maxBookings ?? 20;

        // 1. Check Booking Limit
        const currentBookings = provider.businessProfile?._count?.Booking || 0;
        if (maxBookings !== -1 && currentBookings >= maxBookings) {
          // Provider has reached monthly limits, hide them
          return null;
        }

        // 2. Limit Services
        if (
          provider.businessProfile &&
          provider.businessProfile.services &&
          maxServices !== -1
        ) {
          provider.businessProfile.services =
            provider.businessProfile.services.slice(0, maxServices);
        }

        // Cleanup response
        delete provider.providerSubscription;
        if (provider.businessProfile) {
          delete provider.businessProfile._count;
        }

        return provider;
      })
      .filter((p) => p !== null); // Remove hidden providers

    if (!processedProviders.length) {
      return res.status(200).json({
        success: true,
        msg: "No subscribed providers available.",
        count: 0,
        pagination: {
          page,
          limit,
          totalCount, // Note: totalCount is still the unfiltered count
          totalPages: Math.ceil(totalCount / limit),
        },
        providers: [],
      });
    }

    // Recalculate pagination metadata if needed, though totalCount is pre-filtering
    // Ideally we'd filter at DB level but aggregation in WHERE is limited.

    return res.status(200).json({
      success: true,
      msg: "Subscribed providers fetched successfully.",
      count: processedProviders.length,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      providers: processedProviders,
    });
  } catch (err) {
    console.error("Error fetching providers:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch providers.",
    });
  }
};

/* ---------------- GET PROVIDER BY ID (OPTIMIZED) ---------------- */
const getProviderById = async (req, res) => {
  const { providerId } = req.params;

  try {
    const provider = await prisma.user.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        providerSubscription: {
          select: {
            plan: {
              select: {
                maxServices: true,
              },
            },
          },
        },
        businessProfile: {
          select: {
            id: true,
            businessName: true,
            contactEmail: true,
            phoneNumber: true,
            websiteURL: true,
            isActive: true,
            isRestricted: true,
            isApproved: true,
            isRejected: true,
            socialLinks: true,
            services: {
              where: {
                isActive: true,
                isRestricted: false,
              },
              select: {
                id: true,
                name: true,
                category: true,
                durationInMinutes: true,
                currency: true,
                price: true,
                coverImage: true,
                images: true,
                averageRating: true,
                reviewCount: true,
                totalBookingAllow: true,
                isActive: true,
                feedback: true,
              },
              take: 50,
            },
            slots: {
              select: {
                id: true,
                time: true,
              },
              take: 50,
            },
          },
        },
        addresses: {
          select: {
            id: true,
            street: true,
            city: true,
            state: true,
            postalCode: true,
            country: true,
            type: true,
          },
          take: 5,
        },
      },
    });

    if (!provider) {
      return res
        .status(404)
        .json({ success: false, msg: "Provider not found." });
    }

    if (
      provider.businessProfile &&
      (provider.businessProfile.isRestricted ||
        !provider.businessProfile.isApproved ||
        provider.businessProfile.isRejected)
    ) {
      return res
        .status(404)
        .json({ success: false, msg: "Provider is currently unavailable." });
    }

    // Limit services based on plan
    const maxServices = provider.providerSubscription?.plan?.maxServices || 5;
    if (
      provider.businessProfile &&
      provider.businessProfile.services &&
      maxServices !== -1
    ) {
      provider.businessProfile.services =
        provider.businessProfile.services.slice(0, maxServices);
    }

    // cleanup subscription for response
    delete provider.providerSubscription;

    return res.status(200).json({
      success: true,
      msg: "Provider fetched successfully.",
      provider,
    });
  } catch (err) {
    console.error("Error fetching provider:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Server Error: Could not fetch provider." });
  }
};

/* ---------------- GET CUSTOMER BOOKINGS (WITH PAGINATION) ---------------- */
const getCustomerBookings = async (req, res) => {
  const customerId = req.user.id;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10)); // Default 10, max 100
  const skip = (page - 1) * limit;

  try {
    const currentTime = new Date();

    // Get total count for pagination
    const totalCount = await prisma.booking.count({
      where: { userId: customerId },
    });

    // Fetch paginated bookings with optimized select
    const bookings = await prisma.booking.findMany({
      where: { userId: customerId },
      select: {
        id: true,
        totalAmount: true,
        bookingStatus: true,
        trackingStatus: true,
        date: true,
        paymentLink: true,
        paymentStatus: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        service: {
          select: {
            id: true,
            name: true,
          },
        },
        businessProfile: {
          select: {
            id: true,
            businessName: true,
            user: {
              select: {
                id: true,
                email: true,
                mobile: true,
              },
            },
          },
        },
        StaffAssignBooking: {
          select: {
            assignedStaff: {
              select: {
                name: true,
                mobile: true,
                email: true,
              },
            },
          },
        },
        slot: {
          select: {
            id: true,
            time: true,
          },
        },
        address: {
          select: {
            id: true,
            street: true,
            city: true,
            state: true,
            postalCode: true,
            country: true,
            landmark: true,
            type: true,
          },
        },
        cancellation: {
          select: {
            id: true,
            reason: true,
            reasonType: true,
            refundStatus: true,
            refundAmount: true,
            cancellationFee: true,
            hoursBeforeService: true,
            refundedAt: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: skip,
    });

    // Compute feedback flag without relying on isFeedbackProvided column (handles prod schema drift)
    const bookingIds = bookings.map((b) => b.id);
    const feedbacks = bookingIds.length
      ? await prisma.feedback.findMany({
          where: { bookingId: { in: bookingIds } },
          select: { bookingId: true },
        })
      : [];
    const feedbackSet = new Set(feedbacks.map((f) => f.bookingId));

    const formatted = bookings.map((b) => {
      let paymentLinkInfo = null;

      // Only show payment link for pending payments that haven't expired
      if (
        b.bookingStatus === "PENDING_PAYMENT" &&
        b.paymentStatus === "PENDING" &&
        b.paymentLink &&
        b.expiresAt &&
        new Date(b.expiresAt) > currentTime
      ) {
        const timeLeftMs = new Date(b.expiresAt) - currentTime;
        const timeLeftMinutes = Math.floor(timeLeftMs / (1000 * 60));
        const timeLeftSeconds = Math.floor((timeLeftMs % (1000 * 60)) / 1000);

        paymentLinkInfo = {
          url: b.paymentLink,
          timeLeftMinutes,
          timeLeftSeconds,
          expiresAt: b.expiresAt,
        };
      }

      return {
        id: b.id,
        totalAmount: b.totalAmount,
        paymentStatus: b.paymentStatus,
        bookingStatus: b.bookingStatus,
        trackingStatus: b.trackingStatus || "NOT_STARTED",
        assignedStaff: b.StaffAssignBooking?.[0]?.assignedStaff || null,
        date: b.date,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        isFeedbackProvided: feedbackSet.has(b.id),
        service: b.service,
        slot: b.slot,
        address: b.address,
        business: {
          id: b.businessProfile?.id,
          name: b.businessProfile?.businessName,
          email: b.businessProfile?.user?.email,
          phone: b.businessProfile?.user?.mobile,
        },
        paymentLinkInfo,
        cancellation: b.cancellation,
      };
    });

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      success: true,
      msg: "Bookings fetched successfully.",
      count: formatted.length,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
      bookings: formatted,
    });
  } catch (err) {
    console.error("Error fetching customer bookings:", err);
    return res
      .status(500)
      .json({ success: false, msg: "Could not fetch bookings." });
  }
};

/* ---------------- CANCEL BOOKING ---------------- */
const cancelBooking = async (req, res) => {
  const customerId = req.user.id;
  const { bookingId, reason, reasonType } = req.body;

  if (!bookingId || !reason || !reasonType) {
    return res.status(400).json({
      success: false,
      msg: "Booking ID, reason and reason type are required.",
    });
  }

  /* ---------- helper: parse slot time (12h → 24h) ---------- */
  const parseSlotTimeTo24H = (timeStr) => {
    if (!timeStr) return { hours: 0, minutes: 0 };

    const normalized = timeStr.toUpperCase().trim();

    let timePart = normalized;
    let modifier = "";

    if (normalized.includes("PM")) {
      modifier = "PM";
      timePart = normalized.replace("PM", "").trim();
    } else if (normalized.includes("AM")) {
      modifier = "AM";
      timePart = normalized.replace("AM", "").trim();
    }

    let [hours, minutes] = timePart.split(":").map(Number);

    if (isNaN(hours)) hours = 0;
    if (isNaN(minutes)) minutes = 0;

    if (modifier === "PM" && hours !== 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;

    return { hours, minutes };
  };

  try {
    const booking = await prisma.Booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
        slot: true,
        businessProfile: { include: { user: true } },
        StaffAssignBooking: {
          where: {
            status: {
              in: ["PENDING", "ACCEPTED"],
            },
          },
          include: {
            assignedStaff: true,
          },
        },
      },
    });

    /* ---------------- VALIDATIONS ---------------- */
    if (!booking || booking.userId !== customerId) {
      return res.status(404).json({
        success: false,
        msg: "Booking not found or not owned by you.",
      });
    }

    if (booking.bookingStatus === "COMPLETED") {
      return res.status(400).json({
        success: false,
        msg: "Completed bookings cannot be cancelled.",
      });
    }

    if (booking.bookingStatus === "CANCELLED") {
      return res.status(409).json({
        success: false,
        msg: "Booking already cancelled.",
      });
    }

    /* ---------------- CHECK STAFF TRACKING STATUS ---------------- */
    // If staff is assigned and tracking has progressed to last 2 steps, prevent cancellation
    const restrictedTrackingStatuses = ["SERVICE_STARTED", "COMPLETED"];

    if (
      booking.StaffAssignBooking.length > 0 &&
      booking.StaffAssignBooking.some(
        (assignment) => assignment.status === "ACCEPTED"
      ) &&
      restrictedTrackingStatuses.includes(booking.trackingStatus)
    ) {
      return res.status(400).json({
        success: false,
        msg: "You are not eligible to cancel this booking because the booking is almost at completion state.",
        cannotCancel: true,
        trackingStatus: booking.trackingStatus,
      });
    }

    /* ---------------- SERVICE START TIME ---------------- */
    if (!booking.slot || !booking.slot.time) {
      return res.status(400).json({
        success: false,
        msg: "Service time not available.",
      });
    }

    let serviceStart;
    try {
      const bookingDate = new Date(booking.date);
      const { hours, minutes } = parseSlotTimeTo24H(booking.slot.time);

      serviceStart = new Date(bookingDate);
      if (isNaN(serviceStart.getTime())) {
        const parts = booking.date.split(/[-/]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            serviceStart = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
          } else {
            serviceStart = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          }
        }
      }

      if (isNaN(serviceStart.getTime())) {
        throw new Error("Invalid date");
      }

      serviceStart.setHours(hours, minutes, 0, 0);
    } catch (e) {
      console.error(
        "Date parsing error for booking:",
        booking.id,
        booking.date,
        e,
      );
      return res.status(400).json({
        success: false,
        msg: "Invalid service start time format in booking.",
      });
    }

    const now = new Date();
    const diffMs = serviceStart - now;
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours <= 0) {
      return res.status(400).json({
        success: false,
        msg: "Service has already started or passed.",
      });
    }

    /* ---------------- CANCELLATION FEE LOGIC ---------------- */
    let feePercentage = 0;

    if (diffHours < 4) feePercentage = 50;
    else if (diffHours < 12) feePercentage = 25;
    else if (diffHours < 24) feePercentage = 10;

    let cancellationFee = 0;
    let refundAmount = 0;

    if (booking.paymentStatus === "PAID") {
      cancellationFee = Math.round((booking.totalAmount * feePercentage) / 100);
      refundAmount = booking.totalAmount - cancellationFee;
    }

    /* ---------------- DB TRANSACTION ---------------- */
    await prisma.$transaction(async (tx) => {
      await tx.Cancellation.create({
        data: {
          bookingId: booking.id,
          requestedById: customerId,
          reason,
          reasonType,
          status: "CANCELLED",
          refundStatus:
            booking.paymentStatus === "PAID" ? "PENDING" : "CANCELLED",
          refundAmount,
          cancellationFee,
          hoursBeforeService: Math.floor(diffHours),
        },
      });

      await tx.Booking.update({
        where: { id: booking.id },
        data: {
          bookingStatus: "CANCELLED",
          paymentStatus:
            booking.paymentStatus === "PAID" ? "REFUNDED" : "CANCELLED",
          providerEarnings:
            booking.paymentStatus === "PAID" ? cancellationFee : 0,
          platformFee: 0,
        },
      });

      // Update staff assignment status to CANCELLED if staff is assigned
      if (booking.StaffAssignBooking.length > 0) {
        await tx.staffAssignBooking.updateMany({
          where: {
            bookingId: booking.id,
            status: {
              in: ["PENDING", "ACCEPTED"],
            },
          },
          data: {
            status: "CANCELLED",
          },
        });
      }
    });

    /* ---------------- PROCESS STRIPE REFUND IMMEDIATELY ---------------- */
    let refundResponse = null;
    if (booking.paymentStatus === "PAID" && refundAmount > 0) {
      try {
        // Find the payment record to get payment intent ID
        const payment = await prisma.CustomerPayment.findFirst({
          where: {
            bookingIds: {
              contains: booking.id,
            },
            status: "PAID",
          },
        });

        if (payment && payment.paymentIntentId) {
          const Stripe = require("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

          // Create refund in Stripe
          const refund = await stripe.refunds.create({
            payment_intent: payment.paymentIntentId,
            amount: refundAmount * 100, // Convert to cents
            reason: "requested_by_customer",
            metadata: {
              bookingId: booking.id,
              userId: customerId,
              cancellationFee: cancellationFee,
              reasonType: reasonType,
              hoursBeforeService: Math.floor(diffHours),
            },
          });

          refundResponse = {
            refundId: refund.id,
            status: refund.status,
            amount: refund.amount / 100,
          };
          let refundStatus = "PENDING";
          if (refund.status === "succeeded") {
            refundStatus = "PAID";
          } else if (refund.status === "pending") {
            refundStatus = "PROCESSING";
          } else if (
            refund.status === "failed" ||
            refund.status === "canceled"
          ) {
            refundStatus = "FAILED";
          }

          await prisma.Cancellation.update({
            where: { bookingId: booking.id },
            data: {
              refundStatus: refundStatus,
              refundedAt: refund.status === "succeeded" ? new Date() : null,
            },
          });
        } else {
          console.warn(`No payment intent found for booking ${booking.id}`);
          await prisma.Cancellation.update({
            where: { bookingId: booking.id },
            data: {
              refundStatus: "FAILED",
            },
          });
        }
      } catch (refundError) {
        console.error("Refund processing error:", refundError.message);
        try {
          await prisma.Cancellation.update({
            where: { bookingId: booking.id },
            data: {
              refundStatus: "PENDING",
            },
          });
        } catch (updateError) {
          console.error("Failed to update cancellation status:", updateError);
        }
      }
    }

    /* NOTIFICATIONS (STORE + PUSH)*/

    /* ---------- CUSTOMER ---------- */
    const getRefundStatusMessage = () => {
      if (booking.paymentStatus !== "PAID" || refundAmount === 0) {
        return "";
      }

      const feeMsg =
        cancellationFee > 0 ? ` (Cancellation fee: ₹${cancellationFee})` : "";
      return ` ₹${refundAmount} refund is being processed${feeMsg}. You'll receive it within 5-7 business days.`;
    };

    const customerPayload = {
      title: "Booking Cancelled Successfully",
      body: `Your booking for ${
        booking.service.name
      } has been cancelled.${getRefundStatusMessage()}`,
      type: "BOOKING_CANCELLED",
    };

    await storeNotification(
      customerPayload.title,
      customerPayload.body,
      customerId,
      customerId,
    );

    try {
      const customerTokens = await prisma.FCMToken.findMany({
        where: { userId: customerId, isActive: true },
      });

      if (customerTokens.length > 0) {
        await NotificationService.sendNotification(
          customerTokens,
          customerPayload.title,
          customerPayload.body,
          {
            type: customerPayload.type,
            tag: `booking_cancel_${booking.id}`,
          },
        );
      }
    } catch (err) {
      console.error("Customer push error:", err.message);
    }

    /* ---------- PROVIDER ---------- */
    const providerId = booking.businessProfile.user.id;

    const providerPayload = {
      title: "Booking Cancelled by Customer",
      body:
        booking.paymentStatus === "PAID"
          ? `Customer cancelled booking for ${
              booking.service.name
            }. Refund of ₹${refundAmount} is being processed${
              cancellationFee > 0
                ? ` (Cancellation fee: ₹${cancellationFee} deducted)`
                : ""
            }.`
          : `Customer cancelled unpaid booking for ${booking.service.name}.`,
      type: "BOOKING_CANCELLED",
    };

    await storeNotification(
      providerPayload.title,
      providerPayload.body,
      providerId,
      customerId,
    );

    try {
      const providerTokens = await prisma.FCMToken.findMany({
        where: { userId: providerId, isActive: true },
      });

      if (providerTokens.length > 0) {
        await NotificationService.sendNotification(
          providerTokens,
          providerPayload.title,
          providerPayload.body,
          {
            type: providerPayload.type,
            tag: `booking_cancel_${booking.id}`,
          },
        );
      }
    } catch (err) {
      console.error("Provider push error:", err.message);
    }

    /* ---------- STAFF ---------- */
    // Notify staff members assigned to this booking
    if (booking.StaffAssignBooking.length > 0) {
      for (const assignment of booking.StaffAssignBooking) {
        const staffId = assignment.assignedStaffId;

        const staffPayload = {
          title: "Booking Cancelled by Customer",
          body: `Customer has cancelled the booking for ${booking.service.name}. This assignment has been cancelled.`,
          type: "BOOKING_CANCELLED",
        };

        await storeNotification(
          staffPayload.title,
          staffPayload.body,
          staffId,
          customerId,
        );

        try {
          const staffTokens = await prisma.FCMToken.findMany({
            where: { userId: staffId, isActive: true },
          });

          if (staffTokens.length > 0) {
            await NotificationService.sendNotification(
              staffTokens,
              staffPayload.title,
              staffPayload.body,
              {
                type: staffPayload.type,
                tag: `booking_cancel_${booking.id}`,
              },
            );
          }
        } catch (err) {
          console.error(`Staff ${staffId} push error:`, err.message);
        }
      }
    }

    // Log booking cancellation to database for admin tracking
    await logUserActivity({
      user: req.user,
      actionType: "BOOKING_CANCELLED",
      status: LogStatus.SUCCESS,
      metadata: {
        bookingId: booking.id,
        serviceName: booking.service.name,
        refundAmount,
        cancellationFee,
        hoursBeforeService: Math.floor(diffHours),
        paymentStatus: booking.paymentStatus,
        refundStatus: refundResponse?.status || "N/A",
      },
      req,
      description: `Booking cancelled ${Math.floor(
        diffHours,
      )} hours before service. Refund: ₹${refundAmount}`,
    });
    /* ---------------- RESPONSE ---------------- */
    return res.status(200).json({
      success: true,
      msg: "Booking cancelled successfully.",
      data: {
        feePercentage,
        cancellationFee,
        refundAmount,
        hoursBeforeService: Math.floor(diffHours),
        refund: refundResponse,
        bookingId: booking.id,
        originalAmount: booking.totalAmount,
      },
    });
  } catch (error) {
    console.error("Cancel booking error:", error);
    return res.status(500).json({
      success: false,
      msg: "Something went wrong while cancelling the booking.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/* ---------------- GET ALL SERVICES ---------------- */
const getAllServices = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10)); // Default 10
    const skip = (page - 1) * limit;

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where: {
          isActive: true,
          isRestricted: false,
          businessProfile: {
            isActive: true,
            isRestricted: false,
            isApproved: true,
            isRejected: false,
          },
        },
        take: limit,
        skip,
      }),
      prisma.service.count({
        where: {
          isActive: true,
          isRestricted: false,
          businessProfile: {
            isActive: true,
            isRestricted: false,
          },
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      msg: "Services fetched successfully.",
      count: services.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      services,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, msg: "Could not fetch services." });
  }
};

/* ---------------- GET CART ITEMS ---------------- */
const getCart = async (req, res) => {
  const userId = req.user.id;

  try {
    const cart = await prisma.Cart.findMany({
      where: { userId },
      select: {
        id: true,
        date: true,
        business: {
          select: {
            id: true,
            businessName: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
        slot: {
          select: {
            id: true,
            time: true,
          },
        },
      },
    });

    if (cart.length === 0) {
      return res.status(200).json({
        success: true,
        msg: "Cart is empty.",
        totalItems: 0,
        totalPrice: 0,
      });
    }

    const totalItems = cart.length;
    const totalPrice = cart.reduce((sum, item) => sum + item.service.price, 0);

    return res.status(200).json({
      success: true,
      msg: "Cart fetched successfully.",
      totalItems,
      totalPrice,
      cart,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, msg: "Could not fetch cart." });
  }
};

/* ---------------- ADD ITEM TO CART ---------------- */
const addToCart = async (req, res) => {
  const userId = req.user.id;
  const { serviceId, businessId, slotId, date } = req.body;

  try {
    // ==== Check if business exists ====
    const business = await prisma.BusinessProfile.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business does not exist.",
      });
    }

    // ==== Check if service exists ====
    const service = await prisma.Service.findUnique({
      where: { id: serviceId },
    });
    if (!service) {
      return res.status(404).json({
        success: false,
        msg: "Service not found.",
      });
    }

    // ==== Check if slot exists ====
    const slot = await prisma.Slot.findUnique({ where: { id: slotId } });
    if (!slot) {
      return res.status(404).json({
        success: false,
        msg: "Slot does not exist.",
      });
    }

    const isoDate = new Date(date).toISOString();

    // ==== Prevent duplicate cart entries ====
    const existing = await prisma.Cart.findFirst({
      where: {
        userId,
        serviceId,
        slotId,
        date: isoDate,
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        msg: "This service & slot is already in your cart.",
      });
    }

    // ==== Add to cart ====
    const added = await prisma.Cart.create({
      data: {
        userId,
        serviceId,
        businessId,
        slotId,
        date: isoDate,
      },
    });

    return res.status(201).json({
      success: true,
      msg: "Service added to cart successfully.",
      cart: added,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Internal server error while adding to cart.",
    });
  }
};

/* ---------------- REMOCVE ITEM FROM CART ---------------- */
const removeItemFromCart = async (req, res) => {
  try {
    const { cartId } = req.body;

    if (!cartId) {
      return res.status(400).json({
        success: false,
        msg: "cartId is required.",
      });
    }

    const cartItem = await prisma.Cart.findUnique({
      where: { id: cartId },
    });

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        msg: "Item not found in cart.",
      });
    }

    await prisma.Cart.delete({
      where: { id: cartId },
    });

    return res.status(200).json({
      success: true,
      msg: "Item removed from your cart.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not remove item from cart",
    });
  }
};

/* ---------------- GET ALL FEEDBACK ---------------- */
const getAllFeedback = async (req, res) => {
  const userId = req.user.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      msg: "Unauthorized: User not logged in",
    });
  }

  try {
    const feedbacks = await prisma.Feedback.findMany({
      where: { userId: userId },
    });

    return res.status(200).json({
      success: true,
      msg: "All feedbacks",
      feedbacks,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Server error: unable to get your feedbacks!",
    });
  }
};

/* ---------------- GIVE FEEDBACK ---------------- */
const giveFeedback = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      msg: "Unauthorized: User not logged in",
    });
  }

  const { error, value } = FeedbackValidation.validate(req.body, {
    abortEarly: false,
  });

  if (error) {
    return res.status(422).json({
      success: false,
      msg: error.details.map((e) => e.message),
    });
  }

  const { rating, comment, bookingId } = value;

  try {
    /* ---------------- USER INFORMATION ---------------- */
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    /* ---------------- BOOKING CHECK ---------------- */
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        msg: "Booking not found",
      });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({
        success: false,
        msg: "You are not allowed to give feedback for this booking",
      });
    }

    if (booking.bookingStatus !== "COMPLETED") {
      return res.status(400).json({
        success: false,
        msg: "You can give feedback only after service completion",
      });
    }

    /* ---------------- TRANSACTION ---------------- */
    const feedback = await prisma.$transaction(async (tx) => {
      const feedback = await tx.feedback.create({
        data: {
          userId,
          serviceId: booking.serviceId,
          bookingId,
          username: user.name,
          servicename: booking.service.name,
          rating,
          comment,
        },
      });

      /* ---------------- UPDATE SERVICE RATING ---------------- */
      const allRatings = await tx.feedback.aggregate({
        where: { serviceId: booking.serviceId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      await tx.service.update({
        where: { id: booking.serviceId },
        data: {
          averageRating: Number(allRatings._avg.rating.toFixed(1)),
          reviewCount: allRatings._count.rating,
        },
      });

      /* ---------------- MARK BOOKING ---------------- */
      await tx.booking.update({
        where: { id: bookingId },
        data: { isFeedbackProvided: true },
      });

      return feedback;
    });
    // Log feedback submission to database for admin tracking
    await logUserActivity({
      user: req.user,
      actionType: "FEEDBACK_SUBMITTED",
      status: LogStatus.SUCCESS,
      metadata: {
        bookingId: booking.id,
        serviceId: booking.serviceId,
        serviceName: booking.service.name,
        rating,
        hasComment: !!comment,
        commentLength: comment?.length || 0,
      },
      req,
      description: `Feedback submitted: ${rating} stars for ${booking.service.name}`,
    });

    return res.status(201).json({
      success: true,
      msg: "Feedback submitted successfully",
      feedback,
    });
  } catch (error) {
    logError("Give Feedback Error", error, {
      userId,
      bookingId: req.body?.bookingId,
    });
    return res.status(500).json({
      success: false,
      msg: "Server error: unable to save your feedback",
    });
  }
};

/* ---------------- GET CANCELLATION DETAILS FOR REFUND TRACKING ---------------- */
const getCancellationDetails = async (req, res) => {
  const customerId = req.user.id;
  const { bookingId } = req.params;

  try {
    const booking = await prisma.Booking.findUnique({
      where: { id: bookingId },
      include: {
        service: {
          select: {
            name: true,
            price: true,
          },
        },
        cancellation: true,
      },
    });

    if (!booking || booking.userId !== customerId) {
      return res.status(404).json({
        success: false,
        msg: "Booking not found or not owned by you.",
      });
    }

    if (!booking.cancellation) {
      return res.status(404).json({
        success: false,
        msg: "No cancellation found for this booking.",
      });
    }

    return res.status(200).json({
      success: true,
      msg: "Cancellation details fetched successfully.",
      cancellation: booking.cancellation,
      booking: {
        id: booking.id,
        serviceName: booking.service.name,
        originalAmount: booking.totalAmount,
        bookingStatus: booking.bookingStatus,
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        msg: "Feedback already submitted for this booking",
      });
    }
    console.error("Get cancellation error:", error);
    return res.status(500).json({
      success: false,
      msg: "Failed to fetch cancellation details.",
    });
  }
};

module.exports = {
  getAllProviders,
  getProviderById,
  getCustomerBookings,
  cancelBooking,
  getAllServices,
  getCart,
  addToCart,
  removeItemFromCart,
  getAllFeedback,
  giveFeedback,
  getCancellationDetails,
};
