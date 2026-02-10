const prisma = require("../prismaClient");
const { lemmatizer } = require("lemmatizer");
const NotificationService = require("../service/notification-service");
const {
  formatCancellationDetails,
} = require("../helper/cancellationFormatter");

/* ---------------- VALIDATION SCHEMAS ---------------- */
const {
  businessProfileSchema,
  serviceProfileSchema,
  teamMemberSchema,
} = require("../helper/validation/provider.validation");
const { storeNotification } = require("./notification.controller");
const { PaymentStatus } = require("@prisma/client");

/* ---------------- BUSINESS ---------------- */
const createBusiness = async (req, res) => {
  const userId = req.user.id;

  const { error, value } = businessProfileSchema.validate(req.body);

  if (error) {
    return res.status(422).json({
      success: false,
      msg: error.details.map((e) => e.message),
    });
  }

  try {
    const isBusinessExist = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    const allBusinesses = await prisma.BusinessProfile.findMany();

    const isBusinessEmailExist = allBusinesses.some((business) => {
      return (
        business.contactEmail === value.contactEmail ||
        business.phoneNumber === value.phoneNumber
      );
    });

    if (isBusinessEmailExist || isBusinessExist) {
      return res.status(400).json({
        success: false,
        msg: "Business email and phone number already exist!",
      });
    }

    // check address is exist or not
    const isAddressExist = await prisma.address.findFirst({
      where: { userId },
    });

    if (!isAddressExist) {
      return res.status(400).json({
        success: false,
        msg: "Address not found. Please add your address first.",
      });
    }

    const businessCategory = await prisma.Businesscategory.findUnique({
      where: { id: value.businessCategoryId },
    });

    if (!businessCategory) {
      return res.status(400).json({
        success: false,
        msg: "Invalid Business Type. Please select a valid business category.",
      });
    }

    const { businessCategoryId, ...businessData } = value;
    const newBusiness = await prisma.BusinessProfile.create({
      data: {
        ...businessData,
        userId,
        businessCategoryId: businessCategory.id,
      },
    });

    // ---------------- NOTIFY ADMINS ----------------
    try {
      const admins = await prisma.user.findMany({
        where: { role: { in: ["admin", "staff"] } },
        select: { id: true },
      });

      if (admins.length > 0) {
        const notifications = admins.map((admin) => ({
          title: "New Business Registration",
          message: `New business "${newBusiness.businessName}" has registered and is pending approval.`,
          receiverId: admin.id,
          senderId: userId,
          read: false,
        }));

        await prisma.notification.createMany({
          data: notifications,
        });
      }
    } catch (notifyError) {
      console.error("Failed to notify admins about new business:", notifyError);
    }

    // create log
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "BUSINESS_CREATED",
        status: "SUCCESS",
        metadata: {
          businessId: newBusiness.id,
          businessName: newBusiness.businessName,
          businessCategoryId: newBusiness.businessCategoryId,
          businessCategoryName: businessCategory.name,
          businessPhoneNumber: newBusiness.phoneNumber,
          businessContactEmail: newBusiness.contactEmail,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });
    return res.status(201).json({
      success: true,
      msg: "Business created successfully.",
      business: newBusiness,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not create business.",
      err,
    });
  }
};

const getBusinessProfile = async (req, res) => {
  const userId = req.user.id;
  try {
    const businessDetails = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    // If no business profile exists, return 404 with empty data
    if (!businessDetails) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found.",
        business: null,
      });
    }

    const categoryName = await prisma.Businesscategory.findUnique({
      where: { id: businessDetails.businessCategoryId },
      select: { name: true },
    });
    const slots = await prisma.Slot.findMany({
      where: { businessProfileId: businessDetails.id },
      orderBy: { time: "asc" },
    });
    return res.status(200).json({
      success: true,
      msg: "Business details fetched successfully.",
      business: businessDetails,
      category: categoryName,
      slots,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch business details.",
    });
  }
};

const updateBusiness = async (req, res) => {
  const userId = req.user.id;

  try {
    const businessDetails = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!businessDetails) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found.",
      });
    }

    const updatedBusiness = await prisma.BusinessProfile.update({
      where: { userId },
      data: {
        ...req.body, // partial update allowed
      },
    });

    // create log
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "BUSINESS_UPDATED",
        status: "SUCCESS",
        metadata: {
          businessId: updatedBusiness.id,
          businessName: updatedBusiness.businessName,
          businessCategoryId: updatedBusiness.businessCategoryId,
          businessCategoryName: updatedBusiness.businessCategoryName,
          businessPhoneNumber: updatedBusiness.phoneNumber,
          businessContactEmail: updatedBusiness.contactEmail,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Business profile updated successfully.",
      business: updatedBusiness,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not update business profile.",
      err,
    });
  }
};

const deleteBusiness = async (req, res) => {
  const userId = req.user.id;

  try {
    const businessDetails = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!businessDetails) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found.",
      });
    }

    // create log
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "BUSINESS_DELETED",
        status: "SUCCESS",
        metadata: {
          businessId: businessDetails.id,
          businessName: businessDetails.businessName,
          businessCategoryId: businessDetails.businessCategoryId,
          businessCategoryName: businessDetails.businessCategoryName,
          businessPhoneNumber: businessDetails.phoneNumber,
          businessContactEmail: businessDetails.contactEmail,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    await prisma.BusinessProfile.delete({
      where: { userId },
    });

    return res.status(200).json({
      success: true,
      msg: "Business profile deleted successfully.",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not delete business profile.",
    });
  }
};

/* ---------------- BUSINESS CATEGORY ---------------- */
const getAllBusinessCategory = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10)); // Default 10
    const skip = (page - 1) * limit;
    const { search } = req.query;

    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const [categories, total] = await Promise.all([
      prisma.Businesscategory.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.Businesscategory.count({ where }),
    ]);

    // Calculate counts for fetched categories
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const totalProvidersCount = await prisma.businessProfile.count({
          where: { businessCategoryId: category.id },
        });

        const activeProvidersCount = await prisma.user.count({
          where: {
            businessProfile: {
              isRestricted: false,
              isActive: true,
              isApproved: true,
              isRejected: false,
              businessCategoryId: category.id,
            },
            providerSubscription: {
              is: {
                status: {
                  in: ["active", "trialing"],
                },
              },
            },
          },
        });

        return {
          ...category,
          totalProvidersCount,
          activeProvidersCount,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      msg: "Business Category fetched successfully.",
      count: categoriesWithCounts.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      categories: categoriesWithCounts,
    });
  } catch (error) {
    console.error("Error fetching business categories:", error);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
};

const createBusinessCategory = async (req, res) => {
  const { name, description } = req.body;

  if (!name.trim() || name === "" || name.length < 3) {
    return res.status(400).json({
      success: false,
      msg: "Name is required and must be at least 3 characters long.",
    });
  }
  if (!description.trim() || description === "" || description.length < 10) {
    return res.status(400).json({
      success: false,
      msg: "Description is required and must be at least 10 characters long.",
    });
  }

  try {
    // Helper function to normalize a string into root words
    const normalize = (text) =>
      text
        .toLowerCase()
        .split(/\s+/) // split by space
        .map((word) => lemmatizer(word))
        .join(" ");

    const existingCategories = await prisma.Businesscategory.findMany();

    const inputNameNormalized = normalize(name.trim());

    // Find similar categories based on root words
    const similarCategories = existingCategories.filter((cat) => {
      const catNameNormalized = normalize(cat.name);
      return (
        inputNameNormalized.includes(catNameNormalized) ||
        catNameNormalized.includes(inputNameNormalized)
      );
    });

    if (similarCategories.length > 0) {
      return res.status(200).json({
        success: false,
        msg: "We found similar business categories. Please select from the suggestions.",
        suggestions: similarCategories.map((c) => c.name),
      });
    }

    const newCategory = await prisma.Businesscategory.create({
      data: { name: name.toLowerCase(), description, createdBy: req.user.id },
    });

    return res.status(201).json({
      success: true,
      msg: "Business category created successfully.",
      category: newCategory,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not create business category.",
    });
  }
};

/* ---------------- UPDATE BUSINESS CATEGORY ---------------- */
const updateBusinessCategory = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      msg: "Access denied. Admin privileges required.",
    });
  }

  const { categoryId } = req.params;
  const { name, description } = req.body;

  if (!name || name.trim().length < 3) {
    return res.status(400).json({
      success: false,
      msg: "Name is required and must be at least 3 characters long.",
    });
  }
  if (!description || description.trim().length < 10) {
    return res.status(400).json({
      success: false,
      msg: "Description is required and must be at least 10 characters long.",
    });
  }

  try {
    const category = await prisma.Businesscategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        msg: "Category not found.",
      });
    }

    const updatedCategory = await prisma.Businesscategory.update({
      where: { id: categoryId },
      data: {
        name: name.toLowerCase(),
        description,
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Business category updated successfully.",
      category: updatedCategory,
    });
  } catch (error) {
    console.error("Error updating business category:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not update business category.",
    });
  }
};

