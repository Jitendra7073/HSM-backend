const prisma = require("../prismaClient");
const { sendMail } = require("../utils/sendmail");
const {
  userRestrictionEmailTemplate,
  userRestrictionLiftedEmailTemplate,
  businessApprovalEmailTemplate,
  businessRestrictionEmailTemplate,
  businessRestrictionLiftedEmailTemplate,
  serviceRestrictionEmailTemplate,
  serviceRestrictionLiftedEmailTemplate,
} = require("../helper/mail-tamplates/adminEmailTemplates");

/* --------------- USER MANAGEMENT --------------- */

// Get all users with pagination and filters
const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      role,
      isRestricted,
      search,
      sortBy = "id",
      sortOrder = "desc",
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build where clause
    const where = {};

    if (role) where.role = role;
    if (isRestricted !== undefined) {
      where.isRestricted = isRestricted === "true";
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { mobile: { contains: search } },
      ];
    }

    // Get users with business profile if provider
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
          businessProfile: {
            select: {
              id: true,
              businessName: true,
              isApproved: true,
              isRestricted: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
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
      return res.status(404).json({ success: false, message: "User not found" });
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
    const { reason } = req.body;
    const adminId = req.user.id;

    if (!reason || reason.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Restriction reason is required" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
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
      return res.status(404).json({ success: false, message: "User not found" });
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

// Get all businesses with pagination and filters
const getAllBusinesses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      isApproved,
      isRestricted,
      search,
      categoryId,
      sortBy = "id",
      sortOrder = "desc",
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build where clause
    const where = {};

    if (isApproved !== undefined) {
      where.isApproved = isApproved === "true";
    }
    if (isRestricted !== undefined) {
      where.isRestricted = isRestricted === "true";
    }
    if (categoryId) {
      where.businessCategoryId = categoryId;
    }
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: "insensitive" } },
        { contactEmail: { contains: search, mode: "insensitive" } },
        { phoneNumber: { contains: search } },
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
        orderBy: { [sortBy]: sortOrder },
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
            bookings: true,
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
        approvedAt: new Date(),
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

// Restrict business
const restrictBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    if (!reason || reason.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Restriction reason is required" });
    }

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

// Get all services with pagination and filters
const getAllServices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      isRestricted,
      businessId,
      categoryId,
      search,
      sortBy = "id",
      sortOrder = "desc",
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build where clause
    const where = {};

    if (isRestricted !== undefined) {
      where.isRestricted = isRestricted === "true";
    }
    if (businessId) {
      where.businessProfileId = businessId;
    }
    if (categoryId) {
      where.businessCategoryId = categoryId;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
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
              feedback: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
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
        feedback: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            bookings: true,
            feedback: true,
          },
        },
      },
    });

    if (!service) {
      return res.status(404).json({ success: false, message: "Service not found" });
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
    const { reason } = req.body;
    const adminId = req.user.id;

    if (!reason || reason.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Restriction reason is required" });
    }

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
      return res.status(404).json({ success: false, message: "Service not found" });
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
      return res.status(404).json({ success: false, message: "Service not found" });
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
      prisma.user.count(),
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
  restrictBusiness,
  liftBusinessRestriction,

  // Service Management
  getAllServices,
  getServiceById,
  restrictService,
  liftServiceRestriction,

  // Dashboard
  getDashboardStats,
};
