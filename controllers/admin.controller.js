const prisma = require("../prismaClient");
const Joi = require("joi");
const { sendMail } = require("../utils/sendmail");

// Joi schema for restriction reason
const restrictReasonSchema = Joi.object({
  reason: Joi.string().trim().min(3).required().messages({
    "string.empty": "Restriction reason is required",
    "string.min": "Restriction reason must be at least 3 characters long",
    "any.required": "Restriction reason is required",
  }),
});
const {
  userRestrictionEmailTemplate,
  userRestrictionLiftedEmailTemplate,
  businessApprovalEmailTemplate,
  businessRejectionEmailTemplate,
  businessRestrictionEmailTemplate,
  businessRestrictionLiftedEmailTemplate,
  serviceRestrictionEmailTemplate,
  serviceRestrictionLiftedEmailTemplate,
} = require("../helper/mail-tamplates/adminEmailTemplates");

/* --------------- USER MANAGEMENT --------------- */

// Get all users with pagination (with backend filtering)
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, role } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build Where Clause
    const where = {};
    if (role && role !== "all") {
      where.role = role;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { mobile: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          mobile: true,
          role: true,
          isRestricted: true,
          restrictedAt: true,
          restrictedBy: true,
          restrictionReason: true,
          restrictionLiftedAt: true,
          createdAt: true,
          addresses: true,
          businessProfile: {
            select: {
              id: true,
              businessName: true,
              isApproved: true,
              isRestricted: true,
              category: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        role: true,
        isRestricted: true,
        restrictedAt: true,
        restrictedBy: true,
        restrictionReason: true,
        restrictionLiftedAt: true,
        createdAt: true,
        addresses: true,
        businessProfile: {
          include: {
            category: true,
          },
        },
        bookings: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Restrict/Block user
const restrictUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { error } = restrictReasonSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }

    const { reason } = req.body;
    const adminId = req.user.id;

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.role === "admin") {
      return res
        .status(400)
        .json({ success: false, message: "Cannot restrict admin user" });
    }

    if (user.isRestricted) {
      return res
        .status(400)
        .json({ success: false, message: "User is already restricted" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isRestricted: true,
        restrictedAt: new Date(),
        restrictedBy: adminId,
        restrictionReason: reason,
      },
      select: {
        id: true,
        name: true,
        email: true,
        isRestricted: true,
        restrictionReason: true,
      },
    });

    // Send notification email
    await sendMail({
      email: user.email,
      subject: "Your Account Has Been Restricted - HSM",
      template: userRestrictionEmailTemplate({
        userName: user.name,
        reason: reason,
      }),
    });

    res.status(200).json({
      success: true,
      message: "User restricted successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error restricting user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Lift restriction from user
const liftUserRestriction = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!user.isRestricted) {
      return res
        .status(400)
        .json({ success: false, message: "User is not restricted" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isRestricted: false,
        restrictionLiftedAt: new Date(),
        restrictionReason: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        isRestricted: true,
      },
    });

    // Send notification email
    await sendMail({
      email: user.email,
      subject: "Your Account Restriction Has Been Lifted - HSM",
      template: userRestrictionLiftedEmailTemplate({
        userName: user.name,
      }),
    });

    res.status(200).json({
      success: true,
      message: "User restriction lifted successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error lifting user restriction:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* --------------- BUSINESS MANAGEMENT --------------- */

// Get all businesses with pagination (with backend filtering)
const getAllBusinesses = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, category } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {};

    // Status Filter
    if (status === "pending") {
      where.isApproved = false;
      where.isRejected = false;
    } else if (status === "approved") {
      where.isApproved = true;
    } else if (status === "rejected") {
      where.isRejected = true;
    }

    // Category Filter (by name)
    if (category && category !== "all") {
      where.category = {
        name: category,
      };
    }

    // Search Filter
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { contactEmail: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [businesses, total] = await Promise.all([
      prisma.businessProfile.findMany({
        where,
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              mobile: true,
              isRestricted: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              services: true,
              Booking: true,
            },
          },
        },
      }),
      prisma.businessProfile.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: businesses,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching businesses:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get business by ID
const getBusinessById = async (req, res) => {
  try {
    const { businessId } = req.params;

    const business = await prisma.businessProfile.findUnique({
      where: { id: businessId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true,
            createdAt: true,
          },
        },
        category: true,
        services: {
          include: {
            category: true,
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            services: true,
            Booking: true,
            slots: true,
          },
        },
      },
    });

    if (!business) {
      return res
        .status(404)
        .json({ success: false, message: "Business not found" });
    }

    res.status(200).json({ success: true, data: business });
  } catch (error) {
    console.error("Error fetching business:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Approve business
const approveBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;
    const adminId = req.user.id;

    const business = await prisma.businessProfile.findUnique({
      where: { id: businessId },
      include: { user: true },
    });

    if (!business) {
      return res
        .status(404)
        .json({ success: false, message: "Business not found" });
    }

    if (business.isApproved) {
      return res
        .status(400)
        .json({ success: false, message: "Business is already approved" });
    }

    const updatedBusiness = await prisma.businessProfile.update({
      where: { id: businessId },
      data: {
        isApproved: true,
        isRejected: false, // Ensure rejected flag is cleared
        approvedAt: new Date(),
        rejectedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Send approval email
    await sendMail({
      email: business.user.email,
      subject: "Your Business Has Been Approved - HSM",
      template: businessApprovalEmailTemplate({
        providerName: business.user.name,
        businessName: business.businessName,
      }),
    });

    res.status(200).json({
      success: true,
      message: "Business approved successfully",
      data: updatedBusiness,
    });
  } catch (error) {
    console.error("Error approving business:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Reject business
const rejectBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;
    const { error } = restrictReasonSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }

    const { reason } = req.body;
    const adminId = req.user.id;

    const business = await prisma.businessProfile.findUnique({
      where: { id: businessId },
      include: { user: true },
    });

    if (!business) {
      return res
        .status(404)
        .json({ success: false, message: "Business not found" });
    }

    const updatedBusiness = await prisma.businessProfile.update({
      where: { id: businessId },
      data: {
        isApproved: false,
        isRejected: true,
        rejectedAt: new Date(),
        rejectionReason: reason,
        approvedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Send rejection email
    await sendMail({
      email: business.user.email,
      subject: "Your Business Has Been Rejected - HSM",
      template: businessRejectionEmailTemplate({
        providerName: business.user.name,
        businessName: business.businessName,
        reason: reason,
      }),
    });

    res.status(200).json({
      success: true,
      message: "Business rejected successfully",
      data: updatedBusiness,
    });
  } catch (error) {
    console.error("Error rejecting business:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Restrict business
const restrictBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;
    const { error } = restrictReasonSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }

    const { reason } = req.body;
    const adminId = req.user.id;

    const business = await prisma.businessProfile.findUnique({
      where: { id: businessId },
      include: { user: true },
    });

    if (!business) {
      return res
        .status(404)
        .json({ success: false, message: "Business not found" });
    }

    if (business.isRestricted) {
      return res
        .status(400)
        .json({ success: false, message: "Business is already restricted" });
    }

    const updatedBusiness = await prisma.businessProfile.update({
      where: { id: businessId },
      data: {
        isRestricted: true,
        restrictedAt: new Date(),
        restrictedBy: adminId,
        restrictionReason: reason,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Send notification email
    await sendMail({
      email: business.user.email,
      subject: "Your Business Has Been Restricted - HSM",
      template: businessRestrictionEmailTemplate({
        providerName: business.user.name,
        businessName: business.businessName,
        reason: reason,
      }),
    });

    res.status(200).json({
      success: true,
      message: "Business restricted successfully",
      data: updatedBusiness,
    });
  } catch (error) {
    console.error("Error restricting business:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Lift business restriction
const liftBusinessRestriction = async (req, res) => {
  try {
    const { businessId } = req.params;

    const business = await prisma.businessProfile.findUnique({
      where: { id: businessId },
      include: { user: true },
    });

    if (!business) {
      return res
        .status(404)
        .json({ success: false, message: "Business not found" });
    }

    if (!business.isRestricted) {
      return res
        .status(400)
        .json({ success: false, message: "Business is not restricted" });
    }

    const updatedBusiness = await prisma.businessProfile.update({
      where: { id: businessId },
      data: {
        isRestricted: false,
        restrictionLiftedAt: new Date(),
        restrictionReason: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Send notification email
    await sendMail({
      email: business.user.email,
      subject: "Your Business Restriction Has Been Lifted - HSM",
      template: businessRestrictionLiftedEmailTemplate({
        providerName: business.user.name,
        businessName: business.businessName,
      }),
    });

    res.status(200).json({
      success: true,
      message: "Business restriction lifted successfully",
      data: updatedBusiness,
    });
  } catch (error) {
    console.error("Error lifting business restriction:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* --------------- SERVICE MANAGEMENT --------------- */

// Get all services with pagination (with backend filtering)
const getAllServices = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, category } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {};

    // Category Filter (by name)
    if (category && category !== "all") {
      where.category = {
        name: category,
      };
    }

    // Search Filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        {
          businessProfile: {
            businessName: { contains: search, mode: "insensitive" },
          },
        },
        {
          businessProfile: {
            user: { name: { contains: search, mode: "insensitive" } },
          },
        },
      ];
    }

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where,
        skip,
        take,
        include: {
          businessProfile: {
            select: {
              id: true,
              businessName: true,
              isApproved: true,
              isRestricted: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              bookings: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.service.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: services,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching services:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get service by ID
const getServiceById = async (req, res) => {
  try {
    const { serviceId } = req.params;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        businessProfile: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                mobile: true,
              },
            },
          },
        },
        category: true,
        feedback: true,
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    if (!service) {
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });
    }

    res.status(200).json({ success: true, data: service });
  } catch (error) {
    console.error("Error fetching service:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Restrict service
const restrictService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { error } = restrictReasonSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }

    const { reason } = req.body;
    const adminId = req.user.id;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        businessProfile: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!service) {
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });
    }

    if (service.isRestricted) {
      return res
        .status(400)
        .json({ success: false, message: "Service is already restricted" });
    }

    const updatedService = await prisma.service.update({
      where: { id: serviceId },
      data: {
        isRestricted: true,
        restrictedAt: new Date(),
        restrictedBy: adminId,
        restrictionReason: reason,
      },
      include: {
        businessProfile: {
          select: {
            id: true,
            businessName: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Send notification email
    await sendMail({
      email: service.businessProfile.user.email,
      subject: "Your Service Has Been Restricted - HSM",
      template: serviceRestrictionEmailTemplate({
        providerName: service.businessProfile.user.name,
        businessName: service.businessProfile.businessName,
        serviceName: service.name,
        reason: reason,
      }),
    });

    res.status(200).json({
      success: true,
      message: "Service restricted successfully",
      data: updatedService,
    });
  } catch (error) {
    console.error("Error restricting service:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Lift service restriction
const liftServiceRestriction = async (req, res) => {
  try {
    const { serviceId } = req.params;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        businessProfile: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!service) {
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });
    }

    if (!service.isRestricted) {
      return res
        .status(400)
        .json({ success: false, message: "Service is not restricted" });
    }

    const updatedService = await prisma.service.update({
      where: { id: serviceId },
      data: {
        isRestricted: false,
        restrictionLiftedAt: new Date(),
        restrictionReason: null,
      },
      include: {
        businessProfile: {
          select: {
            id: true,
            businessName: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Send notification email
    await sendMail({
      email: service.businessProfile.user.email,
      subject: "Your Service Restriction Has Been Lifted - HSM",
      template: serviceRestrictionLiftedEmailTemplate({
        providerName: service.businessProfile.user.name,
        businessName: service.businessProfile.businessName,
        serviceName: service.name,
      }),
    });

    res.status(200).json({
      success: true,
      message: "Service restriction lifted successfully",
      data: updatedService,
    });
  } catch (error) {
    console.error("Error lifting service restriction:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* --------------- ADMIN DASHBOARD STATS --------------- */

const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalCustomers,
      totalProviders,
      restrictedUsers,
      totalBusinesses,
      pendingBusinesses,
      approvedBusinesses,
      restrictedBusinesses,
      totalServices,
      restrictedServices,
      totalBookings,
    ] = await Promise.all([
      prisma.user.count({ where: { role: { not: "admin" } } }),
      prisma.user.count({ where: { role: "customer" } }),
      prisma.user.count({ where: { role: "provider" } }),
      prisma.user.count({ where: { isRestricted: true } }),
      prisma.businessProfile.count(),
      prisma.businessProfile.count({ where: { isApproved: false } }),
      prisma.businessProfile.count({ where: { isApproved: true } }),
      prisma.businessProfile.count({ where: { isRestricted: true } }),
      prisma.service.count(),
      prisma.service.count({ where: { isRestricted: true } }),
      prisma.booking.count(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          customers: totalCustomers,
          providers: totalProviders,
          restricted: restrictedUsers,
        },
        businesses: {
          total: totalBusinesses,
          pending: pendingBusinesses,
          approved: approvedBusinesses,
          restricted: restrictedBusinesses,
        },
        services: {
          total: totalServices,
          restricted: restrictedServices,
        },
        bookings: {
          total: totalBookings,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get dashboard analytics for graphs
const getDashboardAnalytics = async (req, res) => {
  try {
    // 1. Fetch data for processing
    const [bookings, subscriptions, topBusinesses, topServices] =
      await Promise.all([
        prisma.booking.findMany({
          select: { createdAt: true, totalAmount: true },
          orderBy: { createdAt: "asc" },
        }),
        prisma.providerSubscription.findMany({
          select: {
            createdAt: true,
            plan: { select: { price: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
        prisma.businessProfile.findMany({
          take: 5,
          select: {
            id: true,
            businessName: true,
            _count: {
              select: { Booking: true },
            },
          },
          orderBy: {
            Booking: {
              _count: "desc",
            },
          },
        }),
        prisma.service.findMany({
          take: 5,
          select: {
            id: true,
            name: true,
            _count: {
              select: { bookings: true },
            },
          },
          orderBy: {
            bookings: {
              _count: "desc",
            },
          },
        }),
      ]);

    // 2. Process Bookings (Daily & Monthly)
    const bookingsByDay = {};
    const bookingsByMonth = {};

    bookings.forEach((booking) => {
      const date = booking.createdAt.toISOString().split("T")[0]; // YYYY-MM-DD
      const month = date.slice(0, 7); // YYYY-MM

      // Daily
      if (!bookingsByDay[date]) bookingsByDay[date] = 0;
      bookingsByDay[date]++;

      // Monthly
      if (!bookingsByMonth[month]) bookingsByMonth[month] = 0;
      bookingsByMonth[month]++;
    });

    // 3. Process Subscriptions (Payments/Revenue by Month)
    const revenueByMonth = {};

    subscriptions.forEach((sub) => {
      const month = sub.createdAt.toISOString().slice(0, 7); // YYYY-MM
      if (!revenueByMonth[month]) revenueByMonth[month] = 0;
      revenueByMonth[month] += sub.plan.price;
    });

    // Format for Frontend
    const formatData = (obj) =>
      Object.entries(obj).map(([key, value]) => ({ name: key, value }));

    res.status(200).json({
      success: true,
      data: {
        bookings: {
          daily: formatData(bookingsByDay),
          monthly: formatData(bookingsByMonth),
        },
        revenue: {
          monthly: formatData(revenueByMonth),
        },
        rankings: {
          businesses: topBusinesses.map((b) => ({
            name: b.businessName,
            bookings: b._count.Booking,
          })),
          services: topServices.map((s) => ({
            name: s.name,
            bookings: s._count.bookings,
          })),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard analytics:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  // User Management
  getAllUsers,
  getUserById,
  restrictUser,
  liftUserRestriction,

  // Business Management
  getAllBusinesses,
  getBusinessById,
  approveBusiness,
  rejectBusiness,
  restrictBusiness,
  liftBusinessRestriction,

  // Service Management
  getAllServices,
  getServiceById,
  restrictService,
  liftServiceRestriction,

  // Dashboard
  getDashboardStats,
  getDashboardAnalytics,
};