/* ---------------- DELETE BUSINESS CATEGORY ---------------- */
const deleteBusinessCategory = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      msg: "Access denied. Admin privileges required.",
    });
  }

  const { categoryId } = req.params;

  try {
    const category = await prisma.Businesscategory.findUnique({
      where: { id: categoryId },
      include: {
        _count: {
          select: { businessProfiles: true },
        },
      },
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        msg: "Category not found.",
      });
    }

    if (category._count.businessProfiles > 0) {
      return res.status(400).json({
        success: false,
        msg: `Cannot delete category. It is being used by ${category._count.businessProfiles} business(es).`,
      });
    }

    await prisma.Businesscategory.delete({
      where: { id: categoryId },
    });

    return res.status(200).json({
      success: true,
      msg: "Business category deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting business category:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not delete business category.",
    });
  }
};

/* ---------------- SERVICE ---------------- */
const createService = async (req, res) => {
  const userId = req.user.id;

  // Validate request body
  const { error, value } = serviceProfileSchema.validate(req.body, {
    abortEarly: false,
  });

  if (error) {
    return res.status(422).json({
      success: false,
      msg: error.details.map((e) => e.message),
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        providerSubscription: {
          select: {
            status: true, // Fetch status
            plan: {
              select: {
                name: true,
                maxServices: true,
              },
            },
          },
        },
      },
    });
    if (!user) {
      return res.status(404).json({
        success: false,
        msg: "user not found!",
      });
    }

    // Check if business profile exists for the provider
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found. Please create one first.",
      });
    }

    // check address is exist or not
    const isAddressExist = await prisma.address.findFirst({
      where: { userId },
    });

    if (!isAddressExist) {
      return res.status(404).json({
        success: false,
        msg: "Address not found. Please add your address first.",
      });
    }

    // Dynamic Limit Check
    const subscription = user.providerSubscription;
    let maxServices = 3; // FREE PLAN LIMIT (Default)

    if (
      subscription &&
      (subscription.status === "active" || subscription.status === "trialing")
    ) {
      if (subscription.plan && subscription.plan.maxServices !== undefined) {
        maxServices = subscription.plan.maxServices;
      }
    }

    const existingServiceCount = await prisma.Service.count({
      where: { businessProfileId: business.id },
    });

    if (maxServices !== -1 && existingServiceCount >= maxServices) {
      return res.status(403).json({
        success: false,
        msg: `Plan limit reached. You can only create ${maxServices} services. Please upgrade your plan.`,
      });
    }

    // Prevent duplicate service names under the same business
    const duplicateService = await prisma.Service.findFirst({
      where: {
        businessProfileId: business.id,
        name: value.name,
      },
    });

    if (duplicateService) {
      return res.status(400).json({
        success: false,
        msg: "A service with this name already exists under your business.",
      });
    }

    // Create the new service
    const newService = await prisma.Service.create({
      data: {
        ...value,
        businessProfileId: business.id,
        businessCategoryId: business.businessCategoryId,
      },
    });

    // create log
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "SERVICE_CREATED",
        status: "SUCCESS",
        metadata: {
          newService,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    return res.status(201).json({
      success: true,
      msg: "Service created successfully.",
      service: newService,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not create service.",
    });
  }
};

const getServices = async (req, res) => {
  const userId = req.user.id;
  const { serviceId } = req.query;

  try {
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found for this user.",
      });
    }

    if (serviceId) {
      const service = await prisma.Service.findFirst({
        where: {
          id: serviceId,
          businessProfileId: business.id,
        },
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          msg: "Service not found for this business.",
        });
      }

      const bookingCount = await prisma.Booking.count({
        where: {
          serviceId: service.id,
          businessProfileId: business.id,
        },
      });

      return res.status(200).json({
        success: true,
        msg: "Service fetched successfully.",
        service,
        bookingCount,
      });
    }

    const services = await prisma.Service.findMany({
      where: { businessProfileId: business.id },
      orderBy: { createdAt: "desc" },
    });

    if (services.length === 0) {
      return res.status(200).json({
        success: true,
        msg: "No services found for this business.",
        count: 0,
        services: [],
      });
    }

    const bookingCounts = await prisma.Booking.groupBy({
      by: ["serviceId"],
      where: { businessProfileId: business.id },
      _count: { serviceId: true },
    });

    return res.status(200).json({
      success: true,
      msg: "Services fetched successfully.",
      count: services.length,
      services,
      bookingCounts,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch services.",
    });
  }
};

const updateService = async (req, res) => {
  const userId = req.user.id;
  const { serviceId } = req.params;

  try {
    // 1. Find business profile for logged-in user
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found for this user.",
      });
    }

    // 2. Check service ownership
    const service = await prisma.Service.findFirst({
      where: {
        id: serviceId,
        businessProfileId: business.id,
      },
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        msg: "Service not found or does not belong to your business.",
      });
    }

    // 3. Update service with whatever fields are sent
    const updatedService = await prisma.Service.update({
      where: { id: serviceId },
      data: {
        ...req.body, // partial update allowed
      },
    });

    // create log
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "SERVICE_UPDATED",
        status: "SUCCESS",
        metadata: {
          serviceId: updatedService.id,
          serviceName: updatedService.name,
          serviceCategoryId: updatedService.serviceCategoryId,
          serviceCategoryName: updatedService.serviceCategoryName,
          servicePhoneNumber: updatedService.phoneNumber,
          serviceContactEmail: updatedService.contactEmail,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Service updated successfully.",
      service: updatedService,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not update service.",
    });
  }
};

const getServiceById = async (req, res) => {
  const userId = req.user.id;
  const { serviceId } = req.params;
  try {
    // Find business profile of the provider
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });
    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found for this user.",
      });
    }

    // Get the service by ID for this business
    const service = await prisma.Service.findFirst({
      where: {
        id: serviceId,
        businessProfileId: business.id,
      },
    });
    if (!service) {
      return res.status(404).json({
        success: false,
        msg: "Service not found for this business.",
      });
    }

    // Return the service
    return res.status(200).json({
      success: true,
      msg: "Service fetched successfully.",
      service,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch service.",
    });
  }
};

const deleteService = async (req, res) => {
  const userId = req.user.id;
  const { serviceId } = req.params;

  try {
    // Check if the user's business profile exists
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found for this user.",
      });
    }

    // Find the service that belongs to this business
    const existingService = await prisma.Service.findFirst({
      where: {
        id: serviceId,
        businessProfileId: business.id,
      },
    });

    if (!existingService) {
      return res.status(404).json({
        success: false,
        msg: "Service not found or does not belong to your business.",
      });
    }

    // create log
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "SERVICE_DELETED",
        status: "SUCCESS",
        metadata: {
          serviceId: existingService.id,
          serviceName: existingService.name,
          serviceCategoryId: existingService.serviceCategoryId,
          serviceCategoryName: existingService.serviceCategoryName,
          servicePhoneNumber: existingService.phoneNumber,
          serviceContactEmail: existingService.contactEmail,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    // Delete the service
    await prisma.Service.delete({
      where: { id: serviceId },
    });

    return res.status(200).json({
      success: true,
      msg: "Service deleted successfully.",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not delete service.",
    });
  }
};

/* ---------------- SLOTS ---------------- */
const generateSlots = async (req, res) => {
  const userId = req.user.id;

  try {
    const { startTime, endTime, breakStartTime, breakEndTime, slotsDuration } =
      req.body;

    // Find provider business
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found. Please create one first.",
      });
    }
    // Fetch existing slots
    const existingSlots = await prisma.Slot.findMany({
      where: { businessProfileId: business.id },
    });

    const normalizeTime = (t) => t.trim().toUpperCase();

    // GENERATE MULTIPLE SLOTS
    function convertToMinutes(timeStr) {
      let [hours, minutes] = timeStr.split(":");
      minutes = minutes.replace("AM", "").replace("PM", "").trim();
      let modifier = timeStr.includes("PM") ? "PM" : "AM";

      hours = parseInt(hours);
      minutes = parseInt(minutes);

      if (modifier === "PM" && hours !== 12) hours += 12;
      if (modifier === "AM" && hours === 12) hours = 0;

      return hours * 60 + minutes;
    }

    function formatTime(minutes) {
      let hrs = Math.floor(minutes / 60);
      let mins = minutes % 60;
      let ampm = hrs >= 12 ? "PM" : "AM";

      hrs = hrs % 12;
      if (hrs === 0) hrs = 12;

      return `${hrs}:${mins.toString().padStart(2, "0")} ${ampm}`;
    }

    const start = convertToMinutes(startTime);
    const end = convertToMinutes(endTime);
    const breakStart = convertToMinutes(breakStartTime);
    const breakEnd = convertToMinutes(breakEndTime);
    const interval = parseInt(slotsDuration);

    let generatedSlots = [];

    for (let time = start; time < end; time += interval) {
      // Skip break time
      if (time >= breakStart && time < breakEnd) continue;

      const formatted = formatTime(time);

      const exists = existingSlots.some(
        (slot) => normalizeTime(slot.time) === normalizeTime(formatted),
      );

      if (!exists) {
        generatedSlots.push({
          time: formatted,
          businessProfileId: business.id,
        });
      }
    }

    if (generatedSlots.length === 0) {
      return res.status(400).json({
        success: false,
        msg: "No new slots were added. All slots already exist.",
      });
    }

    const created = await prisma.Slot.createMany({
      data: generatedSlots,
    });

    // create log
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "SLOTS_GENERATED",
        status: "SUCCESS",
        metadata: {
          businessId: business.id,
          businessName: business.businessName,
          businessCategoryId: business.businessCategoryId,
          businessCategoryName: business.businessCategoryName,
          businessPhoneNumber: business.phoneNumber,
          businessContactEmail: business.contactEmail,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    return res.status(201).json({
      success: true,
      msg: "Slots generated successfully",
      totalCreated: created.count,
      slots: generatedSlots,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not create slot.",
    });
  }
};

