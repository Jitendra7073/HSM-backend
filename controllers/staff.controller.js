const prisma = require("../prismaClient");
const { sendMail } = require("../utils/sendmail");
const NotificationService = require("../service/notification-service");
const { storeNotification } = require("./notification.controller");
const {
  serviceCompletionCustomerEmail,
  serviceCompletionProviderEmail,
  staffPaymentConfirmationEmail,
} = require("../utils/emailTemplates");

const getStaffApplications = async (req, res) => {
  const staffId = req.user.id;
  const status = req.query.status; // approved, rejected, pending

  try {
    const whereClause = { staffId };

    if (
      status &&
      ["APPROVED", "REJECTED", "PENDING"].includes(status.toUpperCase())
    ) {
      whereClause.status = status.toUpperCase();
    }

    const applications = await prisma.staffApplications.findMany({
      where: whereClause,
      include: {
        businessProfile: {
          select: {
            id: true,
            businessName: true,
            isActive: true,
            category: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({
      success: true,
      msg: applications.length
        ? "Applications fetched successfully."
        : "Applications not found.",
      applications,
    });
  } catch (error) {
    console.error("getStaffApplications error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch applications.",
    });
  }
};

const cancelStaffApplication = async (req, res) => {
  const staffId = req.user.id;
  const { applicationId } = req.params;

  try {
    const application = await prisma.staffApplications.findFirst({
      where: {
        id: applicationId,
        staffId,
      },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        msg: "Application not found.",
      });
    }

    // Only allow cancelling pending applications
    if (application.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        msg: `Cannot cancel ${application.status.toLowerCase()} application.`,
      });
    }

    await prisma.staffApplications.delete({
      where: { id: applicationId },
    });

    return res.status(200).json({
      success: true,
      msg: "Application cancelled successfully.",
    });
  } catch (error) {
    console.error("cancelStaffApplication error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not cancel application.",
    });
  }
};

