const prisma = require("../prismaClient");
const { sendMail } = require("../utils/sendmail");
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

const requestForExist = async (req, res) => {
  const userId = req.user.id;
  try {
    const { businessProfileId, reason } = req.body;
    // check is there any business is associated with that business Id
    const businessProfile = await prisma.businessProfile.findUnique({
      where: {
        id: businessProfileId,
      },
    });
    if (!businessProfile) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found.",
      });
    }
    // check is there any leave is already exists for this business profile
    const existingLeave = await prisma.StaffExistFromBusiness.findUnique({
      where: {
        businessProfileId: businessProfileId,
      },
    });
    if (existingLeave) {
      return res.status(400).json({
        success: false,
        msg: "You are not the member of this business.",
      });
    }
    const leave = await prisma.StaffExistFromBusiness.create({
      data: {
        userId: userId,
        businessProfileId: businessProfileId,
        reason: reason,
      },
    });
    return res.status(200).json({
      success: true,
      msg: "Now! You're not the member of this business.",
      leave,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not request for leave.",
    });
  }
};

const getStaffBookings = async (req, res) => {
  const staffId = req.user.id;
  const status = req.query.status; // completed, ongoing, upcoming

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
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Staff bookings fetched successfully.",
      count: bookings.length,
      bookings,
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

    // Calculate total earnings (only from paid/completed bookings)
    const totalEarnings = allBookings
      .filter(
        (b) =>
          b.paymentStatus === "PAID" &&
          (b.bookingStatus === "COMPLETED" || b.trackingStatus === "COMPLETED"),
      )
      .reduce((sum, b) => sum + (b.providerEarnings || 0), 0);

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
      },
      orderBy: [{ date: "asc" }, { slot: { time: "asc" } }],
      take: 5,
    });

    return res.status(200).json({
      success: true,
      msg: "Dashboard stats fetched successfully.",
      stats: {
        pendingBookings,
        inProgressBookings,
        completedBookings,
        totalEarnings,
        upcomingBookings,
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

    // 3. Validate status transition
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

    // Get staff basic info
    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        createdAt: true,
        isRestricted: true,
      },
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        msg: "Staff not found.",
      });
    }

    // Get all bookings for this staff under this provider's business
    const allBookings = await prisma.booking.findMany({
      where: {
        businessProfileId: staffAssignment.businessProfileId,
        StaffAssignBooking: {
          some: {
            assignedStaffId: staffId,
          },
        },
      },
      select: {
        id: true,
        bookingStatus: true,
        trackingStatus: true,
        staffPaymentStatus: true,
        totalAmount: true,
        staffEarnings: true,
        date: true,
        createdAt: true,
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

    // Get staff feedback (received by this staff)
    const staffFeedbacks = await prisma.feedback.findMany({
      where: {
        staffId: staffId,
        feedbackType: "STAFF",
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

    return res.status(200).json({
      success: true,
      msg: "Staff details fetched successfully.",
      staff: {
        ...staff,
        businessName: staffAssignment.businessProfile.businessName,
        joinedAt: staffAssignment.createdAt,
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
  const { name, email, mobile, profilePicture } = req.body;

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
        ...(profilePicture && { profilePicture }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        profilePicture: true,
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

module.exports = {
  getAllProviders,
  getStaffApplications,
  cancelStaffApplication,
  applyForStaffApplication,
  requestForExist,
  getStaffBookings,
  getDashboardStats,
  getStaffProfile,
  updateStaffProfile,
  updateBookingTrackingStatus,
  getAllBusinessStaffs,
  getStaffDetailsForProvider,
};