const createSingleSlot = async (req, res) => {
  const userId = req.user.id;
  const { time } = req.body;
  try {
    // Check if provider's business profile exists
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found for this user.",
      });
    }

    // Check if a slot with the same time already exists for this business
    const existingSlot = await prisma.Slot.findFirst({
      where: {
        time,
        businessProfileId: business.id,
      },
    });

    if (existingSlot) {
      return res.status(400).json({
        success: false,
        msg: "A slot with this time already exists for your business.",
      });
    }

    // Create the new slot
    const newSlot = await prisma.Slot.create({
      data: {
        time,
        businessProfileId: business.id,
      },
    });

    // create log
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "SLOT_CREATED",
        status: "SUCCESS",
        metadata: {
          newSlotId: newSlot.id,
          newSlotTime: newSlot.time,
          newSlotBusinessProfileId: newSlot.businessProfileId,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    return res.status(201).json({
      success: true,
      msg: "Slot created successfully.",
      slot: newSlot,
    });
  } catch (error) {}
};

const getAllSlots = async (req, res) => {
  const userId = req.user.id;
  try {
    // Check if provider's business profile exists
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found for this user.",
      });
    }

    const slots = await prisma.Slot.findMany({
      where: {
        businessProfileId: business.id,
      },
      orderBy: { time: "asc" },
    });

    if (slots.length === 0) {
      return res.status(200).json({
        success: true,
        msg: "No slots found for this service.",
        count: 0,
        slots: [],
      });
    }

    return res.status(200).json({
      success: true,
      msg: "Slots fetched successfully.",
      count: slots.length,
      slots,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch slots.",
    });
  }
};

const deleteSlot = async (req, res) => {
  const userId = req.user.id;
  const { slotId } = req.params;

  try {
    // Check if provider's business profile exists
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found for this user.",
      });
    }

    // Find the slot that belongs to this
    const existingSlot = await prisma.Slot.findFirst({
      where: {
        id: slotId,
        businessProfileId: business.id,
      },
    });

    if (!existingSlot) {
      return res.status(404).json({
        success: false,
        msg: "Slot not found or does not belong to your business.",
      });
    }

    // create log
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "SLOT_DELETED",
        status: "SUCCESS",
        metadata: {
          slotId: existingSlot.id,
          slotTime: existingSlot.time,
          slotBusinessProfileId: existingSlot.businessProfileId,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    // Delete the slot
    await prisma.Slot.delete({
      where: { id: slotId },
    });

    return res.status(200).json({
      success: true,
      msg: "Slot deleted successfully.",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not delete slot.",
    });
  }
};

/* ---------------- BOOKINGS (WITH PAGINATION) ---------------- */
const bookingList = async (req, res) => {
  const userId = req.user.id;
  const { bookingId } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10)); // Default 10, max 100
  const skip = (page - 1) * limit;

  const businessProfile = await prisma.BusinessProfile.findUnique({
    where: { userId },
  });

  if (!businessProfile) {
    return res.status(404).json({
      success: false,
      msg: "Business profile not found for this user.",
    });
  }

  if (bookingId) {
    const booking = await prisma.Booking.findFirst({
      where: {
        id: bookingId,
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true,
          },
        },
        address: {
          select: {
            id: true,
            street: true,
            city: true,
            state: true,
            postalCode: true,
            type: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            category: true,
            description: true,
            price: true,
            durationInMinutes: true,
          },
        },
        slot: {
          select: {
            id: true,
            time: true,
          },
        },
        date: true,
        bookingStatus: true,
        staffPaymentStatus: true,
        trackingStatus: true,
        paymentStatus: true,
        totalAmount: true,
        cancellation: true,
        createdAt: true,
        updatedAt: true,
        StaffAssignBooking: {
          select: {
            assignedStaffId: true,
            status: true,
            assignedStaff: {
              select: {
                name: true,
                email: true,
                mobile: true,
              },
            },
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        msg: "Booking not found for this User.",
      });
    }

    return res.status(200).json({
      success: true,
      msg: "Booking fetched successfully.",
      booking,
    });
  }

  // Get total count of bookings
  const totalCount = await prisma.Booking.count({
    where: {
      businessProfileId: businessProfile.id,
    },
  });

  // Fetch paginated bookings with optimized select
  const bookings = await prisma.Booking.findMany({
    where: {
      businessProfileId: businessProfile.id,
    },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          name: true,
          mobile: true,
        },
      },
      service: {
        select: {
          id: true,
          name: true,
          price: true,
          durationInMinutes: true,
        },
      },
      slot: {
        select: {
          time: true,
        },
      },
      bookingStatus: true,
      staffPaymentStatus: true,
      totalAmount: true,
      providerEarnings: true,
      trackingStatus: true,
      paymentStatus: true,
      platformFee: true,
      createdAt: true,
      date: true,
      createdAt: true,
      updatedAt: true,
      StaffAssignBooking: {
        select: {
          assignedStaffId: true,
          status: true,
          assignedStaff: {
            select: {
              name: true,
              email: true,
              mobile: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: skip,
  });

  if (bookings.length === 0) {
    return res.status(200).json({
      success: true,
      msg: "No bookings found for this business.",
      count: 0,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: 0,
      },
      bookings: [],
    });
  }

  const totalPages = Math.ceil(totalCount / limit);

  return res.status(200).json({
    success: true,
    msg: "Bookings fetched successfully.",
    count: bookings.length,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
    },
    bookings,
  });
};

const updateBooking = async (req, res) => {
  const providerId = req.user?.id;
  const { bookingId } = req.params;
  const { status } = req.body;

  if (!providerId) {
    return res.status(401).json({ success: false, msg: "Unauthorized" });
  }

  if (!bookingId) {
    return res
      .status(400)
      .json({ success: false, msg: "Booking ID is required." });
  }

  if (!status) {
    return res.status(400).json({ success: false, msg: "Nothing to update." });
  }

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: true, service: true },
    });

    if (!booking) {
      return res
        .status(404)
        .json({ success: false, msg: "Booking not found." });
    }

    // Prevent updates to cancelled bookings
    if (booking.bookingStatus === "CANCELLED") {
      return res.status(400).json({
        success: false,
        msg: "Cannot update a cancelled booking. The booking is closed and all operations have been stopped.",
      });
    }

    const normalizedStatus = status.toUpperCase();

    if (normalizedStatus === booking.bookingStatus?.toUpperCase()) {
      return res.status(400).json({
        success: false,
        msg: "Booking already has this status.",
      });
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: { bookingStatus: normalizedStatus },
    });

    const notificationPayload = {
      title: `Booking ${normalizedStatus}`,
      body: `Your ${
        booking.service?.name || "service"
      } booking has been ${normalizedStatus}.`,
      type: "BOOKING_STATUS_UPDATED",
    };

    await storeNotification(
      notificationPayload.title,
      notificationPayload.body,
      booking.userId,
      providerId,
    );
    try {
      const fcmTokens = await prisma.fCMToken.findMany({
        where: { userId: booking.userId },
      });

      if (fcmTokens.length > 0) {
        await NotificationService.sendNotification(
          fcmTokens,
          notificationPayload.title,
          notificationPayload.body,
        );
      }
    } catch (notifyErr) {
      console.error("Notification error:", notifyErr);
    }

    // create log
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "BOOKING_UPDATED",
        status: "SUCCESS",
        metadata: {
          bookingId: updatedBooking.id,
          bookingStatus: updatedBooking.bookingStatus,
          bookingServiceId: updatedBooking.serviceId,
          bookingUserId: updatedBooking.userId,
          bookingProviderId: updatedBooking.providerId,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Booking updated successfully.",
      updatedBooking,
    });
  } catch (error) {
    console.error("Update booking error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server error while updating booking.",
    });
  }
};