const getAllProviders = async (req, res) => {
  const staffId = req.user.id;

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10));
  const skip = (page - 1) * limit;

  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // ----------------------------------
    // STEP 1: Fetch Staff Applications
    // ----------------------------------

    const staffApplications = await prisma.staffApplications.findMany({
      where: {
        staffId,
      },
      select: {
        businessProfileId: true,
      },
    });

    // Convert to Set for fast lookup
    const appliedBusinessSet = new Set(
      staffApplications.map((app) => app.businessProfileId),
    );

    // ----------------------------------
    // STEP 2: Total Count
    // ----------------------------------

    const totalCount = await prisma.user.count({
      where: {
        role: "provider",
        providerSubscription: {
          status: {
            in: ["active", "trialing"],
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

    // ----------------------------------
    // STEP 3: Fetch Providers
    // ----------------------------------

    const providers = await prisma.user.findMany({
      where: {
        role: "provider",
        providerSubscription: {
          status: {
            in: ["active", "trialing"],
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

    // ----------------------------------
    // STEP 4: Add isApplied Flag
    // ----------------------------------

    const processedProviders = providers
      .map((provider) => {
        const plan = provider.providerSubscription?.plan;

        const maxServices = plan?.maxServices ?? 5;
        const maxBookings = plan?.maxBookings ?? 20;

        const currentBookings = provider.businessProfile?._count?.Booking || 0;

        // Hide provider if booking limit exceeded
        if (maxBookings !== -1 && currentBookings >= maxBookings) {
          return null;
        }

        // Limit services
        if (provider.businessProfile?.services && maxServices !== -1) {
          provider.businessProfile.services =
            provider.businessProfile.services.slice(0, maxServices);
        }

        // ----------------------------------
        // APPLY STATUS CHECK
        // ----------------------------------

        const businessId = provider.businessProfile?.id;

        const isApplied = appliedBusinessSet.has(businessId);

        // Cleanup
        delete provider.providerSubscription;
        delete provider.businessProfile?._count;

        return {
          ...provider,
          isApplied,
        };
      })
      .filter(Boolean);

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

const applyForStaffApplication = async (req, res) => {
  const staffId = req.user.id;
  const { businessProfileId } = req.body;

  try {
    //  Check business exists
    const businessProfile = await prisma.businessProfile.findUnique({
      where: { id: businessProfileId },
    });

    if (!businessProfile) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found.",
      });
    }

    //  Check if THIS staff already applied to THIS business
    const existingApplication = await prisma.staffApplications.findFirst({
      where: {
        staffId,
        businessProfileId,
      },
    });

    if (existingApplication) {
      return res.status(400).json({
        success: false,
        msg: "You have already applied for this business profile.",
      });
    }

    //  Create application
    const application = await prisma.staffApplications.create({
      data: {
        staffId,
        businessProfileId,
      },
    });

    return res.status(201).json({
      success: true,
      msg: "Application submitted successfully.",
      application,
    });
  } catch (error) {
    console.error("applyForStaffApplication error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not submit application.",
    });
  }
};

const getStaffBookings = async (req, res) => {
  const staffId = req.user.id;
  const status = req.query.status; // completed, ongoing, upcoming, cancelled

  try {
    const whereClause = {
      StaffAssignBooking: {
        some: {
          assignedStaffId: staffId,
        },
      },
    };

    // Apply status filtering
    if (status === "completed") {
      whereClause.OR = [
        { bookingStatus: "COMPLETED" },
        { trackingStatus: "COMPLETED" },
      ];
    } else if (status === "ongoing") {
      whereClause.bookingStatus = "CONFIRMED";
      whereClause.trackingStatus = {
        in: ["BOOKING_STARTED", "PROVIDER_ON_THE_WAY", "SERVICE_STARTED"],
      };
    } else if (status === "upcoming") {
      whereClause.bookingStatus = "CONFIRMED";
      whereClause.trackingStatus = "NOT_STARTED";
      // Only show upcoming bookings (today or future)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      whereClause.date = { gte: today.toISOString().split("T")[0] };
    } else if (status === "cancelled") {
      whereClause.bookingStatus = "CANCELLED";
    }

    const bookings = await prisma.booking.findMany({
      where: whereClause,
      include: {
        service: {
          select: {
            id: true,
            name: true,
            price: true,
            durationInMinutes: true,
          },
        },
        businessProfile: {
          select: {
            id: true,
            businessName: true,
          },
        },
        slot: true,
        address: {
          select: {
            id: true,
            street: true,
            city: true,
            state: true,
            postalCode: true,
            landmark: true,
            type: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            mobile: true,
          },
        },
        StaffAssignBooking: {
          where: {
            assignedStaffId: staffId,
          },
          select: {
            id: true,
            status: true,
            assignedById: true,
            createdAt: true,
            staffPaymentType: true,
            staffPaymentValue: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const processedBookings = bookings.map((booking) => {
      const assignment = booking.StaffAssignBooking[0];
      let staffEarnings = booking.service.price; // Default to service price if no specific setting

      if (assignment) {
        if (assignment.staffPaymentType === "FIXED_AMOUNT") {
          staffEarnings = assignment.staffPaymentValue;
        } else if (assignment.staffPaymentType === "PERCENTAGE") {
          // Calculate percentage of total amount (or provider earnings if available/preferred)
          const baseAmount =
            booking.providerEarnings || booking.totalAmount || 0;
          staffEarnings = (baseAmount * assignment.staffPaymentValue) / 100;
        }
      }

      return {
        ...booking,
        service: {
          ...booking.service,
          price: staffEarnings, // Replace service price with staff earnings
          originalPrice: booking.service.price, // Keep original price just in case
        },
      };
    });

    return res.status(200).json({
      success: true,
      msg: "Staff bookings fetched successfully.",
      count: processedBookings.length,
      bookings: processedBookings,
    });
  } catch (error) {
    console.error("getStaffBookings error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch staff bookings.",
    });
  }
};

const getDashboardStats = async (req, res) => {
  const staffId = req.user.id;

  try {
    // Get all assigned bookings for this staff
    const allBookings = await prisma.booking.findMany({
      where: {
        StaffAssignBooking: {
          some: {
            assignedStaffId: staffId,
          },
        },
      },
      select: {
        bookingStatus: true,
        trackingStatus: true,
        totalAmount: true,
        providerEarnings: true,
        staffPaymentStatus: true,
      },
    });

    // Calculate stats
    const pendingBookings = allBookings.filter(
      (b) =>
        b.bookingStatus === "PENDING" || b.bookingStatus === "PENDING_PAYMENT",
    ).length;

    const inProgressBookings = allBookings.filter(
      (b) =>
        b.bookingStatus === "CONFIRMED" &&
        ["BOOKING_STARTED", "PROVIDER_ON_THE_WAY", "SERVICE_STARTED"].includes(
          b.trackingStatus,
        ),
    ).length;

    const completedBookings = allBookings.filter(
      (b) =>
        b.bookingStatus === "COMPLETED" || b.trackingStatus === "COMPLETED",
    ).length;

    // Calculate total earnings from StaffPayment table (Actual paid amount)
    const paidPayments = await prisma.staffPayment.findMany({
      where: {
        staffId: staffId,
        status: "PAID",
      },
      select: {
        staffAmount: true,
      },
    });

    const totalEarnings = paidPayments.reduce(
      (sum, p) => sum + p.staffAmount,
      0,
    );

    // Get upcoming bookings (next 5)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingBookings = await prisma.booking.findMany({
      where: {
        StaffAssignBooking: {
          some: {
            assignedStaffId: staffId,
          },
        },
        bookingStatus: "CONFIRMED",
        trackingStatus: "NOT_STARTED",
        date: { gte: today.toISOString().split("T")[0] },
      },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
        businessProfile: {
          select: {
            id: true,
            businessName: true,
          },
        },
        slot: true,
        address: {
          select: {
            id: true,
            street: true,
            city: true,
            state: true,
            postalCode: true,
            landmark: true,
            type: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            mobile: true,
          },
        },
        StaffAssignBooking: {
          where: {
            assignedStaffId: staffId,
          },
          select: {
            staffPaymentType: true,
            staffPaymentValue: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { slot: { time: "asc" } }],
      take: 5,
    });

    // Check if staff is on approved leave today
    const currentLeave = await prisma.staffLeave.findFirst({
      where: {
        staffId,
        status: "APPROVED",
        startDate: { lte: new Date(new Date().setHours(23, 59, 59, 999)) },
        endDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      select: {
        leaveType: true,
        reason: true,
        startDate: true,
        endDate: true,
      },
    });
    console.log("Current leave :", currentLeave);

    // Process upcoming bookings to show staff earnings instead of service price
    const processedUpcomingBookings = upcomingBookings.map((booking) => {
      const assignment = booking.StaffAssignBooking[0];
      let staffEarnings = booking.service.price; // Default to service price if no specific setting

      if (assignment) {
        if (assignment.staffPaymentType === "FIXED_AMOUNT") {
          staffEarnings = assignment.staffPaymentValue;
        } else if (assignment.staffPaymentType === "PERCENTAGE") {
          const baseAmount =
            booking.providerEarnings || booking.totalAmount || 0;
          staffEarnings = (baseAmount * assignment.staffPaymentValue) / 100;
        }
      }

      return {
        ...booking,
        service: {
          ...booking.service,
          price: staffEarnings, // Replace service price with staff earnings
          originalPrice: booking.service.price, // Keep original price just in case
        },
      };
    });

    return res.status(200).json({
      success: true,
      msg: "Dashboard stats fetched successfully.",
      stats: {
        pendingBookings,
        inProgressBookings,
        completedBookings,
        totalEarnings,
        upcomingBookings: processedUpcomingBookings,
        isOnLeave: !!currentLeave,
        leaveDetails: currentLeave,
      },
    });
  } catch (error) {
    console.error("getDashboardStats error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch dashboard stats.",
    });
  }
};

const updateBookingTrackingStatus = async (req, res) => {
  const staffId = req.user.id;
  const { bookingId } = req.params;
  const { status, earlyStartReason } = req.body; // Expecting TrackingStatus enum value + optional reason

  try {
    // 1. Verify Assignment & Staff
    const assignment = await prisma.staffAssignBooking.findFirst({
      where: {
        bookingId: bookingId,
        assignedStaffId: staffId,
      },
    });

    if (!assignment) {
      return res.status(403).json({
        success: false,
        msg: "You are not assigned to this booking.",
      });
    }

    // 2. Get booking details for validation
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: true,
        service: true,
        businessProfile: true,
        slot: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        msg: "Booking not found.",
      });
    }

    // 3. Check if booking is cancelled - prevent tracking updates
    if (booking.bookingStatus === "CANCELLED") {
      return res.status(400).json({
        success: false,
        msg: "Cannot update tracking status. This booking has been cancelled by the customer.",
        bookingCancelled: true,
      });
    }

    // 4. Validate status transition
    const validStatuses = [
      "NOT_STARTED",
      "BOOKING_STARTED",
      "PROVIDER_ON_THE_WAY",
      "SERVICE_STARTED",
      "COMPLETED",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid status provided.",
      });
    }

    // 4. Check if starting early and require reason
    let isEarlyStart = false;
    if (status === "BOOKING_STARTED") {
      const bookingDateTime = new Date(
        `${booking.date} ${booking.slot?.time || "00:00"}`,
      );
      const now = new Date();
      const timeDiffMs = bookingDateTime - now;
      const timeDiffMinutes = timeDiffMs / (1000 * 60);

      // If starting more than 30 minutes early, require reason
      if (timeDiffMinutes > 30) {
        isEarlyStart = true;
        if (!earlyStartReason || earlyStartReason.trim().length === 0) {
          return res.status(400).json({
            success: false,
            msg: "Please provide a reason for starting the service more than 30 minutes early.",
            requireReason: true,
          });
        }
      }
    }

    // 5. Perform update
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        trackingStatus: status,
        // If completed, update main booking status too?
        ...(status === "COMPLETED" && { bookingStatus: "COMPLETED" }),
      },
      include: {
        user: true, // For notification
        service: true,
        businessProfile: true, // For provider notification
      },
    });

    // 5.1 Auto-update staff availability based on service status
    const activeServiceStatuses = [
      "BOOKING_STARTED",
      "PROVIDER_ON_THE_WAY",
      "SERVICE_STARTED",
    ];

    if (activeServiceStatuses.includes(status)) {
      // Set staff to ON_WORK when they actively start working on a booking
      await prisma.user.update({
        where: { id: staffId },
        data: { availability: "ON_WORK" },
      });
    } else if (status === "COMPLETED") {
      // Set staff to AVAILABLE when they complete the service
      // But first check if they have any other active bookings
      const otherActiveBookings = await prisma.booking.findFirst({
        where: {
          id: { not: bookingId },
          StaffAssignBooking: {
            some: {
              assignedStaffId: staffId,
              status: {
                in: ["PENDING", "ACCEPTED"],
              },
            },
          },
          bookingStatus: "CONFIRMED",
          trackingStatus: {
            in: activeServiceStatuses,
          },
        },
      });

      // Only set to AVAILABLE if no other active bookings
      // Also check if staff is NOT marked as NOT_AVAILABLE manually
      const staff = await prisma.user.findUnique({
        where: { id: staffId },
        select: { availability: true },
      });

      if (!otherActiveBookings && staff?.availability !== "NOT_AVAILABLE") {
        await prisma.user.update({
          where: { id: staffId },
          data: { availability: "AVAILABLE" },
        });
      }
    }

    // 6. Send Notifications to Customer AND Provider
    const messageMap = {
      BOOKING_STARTED: isEarlyStart
        ? `Your service provider has started the booking early. Reason: ${earlyStartReason}`
        : "Your service provider has started the booking.",
      PROVIDER_ON_THE_WAY: "Your provider is on the way!",
      SERVICE_STARTED: "Your service has started.",
      COMPLETED: "Your service has been completed. Thank you!",
    };

    const titleMap = {
      BOOKING_STARTED: "Booking Started",
      PROVIDER_ON_THE_WAY: "Provider En Route",
      SERVICE_STARTED: "Service Started",
      COMPLETED: "Service Completed",
    };

    const providerMessageMap = {
      BOOKING_STARTED: isEarlyStart
        ? `Staff member has started the booking early for "${updatedBooking.service.name}". Reason: ${earlyStartReason}`
        : `Staff member has started the booking for "${updatedBooking.service.name}".`,
      PROVIDER_ON_THE_WAY: `Staff member is on the way for booking "${updatedBooking.service.name}".`,
      SERVICE_STARTED: `Staff member has started the service for "${updatedBooking.service.name}".`,
      COMPLETED: `Staff member has completed the service "${updatedBooking.service.name}".`,
    };

    if (messageMap[status]) {
      // Get provider (business owner) user ID
      const providerUser = await prisma.user.findUnique({
        where: { id: updatedBooking.businessProfile.userId },
        select: { id: true, name: true, email: true },
      });

      // Notification to Customer
      await prisma.notification.create({
        data: {
          title: titleMap[status],
          message: messageMap[status],
          receiverId: updatedBooking.userId,
          senderId: staffId,
        },
      });

      // Notification to Provider (Business Owner)
      if (providerUser) {
        await prisma.notification.create({
          data: {
            title: `Staff Update: ${titleMap[status]}`,
            message: providerMessageMap[status],
            receiverId: providerUser.id,
            senderId: staffId,
          },
        });

        // Handle Service Completion - Payment & Emails
        if (status === "COMPLETED") {
          try {
            // 1. Calculate Staff Payment
            const staffPercentage = updatedBooking.staffPercentage || 50; // Default 50%
            const providerEarnings =
              updatedBooking.providerEarnings ||
              updatedBooking.totalAmount * 0.9;
            const staffEarnings = Math.round(
              (providerEarnings * staffPercentage) / 100,
            );

            // 2. Create Staff Payment Record
            await prisma.staffAssignmentPayment.create({
              data: {
                bookingId: bookingId,
                assignedStaffId: staffId,
                amount: staffEarnings,
                percentage: staffPercentage,
                paymentStatus: "PAID",
                paidAt: new Date(),
              },
            });

            // 3. Update Booking with Staff Payment Details
            await prisma.booking.update({
              where: { id: bookingId },
              data: {
                staffEarnings: staffEarnings,
                staffPaymentStatus: "PAID",
                staffPaidAt: new Date(),
              },
            });

            // 4. Get Staff User Details
            const staffUser = await prisma.user.findUnique({
              where: { id: staffId },
              select: { name: true, email: true },
            });

            // 5. Send HTML Email to Provider
            if (providerUser.email) {
              const providerEmailHTML = serviceCompletionProviderEmail(
                providerUser.name,
                updatedBooking.service.name,
                staffUser?.name || "Staff Member",
                updatedBooking.user.name,
                new Date(updatedBooking.date).toLocaleDateString(),
                bookingId,
                updatedBooking.totalAmount,
                { amount: staffEarnings, percentage: staffPercentage },
              );

              await sendMail({
                email: providerUser.email,
                subject: `✅ Staff Completed Service - ${updatedBooking.service.name}`,
                message: providerEmailHTML,
                isHTML: true,
              });
            }

            // 6. Send HTML Email to Customer
            if (updatedBooking.user?.email) {
              const customerEmailHTML = serviceCompletionCustomerEmail(
                updatedBooking.user.name,
                updatedBooking.service.name,
                updatedBooking.businessProfile.businessName,
                staffUser?.name || "Staff Member",
                new Date(updatedBooking.date).toLocaleDateString(),
                bookingId,
              );

              await sendMail({
                email: updatedBooking.user.email,
                subject: `✅ Service Completed - ${updatedBooking.service.name}`,
                message: customerEmailHTML,
                isHTML: true,
              });
            }

            // 7. Send Payment Confirmation to Staff
            if (staffUser?.email) {
              const staffPaymentHTML = staffPaymentConfirmationEmail(
                staffUser.name,
                updatedBooking.service.name,
                updatedBooking.businessProfile.businessName,
                staffEarnings,
                new Date(updatedBooking.date).toLocaleDateString(),
                bookingId,
              );

              await sendMail({
                email: staffUser.email,
                subject: `💵 Payment Received - ${updatedBooking.service.name}`,
                message: staffPaymentHTML,
                isHTML: true,
              });
            }
          } catch (paymentError) {
            console.error("Error processing staff payment:", paymentError);
          }
        }
      }

      return res.status(200).json({
        success: true,
        msg: "Tracking status updated successfully.",
        trackingStatus: updatedBooking.trackingStatus,
      });
    }
  } catch (err) {
    console.error("Update Tracking Error", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not update tracking status.",
    });
  }
};

