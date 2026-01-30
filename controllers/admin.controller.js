const prisma = require("../prismaClient");
const Joi = require("joi");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const { sendMail } = require("../utils/sendmail");
const bcrypt = require("bcrypt");
const { logProviderAdminActivity, LogStatus } = require("../utils/logger");
const { storeNotification } = require("./notification.controller");

// Helper to verify admin password
const verifyAdminPassword = async (adminId, password) => {
  if (!password) return false;
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || !admin.password) return false;
  const isValid = await bcrypt.compare(password, admin.password);
  return isValid;
};

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
  providerSubscriptionCancelledEmailTemplate,
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
      subject: "Your Account Has Been Restricted - HomHelpers",
      template: userRestrictionEmailTemplate({
        userName: user.name,
        reason: reason,
      }),
    });

    await logProviderAdminActivity({
      actorId: adminId,
      actorType: "admin",
      actionType: "USER_RESTRICTED",
      status: LogStatus.SUCCESS,
      metadata: {
        targetUserId: userId,
        targetUserName: user.name,
        targetUserEmail: user.email,
        reason: reason,
      },
      req,
      targetId: userId,
      targetType: "user",
      description: `Restricted user ${user.name} (${user.email})`,
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
    const adminId = req.user.id; // Get admin ID for logging

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
        restrictedAt: null,
        restrictedBy: null,
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
      subject: "Your Account Restriction Has Been Lifted - HomHelpers",
      template: userRestrictionLiftedEmailTemplate({ userName: user.name }),
    });

    await logProviderAdminActivity({
      actorId: adminId,
      actorType: "admin",
      actionType: "USER_UNRESTRICTED",
      status: LogStatus.SUCCESS,
      metadata: {
        targetUserId: userId,
        targetUserName: user.name,
        targetUserEmail: user.email,
      },
      req,
      targetId: userId,
      targetType: "user",
      description: `Unrestricted user ${user.name} (${user.email})`,
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
      subject: "Your Business Has Been Approved - HomHelpers",
      template: businessApprovalEmailTemplate({
        providerName: business.user.name,
        businessName: business.businessName,
      }),
    });

    await logProviderAdminActivity({
      actorId: adminId,
      actorType: "admin",
      actionType: "BUSINESS_APPROVED",
      status: LogStatus.SUCCESS,
      metadata: {
        businessId: businessId,
        businessName: business.businessName,
        providerId: business.user.id,
        providerName: business.user.name,
      },
      req,
      targetId: businessId,
      targetType: "business",
      description: `Approved business ${business.businessName} for provider ${business.user.name}`,
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
      subject: "Your Business Has Been Rejected - HomHelpers",
      template: businessRejectionEmailTemplate({
        providerName: business.user.name,
        businessName: business.businessName,
        reason: reason,
      }),
    });

    await logProviderAdminActivity({
      actorId: adminId,
      actorType: "admin",
      actionType: "BUSINESS_REJECTED",
      status: LogStatus.SUCCESS,
      metadata: {
        businessId: businessId,
        businessName: business.businessName,
        providerId: business.user.id,
        providerName: business.user.name,
        reason: reason,
      },
      req,
      targetId: businessId,
      targetType: "business",
      description: `Rejected business ${business.businessName} for provider ${business.user.name}`,
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
      subject: "Your Business Has Been Restricted - HomHelpers",
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
        restrictionRequestMessage: null,
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
      subject: "Your Business Restriction Has Been Lifted - HomHelpers",
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

    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: adminId,
        actorType: req.user.role,
        actionType: "SERVICE_RESTRICTED",
        status: "SUCCESS",
        metadata: {
          serviceId: serviceId,
          serviceName: service.name,
          businessId: service.businessProfile.id,
          businessName: service.businessProfile.businessName,
          providerId: service.businessProfile.user.id,
          providerName: service.businessProfile.user.name,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    // Send notification email
    await sendMail({
      email: service.businessProfile.user.email,
      subject: "Your Service Has Been Restricted - HomHelpers",
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
        restrictionRequestMessage: null,
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

    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: adminId,
        actorType: req.user.role,
        actionType: "SERVICE_RESTRICTION_LIFTED",
        status: "SUCCESS",
        metadata: {
          serviceId: serviceId,
          serviceName: service.name,
          businessId: service.businessProfile.id,
          businessName: service.businessProfile.businessName,
          providerId: service.businessProfile.user.id,
          providerName: service.businessProfile.user.name,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    // Send notification email
    await sendMail({
      email: service.businessProfile.user.email,
      subject: "Your Service Restriction Has Been Lifted - HomHelpers",
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
          select: {
            createdAt: true,
            totalAmount: true,
            bookingStatus: true,
          },
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
    const bookingsByDay = {}; // Total Count
    const bookingsByMonth = {}; // Total Count
    const cancelledBookingsByMonth = {}; // Cancelled Count
    const activeBookingsByMonth = {}; // Active Count

    const gmvByMonth = {}; // Active Value
    const lostGmvByMonth = {}; // Lost Value

    bookings.forEach((booking) => {
      const date = booking.createdAt.toISOString().split("T")[0]; // YYYY-MM-DD
      const month = date.slice(0, 7); // YYYY-MM
      const status = booking.bookingStatus.toLowerCase();
      const amount = booking.totalAmount || 0;
      const isCancelled =
        status === "cancelled" || status === "cancel_requested";

      // Daily
      if (!bookingsByDay[date]) bookingsByDay[date] = 0;
      bookingsByDay[date]++;

      // Monthly Counts
      if (!bookingsByMonth[month]) bookingsByMonth[month] = 0;
      bookingsByMonth[month]++;

      if (!cancelledBookingsByMonth[month]) cancelledBookingsByMonth[month] = 0;
      if (!activeBookingsByMonth[month]) activeBookingsByMonth[month] = 0;

      if (isCancelled) {
        cancelledBookingsByMonth[month]++;
      } else {
        activeBookingsByMonth[month]++;
      }

      // Monthly GMV
      if (!gmvByMonth[month]) gmvByMonth[month] = 0;
      if (!lostGmvByMonth[month]) lostGmvByMonth[month] = 0;

      if (isCancelled) {
        lostGmvByMonth[month] += amount;
      } else {
        gmvByMonth[month] += amount;
      }
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
          activeMonthly: formatData(activeBookingsByMonth),
          cancelledMonthly: formatData(cancelledBookingsByMonth),
        },
        gmv: {
          realized: formatData(gmvByMonth),
          lost: formatData(lostGmvByMonth),
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

/* --------------- ACTIVITY LOGS --------------- */

// Get user activity logs (both customer and provider/admin logs)
const getUserActivityLogs = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, actionType, status } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // First, get the user to determine their role
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, name: true, email: true },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    let logs = [];
    let total = 0;

    // Build where clause for filtering
    const buildWhereClause = () => {
      const where = {};
      if (actionType && actionType !== "all") {
        where.actionType = actionType;
      }
      if (status && status !== "all") {
        where.status = status;
      }
      return where;
    };

    // Fetch logs based on user role
    if (user.role === "customer") {
      // Fetch customer activity logs
      const where = { customerId: userId, ...buildWhereClause() };

      [logs, total] = await Promise.all([
        prisma.customerActivityLog.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            actionType: true,
            status: true,
            metadata: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
          },
        }),
        prisma.customerActivityLog.count({ where }),
      ]);
    } else {
      // Fetch provider/admin activity logs
      const where = { actorId: userId, ...buildWhereClause() };

      [logs, total] = await Promise.all([
        prisma.providerAdminActivityLog.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            actorType: true,
            actionType: true,
            status: true,
            metadata: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
          },
        }),
        prisma.providerAdminActivityLog.count({ where }),
      ]);
    }

    // Format logs for frontend
    const formattedLogs = logs.map((log) => ({
      id: log.id,
      actionType: log.actionType,
      actorType: log.actorType || user.role,
      status: log.status,
      metadata: log.metadata || {},
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
      // Add human-readable descriptions
      description: getActivityDescription(log, user),
    }));

    res.status(200).json({
      success: true,
      data: {
        logs: formattedLogs,
        total: total, // Add total here for easy frontend access
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching user activity logs:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Helper function to generate human-readable descriptions
const getActivityDescription = (log, user) => {
  const { actionType, status, metadata } = log;

  // Common action descriptions
  const descriptions = {
    REGISTER: `Registered as ${user.role}`,
    LOGIN:
      status === "SUCCESS" ? "Logged in successfully" : "Failed login attempt",
    LOGOUT: "Logged out",
    LOGOUT_ALL: "Logged out from all devices",
    PASSWORD_RESET_REQUEST: "Requested password reset",
    PASSWORD_RESET: "Password reset completed",
    BOOKING_CANCELLED: `Cancelled booking${
      metadata?.serviceName ? ` for ${metadata.serviceName}` : ""
    }`,
    FEEDBACK_SUBMITTED: `Submitted ${metadata?.rating || ""}★ rating${
      metadata?.serviceName ? ` for ${metadata.serviceName}` : ""
    }`,
    SERVICE_CREATED: `Created service${
      metadata?.serviceName ? `: ${metadata.serviceName}` : ""
    }`,
    SERVICE_UPDATED: `Updated service${
      metadata?.serviceName ? `: ${metadata.serviceName}` : ""
    }`,
    SERVICE_DELETED: `Deleted service`,
    BUSINESS_CREATED: `Created business profile`,
    BUSINESS_UPDATED: `Updated business profile`,
    SLOT_GENERATED: `Generated time slots`,
    BOOKING_UPDATED: `Updated booking status${
      metadata?.bookingStatus ? ` to ${metadata.bookingStatus}` : ""
    }`,
    USER_RESTRICTED: `Restricted user${
      metadata?.targetUserName ? ` ${metadata.targetUserName}` : ""
    }`,
    USER_UNRESTRICTED: `Unrestricted user${
      metadata?.targetUserName ? ` ${metadata.targetUserName}` : ""
    }`,
    BUSINESS_APPROVED: `Approved business${
      metadata?.businessName ? ` ${metadata.businessName}` : ""
    }`,
    BUSINESS_REJECTED: `Rejected business${
      metadata?.businessName ? ` ${metadata.businessName}` : ""
    }`,
  };

  return (
    descriptions[actionType] || actionType.replace(/_/g, " ").toLowerCase()
  );
};

/* --------------- PLAN MANAGEMENT --------------- */

// Helper schema for plan
// Helper schema for plan
const planSchema = Joi.object({
  name: Joi.string().required(),
  price: Joi.number().min(0).required(),
  interval: Joi.string().valid("month", "year").required(),
  trialPeriodDays: Joi.number().min(0).optional(),
  active: Joi.boolean().optional(),
  password: Joi.string().required(),
  maxServices: Joi.number().integer().min(-1).default(5),
  maxBookings: Joi.number().integer().min(-1).default(100),
  commissionRate: Joi.number().min(0).max(100).default(10.0),
  benefits: Joi.array().items(Joi.string()).default([]),
  features: Joi.object().optional().default({}),
});

const updatePlanSchema = Joi.object({
  name: Joi.string().optional(),
  price: Joi.number().min(0).optional(),
  trialPeriodDays: Joi.number().min(0).optional(),
  isActive: Joi.boolean().optional(),
  password: Joi.string().required(),
  maxServices: Joi.number().integer().min(-1).optional(),
  maxBookings: Joi.number().integer().min(-1).optional(),
  commissionRate: Joi.number().min(0).max(100).optional(),
  benefits: Joi.array().items(Joi.string()).optional(),
  features: Joi.object().optional(),
});

// Create Plan
const createSubscriptionPlan = async (req, res) => {
  try {
    const { error } = planSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }

    const {
      name,
      price,
      interval,
      trialPeriodDays = 0,
      active = true,
      password,
      maxServices = 5,
      maxBookings = 100,
      commissionRate = 10.0,
      benefits = [],
      features = {},
    } = req.body;
    const adminId = req.user.id;

    // Verify Password
    const isPasswordValid = await verifyAdminPassword(adminId, password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid password. Action denied.",
      });
    }

    // 1. Create Product in Stripe
    const product = await stripe.products.create({
      name: name,
      active: active,
    });

    // 2. Create Price in Stripe
    const stripePrice = await stripe.prices.create({
      product: product.id,
      unit_amount: price * 100, // Convert to smallest currency unit (paise)
      currency: "inr",
      recurring: { interval: interval },
    });

    // 3. Create Plan in DB
    const plan = await prisma.providerSubscriptionPlan.create({
      data: {
        name,
        price,
        interval,
        stripePriceId: stripePrice.id,
        trialPeriodDays,
        isActive: active,
        maxServices,
        maxBookings,
        commissionRate,
        benefits,
        features,
      },
    });

    await logProviderAdminActivity({
      actorId: adminId,
      actorType: "admin",
      actionType: "PLAN_CREATED",
      status: LogStatus.SUCCESS,
      metadata: {
        planName: name,
        price,
        interval,
        trialPeriodDays,
        commissionRate,
        stripePriceId: stripePrice.id,
      },
      req,
      targetId: plan.id,
      targetType: "plan",
      description: `Created subscription plan: ${name}`,
    });

    return res.status(201).json({
      success: true,
      message: "Subscription plan created successfully",
      data: plan,
    });
  } catch (error) {
    console.error("Error creating plan:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get All Plans
const getAllSubscriptionPlans = async (req, res) => {
  try {
    const plans = await prisma.providerSubscriptionPlan.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: plans,
    });
  } catch (error) {
    console.error("Error fetching plans:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update Plan
const updateSubscriptionPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { error } = updatePlanSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }

    const {
      name,
      price,
      isActive,
      trialPeriodDays,
      password,
      maxServices,
      maxBookings,
      commissionRate,
      benefits,
      features,
    } = req.body;
    const adminId = req.user.id;

    // Verify Password
    const isPasswordValid = await verifyAdminPassword(adminId, password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid password. Action denied.",
      });
    }

    const existingPlan = await prisma.providerSubscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!existingPlan) {
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });
    }

    // Retrieve Stripe Price to get Product ID
    const existingStripePrice = await stripe.prices.retrieve(
      existingPlan.stripePriceId,
    );
    const productId = existingStripePrice.product;

    let newStripePriceId = existingPlan.stripePriceId;

    // 1. Update Product Name if changed
    if (name && name !== existingPlan.name) {
      await stripe.products.update(productId, { name });
    }

    // 2. Handle Price Change (Create New Price)
    if (price && price !== existingPlan.price) {
      const newPrice = await stripe.prices.create({
        product: productId,
        unit_amount: price * 100,
        currency: "inr",
        recurring: { interval: existingPlan.interval },
      });
      newStripePriceId = newPrice.id;

      // Note: We don't archive the old price immediately as users might be on it.
    }

    // 3. Update Stripe Product Active Status
    if (typeof isActive === "boolean") {
      await stripe.products.update(productId, { active: isActive });
    }

    // 4. Update DB
    const updatedPlan = await prisma.providerSubscriptionPlan.update({
      where: { id: planId },
      data: {
        name,
        price,
        isActive,
        trialPeriodDays,
        stripePriceId: newStripePriceId,
        maxServices,
        maxBookings,
        commissionRate,
        benefits,
        features,
      },
    });

    await logProviderAdminActivity({
      actorId: adminId,
      actorType: "admin",
      actionType: "PLAN_UPDATED",
      status: LogStatus.SUCCESS,
      metadata: {
        planId,
        updates: req.body,
        newStripePriceId,
      },
      req,
      targetId: planId,
      targetType: "plan",
      description: `Updated plan ${existingPlan.name}`,
    });

    return res.status(200).json({
      success: true,
      message: "Plan updated successfully",
      data: updatedPlan,
    });
  } catch (error) {
    console.error("Error updating plan:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* --------------- SUBSCRIPTION MANAGEMENT --------------- */

const getAllSubscriptions = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {};
    if (status && status !== "all")
      where.status = { equals: status, mode: "insensitive" };
    if (search) {
      where.OR = [
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { stripeSubscriptionId: { contains: search, mode: "insensitive" } },
      ];
    }

    const [subscriptions, total] = await Promise.all([
      prisma.providerSubscription.findMany({
        where,
        skip,
        take,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          plan: {
            select: { id: true, name: true, price: true, currency: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.providerSubscription.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: subscriptions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const cancelUserSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { password, reason } = req.body;
    const adminId = req.user.id;

    // Verify Password
    const isPasswordValid = await verifyAdminPassword(adminId, password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid password. Action denied.",
      });
    }

    const sub = await prisma.providerSubscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!sub) {
      return res
        .status(404)
        .json({ success: false, message: "Subscription not found" });
    }

    // Cancel in Stripe (skip if free plan or fake ID)
    if (
      sub.stripeSubscriptionId &&
      !sub.stripeSubscriptionId.startsWith("free_plan_") &&
      !sub.stripeSubscriptionId.startsWith("sub_fake")
    ) {
      try {
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
      } catch (err) {
        console.warn(
          "Stripe cancel failed (might be already canceled):",
          err.message,
        );
      }
    }

    // Update DB
    const updatedSub = await prisma.providerSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: "canceled",
        // question: "Canceled by Admin", // Using metadata/logs instead
        cancelAtPeriodEnd: false,
        isActive: false,
      },
      include: {
        user: true,
        plan: true,
      },
    });

    // Send Email & Notification
    try {
      if (updatedSub.user && updatedSub.user.email) {
        await sendMail({
          email: updatedSub.user.email,
          subject: "Subscription Cancelled by Admin",
          template: providerSubscriptionCancelledEmailTemplate({
            userName: updatedSub.user.name,
            planName: updatedSub.plan ? updatedSub.plan.name : "Plan",
            reason: reason || "Administrative decision",
          }),
        });
      }

      await storeNotification(
        "Subscription Cancelled",
        `Your subscription has been cancelled by the admin. Reason: ${
          reason || "Administrative decision"
        }`,
        updatedSub.userId,
      );
    } catch (notifyErr) {
      console.error("Error sending cancellation notification:", notifyErr);
    }

    await logProviderAdminActivity({
      actorId: adminId,
      actorType: "admin",
      actionType: "SUBSCRIPTION_CANCELED",
      status: LogStatus.SUCCESS,
      metadata: {
        subscriptionId,
        stripeSubscriptionId: sub.stripeSubscriptionId,
        reason: reason,
      },
      req,
      targetId: subscriptionId,
      targetType: "subscription",
      description: `Canceled subscription for user. Reason: ${reason}`,
    });

    res.status(200).json({
      success: true,
      message: "Subscription canceled successfully",
      data: updatedSub,
    });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const deleteSubscriptionPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { password, migrateToPlanId } = req.body;
    const adminId = req.user.id;

    // Verify Password
    const isPasswordValid = await verifyAdminPassword(adminId, password);
    if (!isPasswordValid)
      return res
        .status(401)
        .json({ success: false, message: "Invalid password. Action denied." });

    const allSubCount = await prisma.providerSubscription.count({
      where: { planId },
    });

    if (allSubCount > 0) {
      if (!migrateToPlanId) {
        return res.status(409).json({
          success: false,
          message: "Plan has subscribers",
          data: { count: allSubCount },
        });
      }

      if (planId === migrateToPlanId) {
        return res
          .status(400)
          .json({ success: false, message: "Cannot migrate to same plan" });
      }

      const targetPlan = await prisma.providerSubscriptionPlan.findUnique({
        where: { id: migrateToPlanId },
      });
      if (!targetPlan)
        return res
          .status(400)
          .json({ success: false, message: "Migration plan not found" });

      // Migrate
      await prisma.providerSubscription.updateMany({
        where: { planId },
        data: { planId: migrateToPlanId },
      });
    }

    // Delete
    await prisma.providerSubscriptionPlan.delete({ where: { id: planId } });

    await logProviderAdminActivity({
      actorId: adminId,
      actorType: "admin",
      actionType: "PLAN_DELETED",
      status: LogStatus.SUCCESS,
      metadata: { planId, migratedSubs: allSubCount, migrateToPlanId },
      req,
      targetId: planId,
      targetType: "plan",
      description: `Deleted plan. Migrated ${allSubCount} users.`,
    });

    res
      .status(200)
      .json({ success: true, message: "Plan deleted successfully" });
  } catch (error) {
    console.error("Error deleting plan:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get Revenue Stats
const getRevenueStats = async (req, res) => {
  try {
    // 1. Calculate Total Commission from Booking Platform Fees
    const bookingRevenue = await prisma.booking.aggregate({
      _sum: {
        platformFee: true,
      },
      where: {
        bookingStatus: { in: ["CONFIRMED", "COMPLETED"] },
        paymentStatus: "PAID",
      },
    });

    // 2. Calculate Total Provider Earnings (for reference)
    const providerEarnings = await prisma.booking.aggregate({
      _sum: {
        providerEarnings: true,
      },
      where: {
        bookingStatus: { in: ["CONFIRMED", "COMPLETED"] },
        paymentStatus: "PAID",
      },
    });

    // 3. Calculate Subscription Revenue (Estimate based on active subscriptions * Plan Price)
    // In a real-world scenario, you would query a Payment/Invoice table.
    // Here we will sum the price of all active subscriptions (recurring monthly value)
    const activeSubscriptions = await prisma.providerSubscription.findMany({
      where: {
        isActive: true,
        status: { in: ["active", "trialing"] },
      },
      include: {
        plan: true,
      },
    });

    const subscriptionMRR = activeSubscriptions.reduce((acc, sub) => {
      // Only count paid plans not in trial (or count trial as potential) - counting only active paid for revenue
      if (sub.status === "active" && sub.plan.price > 0) {
        return acc + sub.plan.price;
      }
      return acc;
    }, 0);

    // 4. Revenue Breakdown (Last 6 Months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1); // Start of month

    // Fetch relevant bookings
    const recentBookings = await prisma.booking.findMany({
      where: {
        bookingStatus: { in: ["CONFIRMED", "COMPLETED"] },
        paymentStatus: "PAID",
        createdAt: { gte: sixMonthsAgo },
      },
      select: {
        createdAt: true,
        platformFee: true,
      },
    });

    // Fetch all subscriptions for historical estimation
    const allSubscriptions = await prisma.providerSubscription.findMany({
      include: { plan: true },
    });

    const months = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const monthName = d.toLocaleString("default", { month: "short" });
      const monthYear = d.getFullYear(); // For comparison
      const monthIndex = d.getMonth();

      months.push({ name: monthName, monthIndex, year: monthYear });
    }

    const revenueBreakdown = months.map((m) => {
      // Platform Fees for Month m
      const monthlyContextBookings = recentBookings.filter((b) => {
        const d = new Date(b.createdAt);
        return d.getMonth() === m.monthIndex && d.getFullYear() === m.year;
      });
      const platformFees = monthlyContextBookings.reduce(
        (sum, b) => sum + (b.platformFee || 0),
        0,
      );

      // Subscription Revenue for Month m (Estimate)
      const monthlySubs = allSubscriptions.filter((s) => {
        const created = new Date(s.createdAt || s.currentPeriodStart);

        const createdDate = new Date(created);
        const endOfMonth = new Date(m.year, m.monthIndex + 1, 0);

        if (createdDate > endOfMonth) return false;
        if (s.status === "cancelled") return false;

        return s.plan.price > 0;
      });

      const subscriptionRevenue = monthlySubs.reduce(
        (sum, s) => sum + s.plan.price,
        0,
      );

      return {
        month: m.name,
        platformFees,
        subscriptionRevenue,
      };
    });

    // 5. Total Bookings Count
    const totalBookings = await prisma.booking.count({
      where: { bookingStatus: { in: ["CONFIRMED", "COMPLETED"] } },
    });

    return res.status(200).json({
      success: true,
      data: {
        totalCommission: bookingRevenue._sum.platformFee || 0,
        totalProviderEarnings: providerEarnings._sum.providerEarnings || 0,
        monthlyRecurringRevenue: subscriptionMRR,
        totalBookings,
        activeSubscriptions: activeSubscriptions.length,
        revenueBreakdown, // Added
      },
    });
  } catch (error) {
    console.error("Error fetching revenue stats:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  restrictUser,
  liftUserRestriction,
  getAllBusinesses,
  getBusinessById,
  approveBusiness,
  rejectBusiness,
  restrictBusiness,
  liftBusinessRestriction,
  getAllServices,
  getServiceById,
  restrictService,
  liftServiceRestriction,
  getDashboardStats,
  getDashboardAnalytics,
  getUserActivityLogs,
  // Plans
  createSubscriptionPlan,
  getAllSubscriptionPlans,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  // Subscriptions
  getAllSubscriptions,
  cancelUserSubscription,
  getRevenueStats,
};