/* ---------------- DASHBOARD STATES ---------------- */
const getDashboardStats = async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        role: true,
        providerSubscription: {
          select: {
            plan: {
              select: {
                name: true,
                price: true,
                currency: true,
                interval: true,
                features: true,
              },
            },
            currentPeriodStart: true,
            currentPeriodEnd: true,
            status: true,
          },
        },
      },
    });
    if (!user) {
      return res.status(404).json({
        success: false,
        msg: "User Not found",
      });
    }
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found for this user.",
      });
    }

    const services = await prisma.Service.findMany({
      where: { businessProfileId: business.id },
      select: {
        id: true,
        name: true,
      },
    });

    if (services.length === 0) {
      return res.status(200).json({
        success: true,
        msg: "No services found.",
        user,

        serviceBookingStats: [],
      });
    }

    const allBookings = await prisma.Booking.findMany({
      where: { businessProfileId: business.id },
      select: {
        id: true,
        userId: true,
        serviceId: true,
        bookingStatus: true,
        totalAmount: true,
        providerEarnings: true, // Added
        platformFee: true, // Added
        createdAt: true,
      },
    });

    const bookingsData = {
      totalBookings: allBookings.length,
      pending: allBookings.filter(
        (b) => b.bookingStatus.toLowerCase() === "pending",
      ).length,
      confirmed: allBookings.filter(
        (b) => b.bookingStatus.toLowerCase() === "confirmed",
      ).length,
      completed: allBookings.filter(
        (b) => b.bookingStatus.toLowerCase() === "completed",
      ).length,
      cancelled: allBookings.filter(
        (b) => b.bookingStatus.toLowerCase() === "cancelled",
      ).length,
    };

    const totalCustomers = new Set(allBookings.map((b) => b.userId)).size;

    // Helper to get the correct earning amount
    const getEarningAmount = (b) => {
      // If providerEarnings is set (even if 0), use it.
      // But we need to be careful of default(0).
      // If platformFee is > 0, then providerEarnings should be accurate.
      // If platformFee is 0/null and providerEarnings is 0/null, then it's likely a pre-fee booking or a 0 price booking.
      // Easiest logic: use providerEarnings ?? totalAmount.
      // However, if providerEarnings is 0 because of default, but totalAmount is 100, we shouldn't use 0.
      // Schema says @default(0).
      // Let's assume if platformFee is > 0, providerEarnings is valid.
      // Or if providerEarnings > 0, it is valid.
      // If both are 0, and totalAmount > 0, then it's likely an old record -> use totalAmount.

      if (b.providerEarnings !== null && b.providerEarnings > 0) {
        return b.providerEarnings;
      }

      // If fee is computed as 0 (free plan?) and earnings are same as total.
      // If providerEarnings is 0 and totalAmount is 0, it's 0.
      if (b.providerEarnings === 0 && b.totalAmount === 0) return 0;

      // If providerEarnings is 0 but totalAmount is > 0
      // Check if platformFee is set.
      if (b.platformFee !== null && b.platformFee > 0) {
        // If fee is set but earnings are 0... weird unless fee = totalAmount.
        return b.providerEarnings;
      }

      // Fallback for old records where providerEarnings might be 0/null but shouldn't be.
      return b.totalAmount || 0;
    };

    // Calculate Earnings based on status
    const earningsBreakdown = allBookings.reduce(
      (acc, b) => {
        const amount = getEarningAmount(b);
        const status = b.bookingStatus.toLowerCase();

        if (status === "completed") {
          acc.realized += amount;
          acc.total += amount;
        } else if (
          status === "confirmed" ||
          status === "pending" ||
          status === "pending_payment"
        ) {
          acc.potential += amount;
          acc.total += amount;
        } else if (status === "cancelled" || status === "cancel_requested") {
          // Check if there's a cancellation fee retained as earnings
          if (b.providerEarnings !== null && b.providerEarnings > 0) {
            acc.realized += b.providerEarnings;
            acc.total += b.providerEarnings;
            acc.cancellationFee += b.providerEarnings;
          } else {
            acc.lost += amount;
          }
        }
        return acc;
      },
      { realized: 0, potential: 0, lost: 0, total: 0, cancellationFee: 0 },
    );

    const totalEarnings = earningsBreakdown.total;
    const totalCancellationFee = earningsBreakdown.cancellationFee;

    const monthlyMap = {};

    allBookings.forEach((booking) => {
      const date = new Date(booking.createdAt);
      const monthIndex = date.getMonth();
      const month = date.toLocaleString("default", { month: "short" });
      const year = date.getFullYear();
      const sortKey = year * 12 + monthIndex;
      const amount = getEarningAmount(booking);
      const status = booking.bookingStatus.toLowerCase();

      if (!monthlyMap[sortKey]) {
        monthlyMap[sortKey] = {
          month,
          year,
          bookings: 0,
          earnings: 0, // Realized + Potential
          lostEarnings: 0, // Cancelled
          sortKey,
        };
      }

      monthlyMap[sortKey].bookings += 1;

      if (status === "cancelled" || status === "cancel_requested") {
        monthlyMap[sortKey].lostEarnings += amount;
      } else {
        monthlyMap[sortKey].earnings += amount;
      }
    });

    const monthlyAnalysis = Object.values(monthlyMap)
      .sort((a, b) => b.sortKey - a.sortKey)
      .map(({ sortKey, ...rest }) => rest);

    const serviceBookingMap = {};

    allBookings.forEach((booking) => {
      if (!booking.serviceId) return;

      if (!serviceBookingMap[booking.serviceId]) {
        serviceBookingMap[booking.serviceId] = {
          confirmed: 0,
          completed: 0,
          cancelled: 0,
          total: 0,
        };
      }

      const status = booking.bookingStatus.toLowerCase();
      const stats = serviceBookingMap[booking.serviceId];

      if (status === "confirmed") {
        stats.confirmed += 1;
        stats.total += 1;
      } else if (status === "completed") {
        stats.completed += 1;
        stats.total += 1;
      } else if (status === "cancelled" || status === "cancel_requested") {
        stats.cancelled += 1;
        stats.total += 1;
      }
    });

    const serviceBookingStats = services
      .map((service) => {
        const stats = serviceBookingMap[service.id] || {
          confirmed: 0,
          completed: 0,
          cancelled: 0,
          total: 0,
        };
        return {
          service: service.name,
          confirmed: stats.confirmed,
          completed: stats.completed,
          cancelled: stats.cancelled,
          totalBookings: stats.total,
        };
      })
      .sort((a, b) => b.totalBookings - a.totalBookings)
      .slice(0, 5);

    return res.status(200).json({
      success: true,
      msg: "Dashboard stats fetched successfully.",
      user: { ...user, businessProfile: business },
      stats: {
        bookings: bookingsData,
        customers: totalCustomers,
        earnings: {
          total: totalEarnings,
          realized: earningsBreakdown.realized,
          potential: earningsBreakdown.potential,
          lost: earningsBreakdown.lost,
        },
        monthlyAnalysis,
        servicePerformance: serviceBookingStats,
      },
      // Keep old structure for backward compatibility if needed, using new values
      bookings: bookingsData,
      totalCustomers,
      totalEarnings, // This is now (Realized + Potential)
      totalCancellationFee,
      monthlyAnalysis,
      serviceBookingStats,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch dashboard stats.",
    });
  }
};

/* ---------------- SERVICE FEEDBACK ---------------- */
const getAllFeedbacks = async (req, res) => {
  const userId = req.user.id;
  try {
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });
    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found for this user.",
      });
    }
    const services = await prisma.Service.findMany({
      where: { businessProfileId: business.id },
    });
    if (services.length === 0) {
      return res.status(200).json({
        success: true,
        msg: "No services found for this business.",
        count: 0,
        feedbacks: [],
      });
    }

    const serviceIds = services.map((service) => service.id);
    const feedbacks = await prisma.feedback.findMany({
      where: { serviceId: { in: serviceIds } },
    });
    return res.status(200).json({
      success: true,
      msg: "Feedbacks fetched successfully.",
      count: feedbacks.length,
      feedbacks,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Error: while fetching the feedbacks.",
    });
  }
};

/* ---------------- SERVICE FEEDBACK ---------------- */
const getAllSubscriptionPlans = async (req, res) => {
  try {
    const plans = await prisma.ProviderSubscriptionPlan.findMany({
      where: {
        isActive: true,
      },
    });

    return res.status(200).json({ success: true, plans });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Error: while fetching the subscription plans.",
    });
  }
};