const getStaffDetailsForProvider = async (req, res) => {
  const providerId = req.user.id;
  const { staffId } = req.params;

  try {
    // Verify staff is associated with this provider's business
    const staffAssignment = await prisma.staffApplications.findFirst({
      where: {
        staffId,
        status: "APPROVED",
        businessProfile: {
          userId: providerId,
        },
      },
      include: {
        businessProfile: {
          select: {
            businessName: true,
          },
        },
      },
    });

    if (!staffAssignment) {
      return res.status(404).json({
        success: false,
        msg: "Staff member not found in your business.",
      });
    }

    // Get staff basic info with availability
    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        createdAt: true,
        isRestricted: true,
        availability: true,
      },
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        msg: "Staff not found.",
      });
    }

    // Get all bookings for this staff under this provider's business with full details
    const allBookings = await prisma.booking.findMany({
      where: {
        businessProfileId: staffAssignment.businessProfileId,
        StaffAssignBooking: {
          some: {
            assignedStaffId: staffId,
          },
        },
      },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            price: true,
            durationInMinutes: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            mobile: true,
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
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Calculate performance metrics
    const totalBookings = allBookings.length;
    const completedBookings = allBookings.filter(
      (b) =>
        b.bookingStatus === "COMPLETED" || b.trackingStatus === "COMPLETED",
    ).length;
    const pendingBookings = allBookings.filter(
      (b) =>
        b.bookingStatus === "PENDING" || b.bookingStatus === "PENDING_PAYMENT",
    ).length;
    const confirmedBookings = allBookings.filter(
      (b) => b.bookingStatus === "CONFIRMED",
    ).length;

    // Total earnings
    const totalEarnings = allBookings
      .filter(
        (b) =>
          b.paymentStatus === "PAID" &&
          (b.bookingStatus === "COMPLETED" || b.trackingStatus === "COMPLETED"),
      )
      .reduce((sum, b) => sum + (b.staffEarnings || 0), 0);

    // Get staff feedback (received by this staff) for this business only
    const staffFeedbacks = await prisma.feedback.findMany({
      where: {
        staffId: staffId,
        feedbackType: "STAFF",
        booking: {
          businessProfileId: staffAssignment.businessProfileId,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Calculate average rating
    const averageRating =
      staffFeedbacks.length > 0
        ? staffFeedbacks.reduce((sum, f) => sum + f.rating, 0) /
          staffFeedbacks.length
        : 0;

    // Calculate on-time performance
    const now = new Date();
    const upcomingBookings = allBookings.filter((b) => {
      const bookingDate = new Date(b.date);
      return bookingDate >= now && b.trackingStatus !== "COMPLETED";
    }).length;

    // Performance score (0-100)
    const completionRate =
      totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0;
    const ratingScore = (averageRating / 5) * 100;
    const performanceScore = Math.round(
      completionRate * 0.6 + ratingScore * 0.4,
    );

    // Check if staff is currently busy (has active booking)
    const activeBookings = allBookings.filter((b) => {
      return (
        b.bookingStatus === "CONFIRMED" &&
        ["BOOKING_STARTED", "PROVIDER_ON_THE_WAY", "SERVICE_STARTED"].includes(
          b.trackingStatus,
        )
      );
    });

    const isBusy = staff.availability === "BUSY" || activeBookings.length > 0;
    const currentBooking = isBusy ? activeBookings[0] : null;

    // Check if staff is on approved leave today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const approvedLeave = await prisma.staffLeave.findFirst({
      where: {
        staffId: staff.id,
        status: "APPROVED",
        startDate: { lte: new Date(new Date().setHours(23, 59, 59, 999)) },
        endDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });

    // Determine availability based on multiple factors
    let finalAvailability = staff.availability;

    // Priority 1: If on approved leave today, set to NOT_AVAILABLE
    if (approvedLeave) {
      finalAvailability = "NOT_AVAILABLE";
    }
    // Priority 2: If has active booking in progress, set to ON_WORK or BUSY
    else if (activeBookings.length > 0 && currentBooking) {
      if (currentBooking.trackingStatus === "SERVICE_STARTED") {
        finalAvailability = "ON_WORK";
      } else if (
        currentBooking.trackingStatus === "PROVIDER_ON_THE_WAY" ||
        currentBooking.trackingStatus === "BOOKING_STARTED"
      ) {
        finalAvailability = "ON_WORK";
      } else {
        finalAvailability = "BUSY";
      }
    }
    // Priority 3: If staff manually set to NOT_AVAILABLE and not on leave
    else if (staff.availability === "NOT_AVAILABLE") {
      finalAvailability = "NOT_AVAILABLE";
    }
    // Priority 4: Otherwise use manual availability or default to AVAILABLE
    else if (staff.availability === "AVAILABLE" || !staff.availability) {
      finalAvailability = "AVAILABLE";
    }

    return res.status(200).json({
      success: true,
      msg: "Staff details fetched successfully.",
      staff: {
        ...staff,
        businessName: staffAssignment.businessProfile.businessName,
        joinedAt: staffAssignment.createdAt,
        availability: finalAvailability,
        currentBooking: currentBooking
          ? {
              service: currentBooking.service.name,
              customer: currentBooking.user.name,
              time: currentBooking.slot?.time,
              date: currentBooking.date,
            }
          : null,
        performance: {
          totalBookings,
          completedBookings,
          pendingBookings,
          confirmedBookings,
          upcomingBookings,
          completionRate: Math.round(completionRate),
          averageRating: parseFloat(averageRating.toFixed(1)),
          totalEarnings,
          performanceScore,
          feedbackCount: staffFeedbacks.length,
        },
        recentFeedbacks: staffFeedbacks.slice(0, 5),
        recentActivity: allBookings.slice(0, 10), // Recent 10 bookings
        bookingHistory: allBookings, // All bookings for history
      },
    });
  } catch (error) {
    console.error("getStaffDetailsForProvider error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch staff details.",
    });
  }
};

const getAllBusinessStaffs = async (req, res) => {
  const userId = req.user.id;
  try {
    const business = await prisma.businessProfile.findFirst({
      where: {
        userId: userId,
      },
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business not found.",
      });
    }
    const staffs = await prisma.staffApplications.findMany({
      where: {
        businessProfileId: business.id,
        status: "APPROVED",
      },
      include: {
        staff: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });
    return res.status(200).json({
      success: true,
      msg: "Staffs fetched successfully.",
      count: staffs.length,
      staffs,
    });
  } catch (err) {
    console.error("Get All Business Staffs Error", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch staffs.",
    });
  }
};

const updateStaffProfile = async (req, res) => {
  const staffId = req.user.id;
  const { name, email, mobile } = req.body;

  try {
    // Validate required fields
    if (!name || !email || !mobile) {
      return res.status(400).json({
        success: false,
        msg: "Name, email, and mobile are required.",
      });
    }

    // Check if email is already taken by another user
    const existingEmail = await prisma.user.findFirst({
      where: {
        email,
        NOT: { id: staffId },
      },
    });

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        msg: "Email is already in use by another account.",
      });
    }

    // Check if mobile is already taken by another user
    const existingMobile = await prisma.user.findFirst({
      where: {
        mobile,
        NOT: { id: staffId },
      },
    });

    if (existingMobile) {
      return res.status(400).json({
        success: false,
        msg: "Mobile number is already in use by another account.",
      });
    }

    // Update staff profile
    const updatedStaff = await prisma.user.update({
      where: { id: staffId },
      data: {
        name,
        email,
        mobile,
      },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        role: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Profile updated successfully.",
      staff: updatedStaff,
    });
  } catch (error) {
    console.error("updateStaffProfile error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not update profile.",
    });
  }
};

