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
    const isAddressExist = await prisma.Address.findFirst({
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
      include: {
        // user: true, // Optimzation: we might not need to fetch user back immediately if not used
      },
    });

    // ---------------- NOTIFY ADMINS ----------------
    try {
      const admins = await prisma.user.findMany({
        where: { role: "admin" },
        select: { id: true },
      });

      if (admins.length > 0) {
        const notifications = admins.map((admin) => ({
          title: "New Business Registration",
          message: `New business "${newBusiness.businessName}" has registered and is pending approval.`,
          receiverId: admin.id,
          senderId: userId,
          read: false,
          // You might want to add meta data if schema supports it, but currently message is string.
        }));

        await prisma.notification.createMany({
          data: notifications,
        });

        // Optional: Keep existing Push Notification logic if valid, or remove if simpler is better.
        // For now, let's stick to DB notification which feeds the Admin Panel UI.
      }
    } catch (notifyError) {
      console.error("Failed to notify admins about new business:", notifyError);
    }

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
      })
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
            plan: {
              select: {
                name: true,
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
    const isAddressExist = await prisma.Address.findFirst({
      where: { userId },
    });

    if (!isAddressExist) {
      return res.status(404).json({
        success: false,
        msg: "Address not found. Please add your address first.",
      });
    }

    // Limit check — a provider can only create 5 services
    const providerPlan = user?.providerSubscription?.plan?.name.toLowerCase();

    const existingServiceCount = await prisma.Service.count({
      where: { businessProfileId: business.id },
    });

    const isLimitedPlan = !["premimum", "pro"].includes(providerPlan);

    if (isLimitedPlan && existingServiceCount >= 2) {
      return res.status(507).json({
        success: false,
        msg: "Upgrade your plan to add more services.",
      });
    }

    if (providerPlan === "premimum") {
      if (existingServiceCount >= 5) {
        return res.status(507).json({
          success: false,
          msg: "Upgrade your plan to add more services.",
        });
      }
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
        (slot) => normalizeTime(slot.time) === normalizeTime(formatted)
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
    const bookings = await prisma.Booking.findFirst({
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
        paymentStatus: true,
        totalAmount: true,
        cancellation: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!bookings) {
      return res.status(404).json({
        success: false,
        msg: "Booking not found for this User.",
      });
    }

    return res.status(200).json({
      success: true,
      msg: "Booking fetched successfully.",
      bookings,
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
        },
      },
      service: {
        select: {
          id: true,
          name: true,
        },
      },
      bookingStatus: true,
      paymentStatus: true,
      totalAmount: true,
      createdAt: true,
      date: true,
      createdAt: true,
      updatedAt: true,
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
      providerId
    );
    try {
      const fcmTokens = await prisma.fCMToken.findMany({
        where: { userId: booking.userId },
      });

      if (fcmTokens.length > 0) {
        await NotificationService.sendNotification(
          fcmTokens,
          notificationPayload.title,
          notificationPayload.body
        );
      }
    } catch (notifyErr) {
      console.error("Notification error:", notifyErr);
    }

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
        createdAt: true,
      },
    });

    const bookingsData = {
      totalBookings: allBookings.length,
      pending: allBookings.filter(
        (b) => b.bookingStatus.toLowerCase() === "pending"
      ).length,
      confirmed: allBookings.filter(
        (b) => b.bookingStatus.toLowerCase() === "confirmed"
      ).length,
      completed: allBookings.filter(
        (b) => b.bookingStatus.toLowerCase() === "completed"
      ).length,
      cancelled: allBookings.filter(
        (b) => b.bookingStatus.toLowerCase() === "cancelled"
      ).length,
    };

    const totalCustomers = new Set(allBookings.map((b) => b.userId)).size;

    const totalEarnings = allBookings.reduce(
      (sum, b) => sum + (b.totalAmount || 0),
      0
    );

    const monthlyMap = {};

    allBookings.forEach((booking) => {
      const date = new Date(booking.createdAt);
      const monthIndex = date.getMonth();
      const month = date.toLocaleString("default", { month: "short" });
      const year = date.getFullYear();
      const sortKey = year * 12 + monthIndex;

      if (!monthlyMap[sortKey]) {
        monthlyMap[sortKey] = {
          month,
          year,
          bookings: 0,
          earnings: 0,
          sortKey,
        };
      }

      monthlyMap[sortKey].bookings += 1;
      monthlyMap[sortKey].earnings += booking.totalAmount || 0;
    });

    const monthlyAnalysis = Object.values(monthlyMap)
      .sort((a, b) => b.sortKey - a.sortKey)
      .map(({ sortKey, ...rest }) => rest);

    const serviceBookingMap = {};

    allBookings.forEach((booking) => {
      if (!booking.serviceId) return;

      if (!serviceBookingMap[booking.serviceId]) {
        serviceBookingMap[booking.serviceId] = 0;
      }
      serviceBookingMap[booking.serviceId] += 1;
    });

    const serviceBookingStats = services
      .map((service) => ({
        service: service.name,
        totalBookings: serviceBookingMap[service.id] || 0,
      }))
      .sort((a, b) => b.totalBookings - a.totalBookings)
      .slice(0, 5);

    return res.status(200).json({
      success: true,
      msg: "Dashboard stats fetched successfully.",
      bookings: bookingsData,
      totalCustomers,
      totalEarnings,
      monthlyAnalysis,
      serviceBookingStats,
      user: { ...user, businessProfile: business },
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
    const plans = await prisma.ProviderSubscriptionPlan.findMany();
    return res.status(200).json({ success: true, plans });
  } catch (error) {}
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
          booking
        );

        return formattedCancellation;
      })
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

module.exports = {
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
};