/* ---------------- SERVICE FEEDBACK ---------------- */
const GetAllCancellationBookings = async (req, res) => {
  const userId = req.user.id;

  try {
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found for this user.",
      });
    }

    const cancelledBookings = await prisma.Booking.findMany({
      where: {
        businessProfileId: business.id,
        bookingStatus: {
          in: ["CANCEL_REQUESTED", "CANCELLED"],
        },
      },
    });

    if (cancelledBookings.length === 0) {
      return res.status(200).json({
        success: true,
        msg: "No cancelled bookings found.",
        count: 0,
        bookings: [],
      });
    }

    const bookingsList = await Promise.all(
      cancelledBookings.map(async (booking) => {
        // Fetch cancellation details
        const cancelDetails = await prisma.Cancellation.findUnique({
          where: { bookingId: booking.id },
        });

        const user = await prisma.user.findUnique({
          where: { id: booking.userId },
          select: { name: true },
        });

        const service = await prisma.Service.findUnique({
          where: { id: booking.serviceId },
          select: { name: true, price: true },
        });

        // Format cancellation details using helper
        const formattedCancellation = formatCancellationDetails(
          cancelDetails,
          user,
          service,
          booking,
        );

        return formattedCancellation;
      }),
    );

    return res.status(200).json({
      success: true,
      msg: "Cancelled bookings fetched successfully.",
      count: bookingsList.length,
      bookings: bookingsList,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch cancelled bookings.",
    });
  }
};

/* ---------------- REQUEST UNRESTRICT ---------------- */
const requestUnrestrict = async (req, res) => {
  const userId = req.user.id;
  const { message } = req.body;

  try {
    if (!message) {
      return res
        .status(400)
        .json({ success: false, msg: "Message is required" });
    }

    // Update Business Profile with the request message
    await prisma.BusinessProfile.update({
      where: { userId },
      data: {
        restrictionRequestMessage: message,
      },
    });

    // Find all admins to notify
    const admins = await prisma.user.findMany({
      where: { role: "admin" },
      select: { id: true },
    });

    if (admins.length > 0) {
      const notifications = admins.map((admin) => ({
        title: "Restriction Removal Request",
        message: `Provider ${req.user.name} has requested to lift the restriction on their business. Message: "${message}"`,
        receiverId: admin.id,
        senderId: userId,
        read: false,
      }));

      await prisma.notification.createMany({
        data: notifications,
      });
    }

    // create log
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "REQUEST_UNRESTRICT",
        status: "SUCCESS",
        metadata: {
          userId: userId,
          message: message,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Request submitted successfully. Admin has been notified.",
    });
  } catch (error) {
    console.error("Request Unrestrict Error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not submit request.",
    });
  }
};

/* ---------------- REQUEST SERVICE UNRESTRICT ---------------- */
const requestServiceUnrestrict = async (req, res) => {
  const userId = req.user.id;
  const { serviceId, message } = req.body;

  try {
    if (!serviceId || !message) {
      return res
        .status(400)
        .json({ success: false, msg: "ServiceId and Message are required" });
    }

    // Find the business profile to ensure ownership
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found.",
      });
    }

    // Find the service and check ownership
    const service = await prisma.Service.findFirst({
      where: {
        id: serviceId,
        businessProfileId: business.id,
      },
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        msg: "Service not found or unauthorized.",
      });
    }

    // Update Service with the request message
    await prisma.Service.update({
      where: { id: serviceId },
      data: {
        restrictionRequestMessage: message,
      },
    });

    // Find all admins to notify
    const admins = await prisma.user.findMany({
      where: { role: "admin" },
      select: { id: true },
    });

    if (admins.length > 0) {
      const notifications = admins.map((admin) => ({
        title: "Service Restriction Removal Request",
        message: `Provider ${req.user.name} has requested to lift the restriction on service "${service.name}". Message: "${message}"`,
        receiverId: admin.id,
        senderId: userId,
        read: false,
      }));

      await prisma.notification.createMany({
        data: notifications,
      });
    }

    // create log
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "REQUEST_UNRESTRICT",
        status: "SUCCESS",
        metadata: {
          userId: userId,
          message: message,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Request submitted successfully. Admin has been notified.",
    });
  } catch (error) {
    console.error("Request Service Unrestrict Error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not submit request.",
    });
  }
};