const getStaffProfile = async (req, res) => {
  const staffId = req.user.id;

  try {
    // Get staff basic info
    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        role: true,
        createdAt: true,
        isRestricted: true,
        restrictedAt: true,
        restrictionReason: true,
      },
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        msg: "Staff not found.",
      });
    }

    // Get associated businesses (approved applications)
    const businesses = await prisma.staffApplications.findMany({
      where: {
        staffId,
        status: "APPROVED",
      },
      include: {
        businessProfile: {
          select: {
            id: true,
            businessName: true,
            isActive: true,
            category: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    // Get booking stats
    const allBookings = await prisma.booking.findMany({
      where: {
        StaffAssignBooking: {
          some: {
            assignedStaffId: staffId,
          },
        },
      },
      select: {
        bookingStatus: true,
        trackingStatus: true,
        staffPaymentStatus: true,
        providerEarnings: true,
      },
    });

    const totalBookings = allBookings.length;
    const completedBookings = allBookings.filter(
      (b) =>
        b.bookingStatus === "COMPLETED" || b.trackingStatus === "COMPLETED",
    ).length;
    const totalEarnings = allBookings
      .filter(
        (b) =>
          b.paymentStatus === "PAID" &&
          (b.bookingStatus === "COMPLETED" || b.trackingStatus === "COMPLETED"),
      )
      .reduce((sum, b) => sum + (b.providerEarnings || 0), 0);

    // Get reviews
    const reviews = await prisma.staffReview.findMany({
      where: { staffId },
      include: {
        businessProfile: {
          select: {
            businessName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Calculate average rating
    const averageRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    return res.status(200).json({
      success: true,
      msg: "Staff profile fetched successfully.",
      profile: {
        ...staff,
        businesses: businesses.map((app) => ({
          ...app.businessProfile,
          joinedAt: app.createdAt,
        })),
        stats: {
          totalBookings,
          completedBookings,
          totalEarnings,
          averageRating: parseFloat(averageRating.toFixed(1)),
          reviewCount: reviews.length,
        },
        reviews,
      },
    });
  } catch (error) {
    console.error("getStaffProfile error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch staff profile.",
    });
  }
};

const updateStaffAvailability = async (req, res) => {
  const staffId = req.user.id;
  const { availability } = req.body;

  try {
    // Validate availability value - only allow manual toggle between AVAILABLE and NOT_AVAILABLE
    // ON_WORK and BUSY are managed automatically by the system
    const validAvailability = ["AVAILABLE", "NOT_AVAILABLE"];
    if (!validAvailability.includes(availability)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid availability status. Must be AVAILABLE or NOT_AVAILABLE. ON_WORK and BUSY are managed automatically by the system based on bookings.",
      });
    }

    // Check if staff has any active bookings before setting to AVAILABLE
    if (availability === "AVAILABLE") {
      const activeServiceStatuses = [
        "BOOKING_STARTED",
        "PROVIDER_ON_THE_WAY",
        "SERVICE_STARTED",
      ];

      const activeBookings = await prisma.booking.findFirst({
        where: {
          StaffAssignBooking: {
            some: {
              assignedStaffId: staffId,
              status: {
                in: ["PENDING", "ACCEPTED"],
              },
            },
          },
          bookingStatus: "CONFIRMED",
          trackingStatus: {
            in: activeServiceStatuses,
          },
        },
      });

      if (activeBookings) {
        return res.status(400).json({
          success: false,
          msg: "Cannot set to AVAILABLE while you have active bookings. Please complete your current bookings first.",
          hasActiveBookings: true,
        });
      }
    }

    // Update staff availability
    const updatedStaff = await prisma.user.update({
      where: { id: staffId },
      data: {
        availability: availability,
      },
      select: {
        id: true,
        name: true,
        email: true,
        availability: true,
      },
    });

    return res.status(200).json({
      success: true,
      msg: `Staff availability updated to ${availability}.`,
      staff: updatedStaff,
    });
  } catch (error) {
    console.error("updateStaffAvailability error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not update availability.",
    });
  }
};

/* ---------------- STAFF LEAVE MANAGEMENT ---------------- */

const createStaffLeaveRequest = async (req, res) => {
  const staffId = req.user.id;
  const { startDate, endDate, startTime, endTime, leaveType, reason } =
    req.body;

  try {
    // Validate required fields
    if (!startDate || !endDate || !leaveType) {
      return res.status(400).json({
        success: false,
        msg: "Start date, end date, and leave type are required.",
      });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return res.status(400).json({
        success: false,
        msg: "Start date cannot be after end date.",
      });
    }

    // Check for overlapping leave requests
    const overlappingLeave = await prisma.staffLeave.findFirst({
      where: {
        staffId,
        status: { in: ["PENDING", "APPROVED"] },
        OR: [
          {
            startDate: { lte: end },
            endDate: { gte: start },
          },
        ],
      },
    });

    if (overlappingLeave) {
      return res.status(409).json({
        success: false,
        msg: "You already have a leave request during this period.",
      });
    }

    // Create leave request
    const leave = await prisma.staffLeave.create({
      data: {
        staffId,
        startDate: start,
        endDate: end,
        startTime,
        endTime,
        leaveType,
        reason,
        status: "PENDING",
      },
      include: {
        staff: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      msg: "Leave request created successfully. Waiting for provider approval.",
      leave,
    });
  } catch (error) {
    console.error("createStaffLeaveRequest error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not create leave request.",
    });
  }
};

const getStaffLeaveRequests = async (req, res) => {
  const staffId = req.user.id;

  try {
    const leaves = await prisma.staffLeave.findMany({
      where: { staffId },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      leaves,
    });
  } catch (error) {
    console.error("getStaffLeaveRequests error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch leave requests.",
    });
  }
};

/* ---------------- STAFF WEEKLY SCHEDULE MANAGEMENT ---------------- */

const setWeeklySchedule = async (req, res) => {
  const staffId = req.user.id;
  const { schedule } = req.body; // Array of { dayOfWeek, startTime, endTime, isAvailable }

  try {
    // Validate schedule array
    if (!Array.isArray(schedule) || schedule.length === 0) {
      return res.status(400).json({
        success: false,
        msg: "Schedule must be a non-empty array.",
      });
    }

    // Validate dayOfWeek range (0-6)
    const invalidDay = schedule.find((s) => s.dayOfWeek < 0 || s.dayOfWeek > 6);
    if (invalidDay) {
      return res.status(400).json({
        success: false,
        msg: "dayOfWeek must be between 0 (Sunday) and 6 (Saturday).",
      });
    }

    // Use transaction to upsert all schedule entries
    await prisma.$transaction(async (tx) => {
      for (const entry of schedule) {
        await tx.staffWeeklySchedule.upsert({
          where: {
            staffId_dayOfWeek: {
              staffId,
              dayOfWeek: entry.dayOfWeek,
            },
          },
          create: {
            staffId,
            dayOfWeek: entry.dayOfWeek,
            startTime: entry.startTime,
            endTime: entry.endTime,
            isAvailable: entry.isAvailable ?? true,
          },
          update: {
            startTime: entry.startTime,
            endTime: entry.endTime,
            isAvailable: entry.isAvailable ?? true,
          },
        });
      }
    });

    // Fetch updated schedule
    const updatedSchedule = await prisma.staffWeeklySchedule.findMany({
      where: { staffId },
      orderBy: { dayOfWeek: "asc" },
    });

    return res.status(200).json({
      success: true,
      msg: "Weekly schedule updated successfully.",
      schedule: updatedSchedule,
    });
  } catch (error) {
    console.error("setWeeklySchedule error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not update weekly schedule.",
    });
  }
};

const getWeeklySchedule = async (req, res) => {
  const staffId = req.user.id;

  try {
    const schedule = await prisma.staffWeeklySchedule.findMany({
      where: { staffId },
      orderBy: { dayOfWeek: "asc" },
    });

    return res.status(200).json({
      success: true,
      schedule,
    });
  } catch (error) {
    console.error("getWeeklySchedule error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch weekly schedule.",
    });
  }
};

/* ---------------- PROVIDER FUNCTIONS ---------------- */

const getStaffLeaveForApproval = async (req, res) => {
  const providerId = req.user.id;
  const { businessProfileId } = req.params;

  try {
    // Verify provider owns this business
    const business = await prisma.businessProfile.findUnique({
      where: { id: businessProfileId },
      select: { userId: true },
    });

    if (!business || business.userId !== providerId) {
      return res.status(403).json({
        success: false,
        msg: "You are not authorized to manage this business.",
      });
    }

    // Get all staff for this business
    const businessStaffIds = await prisma.staffApplications
      .findMany({
        where: {
          businessProfileId,
          status: "APPROVED",
        },
        select: {
          staffId: true,
        },
      })
      .then((apps) => apps.map((app) => app.staffId));

    // Get leave requests - filter by status if provided
    const statusFilter = req.query.status;

    const whereClause = {
      staffId: { in: businessStaffIds },
    };

    // Only add status filter if not "ALL" and not undefined
    if (statusFilter && statusFilter !== "ALL") {
      whereClause.status = statusFilter;
    }

    const leaveRequests = await prisma.staffLeave.findMany({
      where: whereClause,
      include: {
        staff: {
          select: {
            name: true,
            email: true,
            mobile: true,
          },
        },
      },
      orderBy: { startDate: "asc" },
    });

    return res.status(200).json({
      success: true,
      leaveRequests,
    });
  } catch (error) {
    console.error("getStaffLeaveForApproval error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch leave requests.",
    });
  }
};