const assignBookingToProvider = async (req, res) => {
  const providerId = req.user.id;

  try {
    const { bookingId, staffId, staffPaymentType, staffPaymentValue } =
      req.body;

    if (!bookingId || !staffId) {
      return res.status(400).json({
        success: false,
        msg: "BookingId and StaffId are required",
      });
    }

    // Validate payment type and value
    const validPaymentTypes = ["PERCENTAGE", "FIXED_AMOUNT"];
    const paymentType = staffPaymentType || "PERCENTAGE"; // Default to PERCENTAGE

    if (!validPaymentTypes.includes(paymentType)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid payment type. Must be PERCENTAGE or FIXED_AMOUNT",
      });
    }

    let paymentValue = staffPaymentValue;

    // Validate and set default payment value based on type
    if (
      paymentValue === undefined ||
      paymentValue === null ||
      paymentValue === ""
    ) {
      paymentValue = paymentType === "PERCENTAGE" ? 50 : 0; // Default 50% or 0 fixed amount
    }

    paymentValue = parseFloat(paymentValue);

    // Additional validation based on payment type
    if (paymentType === "PERCENTAGE") {
      if (isNaN(paymentValue) || paymentValue < 0 || paymentValue > 100) {
        return res.status(400).json({
          success: false,
          msg: "Percentage must be between 0 and 100",
        });
      }
    } else if (paymentType === "FIXED_AMOUNT") {
      if (isNaN(paymentValue) || paymentValue < 0) {
        return res.status(400).json({
          success: false,
          msg: "Fixed amount must be a positive number",
        });
      }
    }

    // ----------------------------------
    // Check Booking Exists
    // ----------------------------------

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        slotId: true,
        businessProfileId: true,
        serviceId: true,
        trackingStatus: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        msg: "Booking not found",
      });
    }

    // ----------------------------------
    // Check Staff Exists
    // ----------------------------------

    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: { id: true, role: true },
    });

    if (!staff || staff.role !== "staff") {
      return res.status(404).json({
        success: false,
        msg: "Staff not found",
      });
    }

    // ----------------------------------
    // Prevent Duplicate Assignment
    // ----------------------------------

    const alreadyAssigned = await prisma.staffAssignBooking.findUnique({
      where: {
        bookingId_assignedStaffId: {
          bookingId,
          assignedStaffId: staffId,
        },
      },
    });

    if (alreadyAssigned) {
      return res.status(409).json({
        success: false,
        msg: "This booking is already assigned to this staff",
      });
    }

    // ----------------------------------
    // Validate Staff Membership (Accepted)
    // ----------------------------------
    const isStaffApproved = await prisma.staffApplications.findFirst({
      where: {
        staffId: staffId,
        businessProfileId: booking.businessProfileId,
        status: "APPROVED",
      },
    });

    if (!isStaffApproved) {
      return res.status(400).json({
        success: false,
        msg: "This staff member is not an approved member of your business.",
      });
    }

    // ----------------------------------
    // COMPREHENSIVE STAFF AVAILABILITY CHECK
    // ----------------------------------

    // 1. Check staff's current manual availability status
    const staffUser = await prisma.user.findUnique({
      where: { id: staffId },
      select: { availability: true, name: true },
    });

    if (staffUser?.availability === "NOT_AVAILABLE") {
      return res.status(409).json({
        success: false,
        msg: "Staff member is currently marked as NOT AVAILABLE. Please contact the staff or choose a different staff member.",
        availabilityConflict: {
          type: "MANUAL_NOT_AVAILABLE",
          reason: "Staff has manually set themselves as not available",
        },
      });
    }

    // 2. Get booking details for further checks
    const bookingDetails = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        date: true,
        slotId: true,
        slot: {
          select: {
            id: true,
            time: true,
          },
        },
        service: {
          select: {
            id: true,
            durationInMinutes: true,
          },
        },
      },
    });

    if (!bookingDetails) {
      return res.status(404).json({
        success: false,
        msg: "Booking details not found",
      });
    }

    // 3. Check if staff is ON_WORK (actively working on another booking)
    if (staffUser?.availability === "ON_WORK") {
      return res.status(409).json({
        success: false,
        msg: "Staff member is currently working on an active booking. They will become available after completing the current booking.",
        availabilityConflict: {
          type: "ON_WORK",
          reason: "Staff is actively working on another booking",
        },
      });
    }

    // 4. Check for approved leave during the booking date
    // Normalize dates to compare only the date parts (ignore time)
    const bookingDateOnly = new Date(bookingDetails.date);
    bookingDateOnly.setHours(0, 0, 0, 0);

    const approvedLeave = await prisma.staffLeave.findFirst({
      where: {
        staffId,
        status: "APPROVED",
        // Check if booking date falls within leave period
        // Leave start date should be before or on booking date
        // Leave end date should be after or on booking date
        AND: [
          {
            startDate: {
              lte: new Date(
                new Date(bookingDetails.date).setHours(23, 59, 59, 999),
              ),
            },
          },
          {
            endDate: {
              gte: new Date(new Date(bookingDetails.date).setHours(0, 0, 0, 0)),
            },
          },
        ],
      },
    });

    if (approvedLeave) {
      return res.status(409).json({
        success: false,
        msg: `Staff member is on leave from ${new Date(
          approvedLeave.startDate,
        ).toLocaleDateString()} to ${new Date(
          approvedLeave.endDate,
        ).toLocaleDateString()}. Please choose a different staff member or date.`,
        availabilityConflict: {
          type: "LEAVE_PERIOD",
          reason: "Staff is on approved leave",
          leaveDetails: {
            startDate: approvedLeave.startDate,
            endDate: approvedLeave.endDate,
            leaveType: approvedLeave.leaveType,
          },
        },
      });
    }

    // 5. Check weekly schedule (if configured)
    const dayOfWeek = bookingDateOnly.getDay();
    const weeklySchedule = await prisma.staffWeeklySchedule.findUnique({
      where: {
        staffId_dayOfWeek: {
          staffId,
          dayOfWeek,
        },
      },
    });

    if (weeklySchedule && !weeklySchedule.isAvailable) {
      return res.status(409).json({
        success: false,
        msg: `Staff member is not available on this day according to their weekly schedule.`,
        availabilityConflict: {
          type: "WEEKLY_SCHEDULE",
          reason: "Staff is not available on this day",
          schedule: {
            dayOfWeek: weeklySchedule.dayOfWeek,
            isAvailable: weeklySchedule.isAvailable,
          },
        },
      });
    }

    // 6. Check if booking time is within working hours (if weekly schedule is set)
    if (
      weeklySchedule &&
      weeklySchedule.isAvailable &&
      bookingDetails.slot?.time
    ) {
      const [bookingHour, bookingMinute] = bookingDetails.slot.time
        .split(":")
        .map(Number);
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
        return res.status(409).json({
          success: false,
          msg: `Booking time ${bookingDetails.slot.time} is outside staff's working hours (${weeklySchedule.startTime} - ${weeklySchedule.endTime}). Please choose a different time slot.`,
          availabilityConflict: {
            type: "WEEKLY_SCHEDULE_HOURS",
            reason: "Booking time is outside working hours",
            schedule: {
              dayOfWeek: weeklySchedule.dayOfWeek,
              startTime: weeklySchedule.startTime,
              endTime: weeklySchedule.endTime,
            },
          },
        });
      }
    }

    // ----------------------------------
    // Check Time Conflicts with Existing Bookings
    // ----------------------------------

    // Find existing bookings for this staff at the same date/time
    const existingBookings = await prisma.booking.findMany({
      where: {
        businessProfileId: booking.businessProfileId,
        StaffAssignBooking: {
          some: {
            assignedStaffId: staffId,
          },
        },
        date: bookingDetails.date,
        id: { not: bookingId }, // Exclude the current booking
      },
      include: {
        StaffAssignBooking: {
          where: {
            assignedStaffId: staffId,
          },
        },
        slot: true,
        service: true,
      },
    });

    // Check for time conflicts
    const hasConflict = existingBookings.some((existingBooking) => {
      // Check if booking is not completed
      const isNotCompleted =
        existingBooking.bookingStatus !== "COMPLETED" &&
        existingBooking.trackingStatus !== "COMPLETED";

      // If completed, no conflict
      if (!isNotCompleted) {
        return false;
      }

      // Check time overlap
      const newBookingTime = bookingDetails.slot?.time || "00:00";
      const existingBookingTime = existingBooking.slot?.time || "00:00";

      // Parse times to minutes for comparison
      const parseTime = (time) => {
        const [hours, minutes] = time.split(":").map(Number);
        return hours * 60 + minutes;
      };

      const newStartTime = parseTime(newBookingTime);
      const newDuration = bookingDetails.service?.durationInMinutes || 60;
      const newEndTime = newStartTime + newDuration;

      const existingStartTime = parseTime(existingBookingTime);
      const existingDuration = existingBooking.service?.durationInMinutes || 60;
      const existingEndTime = existingStartTime + existingDuration;

      // Check for time overlap
      return (
        (newStartTime >= existingStartTime && newStartTime < existingEndTime) ||
        (newEndTime > existingStartTime && newEndTime <= existingEndTime) ||
        (newStartTime <= existingStartTime && newEndTime >= existingEndTime)
      );
    });

    if (hasConflict) {
      return res.status(409).json({
        success: false,
        msg: "Staff member is already assigned to another booking at this time. Please choose a different staff member or time slot.",
        conflict: true,
      });
    }

    // ----------------------------------
    // Create Assignment Record with Payment Details
    // ----------------------------------

    const assignment = await prisma.staffAssignBooking.create({
      data: {
        bookingId: booking.id,
        slotId: booking.slotId,
        businessProfileId: booking.businessProfileId,
        serviceId: booking.serviceId,

        assignedById: providerId,
        assignedStaffId: staffId,

        status: "PENDING",

        // Staff payment configuration
        staffPaymentType: paymentType,
        staffPaymentValue: paymentValue,
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Booking assigned to staff successfully",
      assignment,
    });
  } catch (error) {
    console.error("Assign Booking Error:", error);

    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not assign booking",
    });
  }
};

const getStaffMembers = async (req, res) => {
  const providerId = req.user.id;
  const { search, isApproved, page = 1, limit = 10, date, time } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  try {
    const business = await prisma.businessProfile.findUnique({
      where: { userId: providerId },
    });

    if (!business) {
      return res
        .status(404)
        .json({ success: false, msg: "Business profile not found." });
    }

    const whereClause = {
      businessProfileId: business.id,
    };

    if (isApproved) {
      whereClause.status =
        isApproved === "true" ? "APPROVED" : { not: "APPROVED" };
    }

    if (search) {
      whereClause.staff = {
        name: { contains: search, mode: "insensitive" },
      };
    }

    const totalCount = await prisma.staffApplications.count({
      where: whereClause,
    });

    const applications = await prisma.staffApplications.findMany({
      where: whereClause,
      include: {
        staff: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true,
            role: true,
            createdAt: true,
            availability: true,
          },
        },
      },
      skip,
      take: limitNum,
      orderBy: { createdAt: "desc" },
    });

    const formattedStaff = await Promise.all(
      applications.map(async (app) => {
        const bookingCount = await prisma.staffAssignBooking.count({
          where: { assignedStaffId: app.staffId, status: "ACCEPTED" },
        });

        // Parse checkDate
        const checkDate = date ? new Date(date) : new Date();
        const isToday = new Date().toDateString() === checkDate.toDateString();

        // Check if staff is currently busy (has active booking) - ONLY RELEVANT FOR TODAY
        let activeBookings = [];
        if (isToday) {
          activeBookings = await prisma.booking.findMany({
            where: {
              StaffAssignBooking: {
                some: {
                  assignedStaffId: app.staffId,
                  status: "ACCEPTED", // or PENDING? Usually ACCEPTED implies they are working
                },
              },
              bookingStatus: "CONFIRMED",
              trackingStatus: {
                in: [
                  "BOOKING_STARTED",
                  "PROVIDER_ON_THE_WAY",
                  "SERVICE_STARTED",
                ],
              },
            },
            include: {
              service: { select: { name: true } },
              user: { select: { name: true } },
              slot: { select: { time: true } },
            },
            take: 1,
          });
        }

        const hasActiveBooking = activeBookings.length > 0;
        const currentBooking = hasActiveBooking ? activeBookings[0] : null;

        // Check if staff is on approved leave for the specific date
        // Create range for the checkDate (00:00 to 23:59)
        const startOfDay = new Date(checkDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(checkDate);
        endOfDay.setHours(23, 59, 59, 999);

        const approvedLeave = await prisma.staffLeave.findFirst({
          where: {
            staffId: app.staffId,
            status: "APPROVED",
            // Check if leave overlaps with the checkDate
            AND: [
              { startDate: { lte: endOfDay } },
              { endDate: { gte: startOfDay } },
            ],
          },
        });

        // Determine availability based on multiple factors
        let availability = app.staff.availability || "AVAILABLE";

        // Priority 1: If on approved leave on that date, set to NOT_AVAILABLE
        if (approvedLeave) {
          availability = "NOT_AVAILABLE";
        }
        // Priority 2: If has active booking in progress (AND it is today), set to ON_WORK
        else if (hasActiveBooking && currentBooking) {
          if (currentBooking.trackingStatus === "SERVICE_STARTED") {
            availability = "ON_WORK";
          } else if (
            currentBooking.trackingStatus === "PROVIDER_ON_THE_WAY" ||
            currentBooking.trackingStatus === "BOOKING_STARTED"
          ) {
            availability = "ON_WORK";
          } else {
            availability = "BUSY";
          }
        }
        // Priority 3: If staff manually set to NOT_AVAILABLE, check if we should respect it.
        // If checking for a Future Date, Manual "NOT_AVAILABLE" usually implies "I am not taking jobs generally".
        // But if they just toggled it for "Lunch break" today, it shouldn't affect next week.
        // However, standard interpretation is "My Status is Unavailable".
        else if (app.staff.availability === "NOT_AVAILABLE") {
          availability = "NOT_AVAILABLE";
        }

        // Ensure "ON_WORK" or "BUSY" status from User table doesn't persist to other days unless actual booking exists
        // If User.availability is ON_WORK but isToday is false, we should probably treat it as AVAILABLE (unless manual NOT_AVAILABLE)
        else if (
          (app.staff.availability === "ON_WORK" ||
            app.staff.availability === "BUSY") &&
          !isToday
        ) {
          availability = "AVAILABLE";
        }

        return {
          id: app.staffId,
          applicationId: app.id,
          user: {
            name: app.staff.name,
            email: app.staff.email,
            mobile: app.staff.mobile,
          },
          specialization: ["General"],
          employmentType: "BUSINESS_BASED",
          experience: 1,
          isActive: app.status === "APPROVED",
          status: app.status,
          availability: availability,
          currentBooking: currentBooking
            ? {
                service: currentBooking.service.name,
                customer: currentBooking.user.name,
                time: currentBooking.slot?.time,
              }
            : null,
          leaveDetails: approvedLeave
            ? {
                reason: approvedLeave.reason,
                startDate: approvedLeave.startDate,
                endDate: approvedLeave.endDate,
              }
            : null,
          _count: { bookings: bookingCount },
        };
      }),
    );

    return res.status(200).json({
      success: true,
      staffProfiles: formattedStaff,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error) {
    console.error("Get Staff Error:", error);
    return res.status(500).json({ success: false, msg: "Server Error" });
  }
};

const deleteStaffMember = async (req, res) => {
  const providerId = req.user.id;
  const { staffId } = req.params;

  try {
    const business = await prisma.businessProfile.findUnique({
      where: { userId: providerId },
    });

    if (!business)
      return res
        .status(404)
        .json({ success: false, msg: "Business not found" });

    // Find application
    const application = await prisma.staffApplications.findFirst({
      where: { staffId, businessProfileId: business.id },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        msg: "Staff member not found in your business.",
      });
    }

    // Delete application (removes from staff list)
    await prisma.staffApplications.delete({
      where: { id: application.id },
    });

    return res
      .status(200)
      .json({ success: true, msg: "Staff removed successfully." });
  } catch (err) {
    console.error("Delete Staff Error:", err);
    return res.status(500).json({ success: false, msg: "Server Error" });
  }
};

const getStaffMemberById = async (req, res) => {
  const providerId = req.user.id;
  const { staffId } = req.params;

  try {
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId: providerId },
    });

    if (!business) {
      return res
        .status(404)
        .json({ success: false, msg: "Business profile not found." });
    }

    const application = await prisma.staffApplications.findFirst({
      where: {
        staffId: staffId,
        businessProfileId: business.id,
      },
      include: {
        staff: true,
      },
    });

    if (!application) {
      return res
        .status(404)
        .json({ success: false, msg: "Staff member not found." });
    }

    const bookingCount = await prisma.staffAssignBooking.count({
      where: { assignedStaffId: staffId, status: "ACCEPTED" },
    });

    const serviceAssignmentsCount = await prisma.staffAssignBooking.count({
      where: { assignedStaffId: staffId },
    });

    // Fetch services assigned to this staff through bookings
    const staffBookings = await prisma.staffAssignBooking.findMany({
      where: {
        assignedStaffId: staffId,
        businessProfileId: business.id,
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
      },
      distinct: ["serviceId"],
    });

    // Format service assignments
    const serviceAssignments = staffBookings.map((assignment, index) => ({
      id: `service-assignment-${index}`,
      serviceId: assignment.service.id,
      service: assignment.service,
      skillLevel: "INTERMEDIATE", // Default value
      isPrimaryService: index === 0, // First service is primary
      assignedAt: assignment.createdAt,
    }));

    // Check if staff is currently busy
    const activeBookings = await prisma.booking.findMany({
      where: {
        StaffAssignBooking: {
          some: {
            assignedStaffId: staffId,
            status: "ACCEPTED",
          },
        },
        businessProfileId: business.id,
        bookingStatus: "CONFIRMED",
        trackingStatus: {
          in: ["BOOKING_STARTED", "PROVIDER_ON_THE_WAY", "SERVICE_STARTED"],
        },
      },
      include: {
        service: {
          select: {
            name: true,
          },
        },
        user: {
          select: {
            name: true,
          },
        },
        slot: {
          select: {
            time: true,
          },
        },
      },
      take: 1,
    });

    const isBusy = activeBookings.length > 0;
    const currentBooking = isBusy ? activeBookings[0] : null;

    // Check if staff is on approved leave today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const approvedLeave = await prisma.staffLeave.findFirst({
      where: {
        staffId: staffId,
        status: "APPROVED",
        startDate: { lte: new Date(new Date().setHours(23, 59, 59, 999)) },
        endDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });

    // Get staff ratings and reviews
    const reviews = await prisma.staffReview.findMany({
      where: {
        staffId: staffId,
        businessProfileId: business.id,
      },
    });

    const averageRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : null;

    // Determine availability based on multiple factors
    let finalAvailability = application.staff.availability;

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
    else if (application.staff.availability === "NOT_AVAILABLE") {
      finalAvailability = "NOT_AVAILABLE";
    }
    // Priority 4: Otherwise use manual availability or default to AVAILABLE
    else if (
      application.staff.availability === "AVAILABLE" ||
      !application.staff.availability
    ) {
      finalAvailability = "AVAILABLE";
    }

    // Construct the formatted response
    const formattedStaff = {
      id: application.staffId,
      applicationId: application.id,
      user: {
        name: application.staff.name,
        email: application.staff.email,
        mobile: application.staff.mobile,
      },
      specialization: ["General"], // Placeholder
      employmentType: "BUSINESS_BASED", // Placeholder
      experience: 1, // Placeholder
      isActive: application.status === "APPROVED",
      isApproved: application.status === "APPROVED",
      status: application.status,
      createdAt: application.createdAt,
      availability: finalAvailability,
      currentBooking: currentBooking
        ? {
            service: currentBooking.service.name,
            customer: currentBooking.user.name,
            time: currentBooking.slot?.time,
          }
        : null,
      serviceAssignments,
      leaveDetails: approvedLeave
        ? {
            reason: approvedLeave.reason,
            startDate: approvedLeave.startDate,
            endDate: approvedLeave.endDate,
          }
        : null,
      rating: averageRating,
      reviewCount: reviews.length,
      _count: {
        bookings: bookingCount,
        serviceAssignments: serviceAssignmentsCount,
      },
    };

    return res.status(200).json({
      success: true,
      staffProfile: formattedStaff,
    });
  } catch (error) {
    console.error("Get Staff By ID Error:", error);
    return res.status(500).json({ success: false, msg: "Server Error" });
  }
};

const updateStaffStatus = async (req, res) => {
  const providerId = req.user.id;
  const { staffId } = req.params;
  const { status } = req.body; // APPROVED, REJECTED, PENDING

  if (!["APPROVED", "REJECTED", "PENDING"].includes(status)) {
    return res
      .status(400)
      .json({ success: false, msg: "Invalid status provided." });
  }

  try {
    const business = await prisma.BusinessProfile.findUnique({
      where: { userId: providerId },
    });

    if (!business) {
      return res
        .status(404)
        .json({ success: false, msg: "Business profile not found." });
    }

    const application = await prisma.staffApplications.findFirst({
      where: { staffId: staffId, businessProfileId: business.id },
    });

    if (!application) {
      return res
        .status(404)
        .json({ success: false, msg: "Staff application not found." });
    }

    const updatedApplication = await prisma.staffApplications.update({
      where: { id: application.id },
      data: { status: status },
    });

    // Send Notification to Staff
    try {
      if (status === "APPROVED" || status === "REJECTED") {
        await storeNotification(
          `Staff Application ${status}`,
          `Your application to join ${
            business.businessName
          } has been ${status.toLowerCase()}.`,
          staffId,
          providerId,
        );
      }
    } catch (notifErr) {
      console.error("Error sending notification:", notifErr);
    }

    return res.status(200).json({
      success: true,
      msg: `Staff status updated to ${status}`,
      data: updatedApplication,
    });
  } catch (error) {
    console.error("Update Staff Status Error:", error);
    return res.status(500).json({ success: false, msg: "Server Error" });
  }
};