const approveStaffLeave = async (req, res) => {
  const providerId = req.user.id;
  const { leaveId } = req.params;
  // TODO: reject reason not handled here
  // const { rejectReason } = req.body;

  try {
    const leave = await prisma.staffLeave.findUnique({
      where: { id: leaveId },
      include: {
        staff: {
          include: {
            staffApplications: {
              where: { status: "APPROVED" },
              select: {
                businessProfileId: true,
              },
            },
          },
        },
      },
    });
    console.log("Details form backend ( ApproveStaffLeave function)", leave);

    if (!leave) {
      return res.status(404).json({
        success: false,
        msg: "Leave request not found.",
      });
    }

    if (leave.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        msg: "Leave request has already been processed.",
      });
    }

    // Verify provider owns the business this staff works for
    const businessIds = leave.staff.staffApplications.map(
      (app) => app.businessProfileId,
    );
    const businesses = await prisma.businessProfile.findMany({
      where: {
        id: { in: businessIds },
        userId: providerId,
      },
    });

    if (businesses.length === 0) {
      return res.status(403).json({
        success: false,
        msg: "You are not authorized to approve leave for this staff member.",
      });
    }

    // Update leave request
    const updatedLeave = await prisma.staffLeave.update({
      where: { id: leaveId },
      data: {
        status: "APPROVED",
        approvedBy: providerId,
        approvedAt: new Date(),
      },
    });

    // Check if leave starts today - if so, set staff availability to NOT_AVAILABLE
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const leaveStartDate = new Date(updatedLeave.startDate);
    leaveStartDate.setHours(0, 0, 0, 0);

    if (leaveStartDate.getTime() === today.getTime()) {
      await prisma.user.update({
        where: { id: leave.staffId },
        data: { availability: "NOT_AVAILABLE" },
      });
    }

    // Send notification to staff member
    const staffTokens = await prisma.fCMToken.findMany({
      where: { userId: leave.staffId, isActive: true },
    });

    if (staffTokens.length > 0) {
      await NotificationService.sendNotification(
        staffTokens,
        "Leave Approved",
        `Your leave request from ${new Date(
          updatedLeave.startDate,
        ).toLocaleDateString()} to ${new Date(
          updatedLeave.endDate,
        ).toLocaleDateString()} has been approved.`,
        {
          type: "LEAVE_APPROVED",
          leaveId: updatedLeave.id,
        },
      );
    }

    // Store in-app notification
    await storeNotification(
      "Leave Approved",
      `Your leave request from ${new Date(
        updatedLeave.startDate,
      ).toLocaleDateString()} to ${new Date(
        updatedLeave.endDate,
      ).toLocaleDateString()} has been approved.`,
      leave.staffId,
    );

    return res.status(200).json({
      success: true,
      msg: "Leave request approved successfully.",
      leave: updatedLeave,
    });
  } catch (error) {
    console.error("approveStaffLeave error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not approve leave request.",
    });
  }
};

const rejectStaffLeave = async (req, res) => {
  const providerId = req.user.id;
  const { leaveId } = req.params;
  const { rejectReason } = req.body;

  try {
    const leave = await prisma.staffLeave.findUnique({
      where: { id: leaveId },
      include: {
        staff: {
          include: {
            staffApplications: {
              where: { status: "APPROVED" },
              select: {
                businessProfileId: true,
              },
            },
          },
        },
      },
    });

    if (!leave) {
      return res.status(404).json({
        success: false,
        msg: "Leave request not found.",
      });
    }

    if (leave.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        msg: "Leave request has already been processed.",
      });
    }

    // Verify provider owns the business this staff works for
    const businessIds = leave.staff.StaffApplications.map(
      (app) => app.businessProfileId,
    );
    const businesses = await prisma.businessProfile.findMany({
      where: {
        id: { in: businessIds },
        userId: providerId,
      },
    });

    if (businesses.length === 0) {
      return res.status(403).json({
        success: false,
        msg: "You are not authorized to reject leave for this staff member.",
      });
    }

    if (!rejectReason) {
      return res.status(400).json({
        success: false,
        msg: "Reject reason is required.",
      });
    }

    // Update leave request
    const updatedLeave = await prisma.staffLeave.update({
      where: { id: leaveId },
      data: {
        status: "REJECTED",
        rejectReason,
        rejectedAt: new Date(),
      },
    });

    // Send notification to staff member
    const staffTokens = await prisma.fCMToken.findMany({
      where: { userId: leave.staffId, isActive: true },
    });

    if (staffTokens.length > 0) {
      await NotificationService.sendNotification(
        staffTokens,
        "Leave Rejected",
        `Your leave request has been rejected. Reason: ${rejectReason}`,
        {
          type: "LEAVE_REJECTED",
          leaveId: updatedLeave.id,
        },
      );
    }

    // Store in-app notification
    await storeNotification(
      "Leave Rejected",
      `Your leave request has been rejected. Reason: ${rejectReason}`,
      leave.staffId,
    );

    return res.status(200).json({
      success: true,
      msg: "Leave request rejected successfully.",
      leave: updatedLeave,
    });
  } catch (error) {
    console.error("rejectStaffLeave error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not reject leave request.",
    });
  }
};