const getStaffStatusTracking = async (req, res) => {
  const providerId = req.user.id;

  try {
    const business = await prisma.businessProfile.findUnique({
      where: { userId: providerId },
    });

    if (!business) {
      return res
        .status(404)
        .json({ success: false, msg: "Business profile not found." });
    }

    // Get all approved staff
    const applications = await prisma.staffApplications.findMany({
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
          },
        },
      },
    });

    const staffStatuses = await Promise.all(
      applications.map(async (app) => {
        // Find active bookings for this staff
        const activeBookings = await prisma.booking.findMany({
          where: {
            StaffAssignBooking: {
              some: {
                assignedStaffId: app.staffId,
                status: "ACCEPTED",
              },
            },
            businessProfileId: business.id,
            bookingStatus: "CONFIRMED",
            trackingStatus: {
              in: ["BOOKING_STARTED", "PROVIDER_ON_THE_WAY", "SERVICE_STARTED"],
            },
          },
          include: {
            service: {
              select: {
                name: true,
              },
            },
            user: {
              select: {
                name: true,
                mobile: true,
              },
            },
            slot: {
              select: {
                time: true,
              },
            },
            address: {
              select: {
                street: true,
                city: true,
                state: true,
              },
            },
          },
          take: 1,
        });

        const isBusy = activeBookings.length > 0;
        const currentBooking = isBusy ? activeBookings[0] : null;

        return {
          staffId: app.staffId,
          staffName: app.staff.name,
          staffEmail: app.staff.email,
          staffMobile: app.staff.mobile,
          status: isBusy ? "ON_SERVICE" : "AVAILABLE",
          currentBooking: currentBooking
            ? {
                bookingId: currentBooking.id,
                service: currentBooking.service.name,
                customer: currentBooking.user.name,
                customerPhone: currentBooking.user.mobile,
                time: currentBooking.slot?.time,
                address: `${currentBooking.address.street}, ${currentBooking.address.city}`,
                trackingStatus: currentBooking.trackingStatus,
              }
            : null,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      msg: "Staff status tracking fetched successfully.",
      staffStatuses,
    });
  } catch (error) {
    console.error("Get Staff Status Tracking Error:", error);
    return res.status(500).json({ success: false, msg: "Server Error" });
  }
};

// Get staff bookings for a specific staff member (for provider)
const getStaffBookings = async (req, res) => {
  const providerId = req.user.id;
  const { staffId } = req.params;

  try {
    const business = await prisma.businessProfile.findUnique({
      where: { userId: providerId },
    });

    if (!business) {
      return res
        .status(404)
        .json({ success: false, msg: "Business profile not found." });
    }

    // Verify staff belongs to this business
    const application = await prisma.staffApplications.findFirst({
      where: {
        staffId: staffId,
        businessProfileId: business.id,
      },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        msg: "Staff member not found in your business.",
      });
    }

    // Get all bookings for this staff
    const bookings = await prisma.booking.findMany({
      where: {
        businessProfileId: business.id,
        StaffAssignBooking: {
          some: {
            assignedStaffId: staffId,
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            mobile: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
          },
        },
        slot: {
          select: {
            id: true,
            time: true,
          },
        },
        StaffAssignBooking: {
          where: {
            assignedStaffId: staffId,
          },
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({
      success: true,
      bookings,
    });
  } catch (error) {
    console.error("Get Staff Bookings Error:", error);
    return res.status(500).json({ success: false, msg: "Server Error" });
  }
};

// Unlink staff from business with optional booking transfer
const unlinkStaffMember = async (req, res) => {
  const providerId = req.user.id;
  const { staffId } = req.params;
  const { transfers, reason } = req.body; // Array of { bookingId, newStaffId }

  try {
    const business = await prisma.businessProfile.findUnique({
      where: { userId: providerId },
    });

    if (!business) {
      return res
        .status(404)
        .json({ success: false, msg: "Business profile not found." });
    }

    // Verify staff belongs to this business
    const application = await prisma.staffApplications.findFirst({
      where: {
        staffId: staffId,
        businessProfileId: business.id,
      },
      include: {
        staff: true,
      },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        msg: "Staff member not found in your business.",
      });
    }

    // Handle booking transfers if provided
    if (transfers && transfers.length > 0) {
      for (const transfer of transfers) {
        const { bookingId, newStaffId } = transfer;

        if (!newStaffId) {
          return res.status(400).json({
            success: false,
            msg: "New staff ID is required for each booking transfer.",
          });
        }

        // Verify new staff belongs to this business
        const newStaffApplication = await prisma.staffApplications.findFirst({
          where: {
            staffId: newStaffId,
            businessProfileId: business.id,
            status: "APPROVED",
          },
        });

        if (!newStaffApplication) {
          return res.status(400).json({
            success: false,
            msg: "Replacement staff member not found or not approved.",
          });
        }

        // Update the staff assignment
        await prisma.staffAssignBooking.updateMany({
          where: {
            bookingId: bookingId,
            assignedStaffId: staffId,
          },
          data: {
            assignedStaffId: newStaffId,
          },
        });

        // Send notification to new staff
        try {
          await storeNotification(
            "New Booking Assignment",
            `You have been assigned a new booking for ${business.businessName}.`,
            newStaffId,
            providerId,
          );
        } catch (notifErr) {
          console.error("Error sending notification to new staff:", notifErr);
        }
      }
    }

    // Check for any remaining assignments
    const remainingAssignments = await prisma.staffAssignBooking.count({
      where: {
        assignedStaffId: staffId,
        status: {
          in: ["PENDING", "ACCEPTED"],
        },
      },
    });

    if (remainingAssignments > 0) {
      return res.status(400).json({
        success: false,
        msg: `Cannot unlink staff. They still have ${remainingAssignments} active booking(s) that need to be transferred.`,
      });
    }

    // Create an entry in StaffExistFromBusiness for record keeping
    await prisma.staffExistFromBusiness.create({
      data: {
        staffId: staffId,
        businessProfileId: business.id,
        reason: reason || "Unlinked by provider",
        status: "COMPLETED",
        message: {
          unlinkedBy: providerId,
          unlinkedAt: new Date().toISOString(),
          transfersProcessed: transfers?.length || 0,
        },
      },
    });

    // Delete the staff application (unlink from business)
    await prisma.staffApplications.delete({
      where: { id: application.id },
    });

    // Send notification to staff
    try {
      await storeNotification(
        "Removed from Business",
        `You have been removed from ${business.businessName}. Reason: ${
          reason || "No reason provided"
        }`,
        staffId,
        providerId,
      );
    } catch (notifErr) {
      console.error("Error sending notification to staff:", notifErr);
    }

    return res
      .status(200)
      .json({ success: true, msg: "Staff unlinked successfully." });
  } catch (error) {
    console.error("Unlink Staff Error:", error);
    return res.status(500).json({ success: false, msg: "Server Error" });
  }
};

// Get staff details for provider (moved from staff controller to allow provider access)
const getStaffDetailsForProvider = async (req, res) => {
  const providerId = req.user.id;
  const { staffId } = req.params;

  try {
    // Verify staff is associated with this provider's business
    const staffAssignment = await prisma.staffApplications.findFirst({
      where: {
        staffId,
        status: { in: ["APPROVED", "PENDING"] },
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
        staffId: staffId,
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
        applicationStatus: staffAssignment.status,
        joinedAt: staffAssignment.createdAt,
        availability: finalAvailability,
        leaveDetails: approvedLeave
          ? {
              reason: approvedLeave.reason,
              startDate: approvedLeave.startDate,
              endDate: approvedLeave.endDate,
            }
          : null,
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

module.exports = {
  getStaffMembers,
  deleteStaffMember,
  getStaffMemberById,
  getStaffDetailsForProvider,
  updateStaffStatus,
  getStaffStatusTracking,
  getStaffBookings,
  unlinkStaffMember,
  // BUSINESS
  createBusiness,
  getBusinessProfile,
  updateBusiness,
  deleteBusiness,

  // SERVICES
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService,

  // SLOTS
  generateSlots,
  createSingleSlot,
  getAllSlots,
  deleteSlot,

  // BOOKING
  bookingList,
  updateBooking,

  // BUSINESS CATEGORY
  getAllBusinessCategory,
  createBusinessCategory,
  updateBusinessCategory,
  deleteBusinessCategory,

  // DASHBOARD STATS
  getDashboardStats,

  // Feedbacks
  getAllFeedbacks,
  // updateServiceFeedbackStatus,

  // Subscription Plans
  getAllSubscriptionPlans,

  // Get all cancl Bookings
  GetAllCancellationBookings,

  // Request Unrestrict
  requestUnrestrict,
  requestServiceUnrestrict,

  assignBookingToProvider,
};