const checkStaffAvailability = async (req, res) => {
  const { staffId, date, time, businessProfileId } = req.query;

  try {
    if (!staffId || !date || !businessProfileId) {
      return res.status(400).json({
        success: false,
        msg: "staffId, date, and businessProfileId are required.",
      });
    }

    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        name: true,
        availability: true,
      },
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        msg: "Staff member not found.",
      });
    }

    // Check all availability factors
    const availabilityChecks = {
      manualAvailability: null,
      onWork: null,
      timeConflict: null,
      leavePeriod: null,
      weeklySchedule: null,
    };

    // 1. Check manual availability (NOT_AVAILABLE)
    if (staff.availability === "NOT_AVAILABLE") {
      availabilityChecks.manualAvailability = {
        available: false,
        reason: "Staff is marked as NOT AVAILABLE",
      };
    }

    // 2. Check if staff is ON_WORK
    if (staff.availability === "ON_WORK") {
      availabilityChecks.onWork = {
        available: false,
        reason: "Staff is currently working on another booking",
      };
    }

    // 3. Check for approved leave during the booking date
    const bookingDate = new Date(date);
    const approvedLeaves = await prisma.staffLeave.findFirst({
      where: {
        staffId,
        status: "APPROVED",
        startDate: { lte: bookingDate },
        endDate: { gte: bookingDate },
      },
    });

    if (approvedLeaves) {
      availabilityChecks.leavePeriod = {
        available: false,
        reason: "Staff is on leave during this period",
        leaveDetails: {
          startDate: approvedLeaves.startDate,
          endDate: approvedLeaves.endDate,
          leaveType: approvedLeaves.leaveType,
        },
      };
    }

    // 4. Check for time conflicts with existing bookings
    if (time) {
      const existingBookings = await prisma.booking.findMany({
        where: {
          businessProfileId,
          StaffAssignBooking: {
            some: {
              assignedStaffId: staffId,
              status: { in: ["PENDING", "ACCEPTED"] },
            },
          },
          date: bookingDate.toISOString().split("T")[0],
          bookingStatus: { not: "CANCELLED" },
          trackingStatus: { not: "COMPLETED" },
        },
        include: {
          slot: true,
          service: true,
        },
      });

      if (existingBookings.length > 0) {
        availabilityChecks.timeConflict = {
          available: false,
          reason: "Staff has conflicting bookings at this time",
          conflictingBookings: existingBookings.map((b) => ({
            bookingId: b.id,
            serviceName: b.service?.name,
            time: b.slot?.time,
            duration: b.service?.durationInMinutes,
          })),
        };
      }
    }

    // 5. Check weekly schedule (if specified)
    if (time) {
      const dayOfWeek = bookingDate.getDay();
      const weeklySchedule = await prisma.staffWeeklySchedule.findUnique({
        where: {
          staffId_dayOfWeek: {
            staffId,
            dayOfWeek,
          },
        },
      });

      if (weeklySchedule && !weeklySchedule.isAvailable) {
        availabilityChecks.weeklySchedule = {
          available: false,
          reason:
            "Staff is not available on this day according to weekly schedule",
          schedule: {
            dayOfWeek: weeklySchedule.dayOfWeek,
            startTime: weeklySchedule.startTime,
            endTime: weeklySchedule.endTime,
          },
        };
      } else if (weeklySchedule) {
        // Check if time is within working hours
        const [bookingHour, bookingMinute] = time.split(":").map(Number);
        const [startHour, startMinute] = weeklySchedule.startTime
          .split(":")
          .map(Number);
        const [endHour, endMinute] = weeklySchedule.endTime
          .split(":")
          .map(Number);

        const bookingTimeMinutes = bookingHour * 60 + bookingMinute;
        const startTimeMinutes = startHour * 60 + startMinute;
        const endTimeMinutes = endHour * 60 + endMinute;

        if (
          bookingTimeMinutes < startTimeMinutes ||
          bookingTimeMinutes > endTimeMinutes
        ) {
          availabilityChecks.weeklySchedule = {
            available: false,
            reason: "Booking time is outside staff's working hours",
            schedule: {
              dayOfWeek: weeklySchedule.dayOfWeek,
              startTime: weeklySchedule.startTime,
              endTime: weeklySchedule.endTime,
            },
          };
        }
      }
    }

    // Determine overall availability
    const isAvailable = !Object.values(availabilityChecks).some(
      (check) => check && check.available === false,
    );

    return res.status(200).json({
      success: true,
      staffId,
      staffName: staff.name,
      isAvailable,
      availabilityChecks,
      currentStatus: staff.availability,
    });
  } catch (error) {
    console.error("checkStaffAvailability error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not check staff availability.",
    });
  }
};

module.exports = {
  getAllProviders,
  getStaffApplications,
  cancelStaffApplication,
  applyForStaffApplication,

  getStaffBookings,
  getDashboardStats,
  getStaffProfile,
  updateStaffProfile,
  updateStaffAvailability,
  updateBookingTrackingStatus,
  getAllBusinessStaffs,
  getStaffDetailsForProvider,
  createStaffLeaveRequest,
  getStaffLeaveRequests,
  setWeeklySchedule,
  getWeeklySchedule,
  getStaffLeaveForApproval,
  approveStaffLeave,
  rejectStaffLeave,
  checkStaffAvailability,
};
