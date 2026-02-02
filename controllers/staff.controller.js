const prisma = require("../prismaClient");
const bcrypt = require("bcrypt");
const NotificationService = require("../service/notification-service");

/* ---------------- VALIDATION SCHEMAS ---------------- */
const {
  createStaffProfileSchema,
  updateStaffProfileSchema,
  assignServiceSchema,
  updateServiceAssignmentSchema,
  setAvailabilitySchema,
  assignStaffToBookingSchema,
  updateBookingStatusSchema,
  processStaffPaymentSchema,
  registerAsGlobalStaffSchema,
  applyToBusinessSchema,
} = require("../helper/validation/staff.validation");

/* ---------------- STAFF PROFILE MANAGEMENT ---------------- */

/**
 * Create Staff Profile (Provider)
 * POST /api/v1/staff/profile
 */
const createStaffProfile = async (req, res) => {
  const userId = req.user.id;

  const { error, value } = createStaffProfileSchema.validate(req.body);
  if (error) {
    return res.status(422).json({
      success: false,
      msg: error.details.map((e) => e.message),
    });
  }

  try {
    // Get provider's business profile
    const businessProfile = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!businessProfile) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found. Please create a business profile first.",
      });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: value.email },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        msg: "Email already exists. Please use a different email.",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(value.password, 10);

    // Create user with staff role
    const newUser = await prisma.user.create({
      data: {
        name: value.name,
        email: value.email,
        mobile: value.mobile,
        password: hashedPassword,
        role: "staff",
      },
    });

    // Create staff profile
    const newStaff = await prisma.StaffProfile.create({
      data: {
        userId: newUser.id,
        businessProfileId: value.employmentType === "BUSINESS_BASED" ? businessProfile.id : null,
        employmentType: value.employmentType,
        specialization: value.specialization,
        experience: value.experience || 0,
        bio: value.bio || null,
        photo: value.photo || null,
        isActive: true,
        isApproved: value.employmentType === "BUSINESS_BASED", // Auto-approve business-based staff
      },
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
    });

    // Log activity
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "STAFF_CREATED",
        status: "SUCCESS",
        metadata: {
          staffId: newStaff.id,
          staffName: newStaff.user.name,
          staffEmail: newStaff.user.email,
          employmentType: newStaff.employmentType,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    return res.status(201).json({
      success: true,
      msg: "Staff profile created successfully.",
      staff: newStaff,
    });
  } catch (err) {
    console.error("Error creating staff profile:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not create staff profile.",
      err: err.message,
    });
  }
};

/**
 * Get All Staff Profiles (Provider/Admin)
 * GET /api/v1/staff/profiles
 */
const getStaffProfiles = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const { search, employmentType, isActive, isApproved } = req.query;

    let where = {};

    // Providers can only see their own staff
    if (userRole === "provider") {
      const businessProfile = await prisma.BusinessProfile.findUnique({
        where: { userId },
      });

      if (!businessProfile) {
        return res.status(404).json({
          success: false,
          msg: "Business profile not found.",
        });
      }

      where.businessProfileId = businessProfile.id;
    }

    // Filters
    if (search) {
      where.user = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    if (employmentType) {
      where.employmentType = employmentType;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    if (isApproved !== undefined) {
      where.isApproved = isApproved === "true";
    }

    const [staffProfiles, total] = await Promise.all([
      prisma.staffProfile.findMany({
        where,
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
          businessProfile: {
            select: {
              id: true,
              businessName: true,
            },
          },
          _count: {
            select: {
              bookings: true,
              serviceAssignments: true,
              businessApplications: userRole === "admin",
            },
          },
          // For admin: include additional analytics
          ...(userRole === "admin" && {
            bookings: {
              select: {
                bookingStatus: true,
                totalAmount: true,
              },
              take: 100, // Get recent bookings for analytics
            },
            earnings: {
              select: {
                staffShare: true,
                paymentStatus: true,
              },
              take: 100,
            },
          }),
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.staffProfile.count({ where }),
    ]);

    // For admin: calculate additional analytics
    let enhancedProfiles = staffProfiles;
    if (userRole === "admin") {
      enhancedProfiles = staffProfiles.map(staff => {
        // Calculate completed bookings count
        const completedBookings = staff.bookings?.filter(b => b.bookingStatus === "COMPLETED").length || 0;
        const totalEarnings = staff.earnings?.reduce((sum, e) => sum + (e.paymentStatus === "PAID" ? e.staffShare : 0), 0) || 0;

        return {
          ...staff,
          analytics: {
            completedBookings,
            totalEarnings,
            // Calculate pending earnings
            pendingEarnings: staff.earnings?.reduce((sum, e) => sum + (e.paymentStatus === "PENDING" ? e.staffShare : 0), 0) || 0,
            // Count how many businesses they've applied to
            applicationsCount: staff._count?.businessApplications || 0,
          },
        };
      });
    }

    return res.status(200).json({
      success: true,
      msg: "Staff profiles fetched successfully.",
      count: enhancedProfiles.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      staffProfiles: enhancedProfiles,
    });
  } catch (err) {
    console.error("Error fetching staff profiles:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch staff profiles.",
      err: err.message,
    });
  }
};

/**
 * Get Staff Profile By ID
 * GET /api/v1/staff/profile/:staffId
 */
const getStaffProfileById = async (req, res) => {
  const { staffId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { id: staffId },
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
        businessProfile: {
          select: {
            id: true,
            businessName: true,
          },
        },
        serviceAssignments: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
                price: true,
              },
            },
          },
        },
        availability: true,
      },
    });

    if (!staffProfile) {
      return res.status(404).json({
        success: false,
        msg: "Staff profile not found.",
      });
    }

    // Check access permissions
    if (userRole === "provider") {
      const businessProfile = await prisma.BusinessProfile.findUnique({
        where: { userId },
      });

      if (!businessProfile || businessProfile.id !== staffProfile.businessProfileId) {
        return res.status(403).json({
          success: false,
          msg: "Access denied. You can only view your own staff.",
        });
      }
    }

    return res.status(200).json({
      success: true,
      msg: "Staff profile fetched successfully.",
      staffProfile,
    });
  } catch (err) {
    console.error("Error fetching staff profile:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch staff profile.",
      err: err.message,
    });
  }
};

/**
 * Update Staff Profile
 * PATCH /api/v1/staff/profile/:staffId
 */
const updateStaffProfile = async (req, res) => {
  const { staffId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  const { error, value } = updateStaffProfileSchema.validate(req.body);
  if (error) {
    return res.status(422).json({
      success: false,
      msg: error.details.map((e) => e.message),
    });
  }

  try {
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { id: staffId },
      include: { user: true },
    });

    if (!staffProfile) {
      return res.status(404).json({
        success: false,
        msg: "Staff profile not found.",
      });
    }

    // Check access permissions
    if (userRole === "provider") {
      const businessProfile = await prisma.BusinessProfile.findUnique({
        where: { userId },
      });

      if (!businessProfile || businessProfile.id !== staffProfile.businessProfileId) {
        return res.status(403).json({
          success: false,
          msg: "Access denied. You can only update your own staff.",
        });
      }
    }

    // Update user data if provided
    if (value.name || value.mobile) {
      await prisma.user.update({
        where: { id: staffProfile.userId },
        data: {
          ...(value.name && { name: value.name }),
          ...(value.mobile && { mobile: value.mobile }),
        },
      });
    }

    // Update staff profile
    const { name, mobile, ...staffData } = value;
    const updatedStaff = await prisma.staffProfile.update({
      where: { id: staffId },
      data: staffData,
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
    });

    // Log activity
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: userRole,
        actionType: "STAFF_UPDATED",
        status: "SUCCESS",
        metadata: {
          staffId: updatedStaff.id,
          staffName: updatedStaff.user.name,
          changes: staffData,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Staff profile updated successfully.",
      staff: updatedStaff,
    });
  } catch (err) {
    console.error("Error updating staff profile:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not update staff profile.",
      err: err.message,
    });
  }
};

/**
 * Delete Staff Profile
 * DELETE /api/v1/staff/profile/:staffId
 */
const deleteStaffProfile = async (req, res) => {
  const { staffId } = req.params;
  const userId = req.user.id;

  try {
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { id: staffId },
      include: { user: true },
    });

    if (!staffProfile) {
      return res.status(404).json({
        success: false,
        msg: "Staff profile not found.",
      });
    }

    // Check access permissions
    const businessProfile = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!businessProfile || businessProfile.id !== staffProfile.businessProfileId) {
      return res.status(403).json({
        success: false,
        msg: "Access denied. You can only delete your own staff.",
      });
    }

    // Check if staff has active bookings
    const activeBookings = await prisma.booking.count({
      where: {
        staffId,
        bookingStatus: {
          in: ["PENDING", "CONFIRMED", "IN_PROGRESS"],
        },
      },
    });

    if (activeBookings > 0) {
      return res.status(400).json({
        success: false,
        msg: `Cannot delete staff with ${activeBookings} active booking(s). Please reassign or complete bookings first.`,
      });
    }

    // Delete staff profile (cascade will handle related records)
    await prisma.staffProfile.delete({
      where: { id: staffId },
    });

    // Delete user account
    await prisma.user.delete({
      where: { id: staffProfile.userId },
    });

    // Log activity
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "STAFF_DELETED",
        status: "SUCCESS",
        metadata: {
          staffId: staffProfile.id,
          staffName: staffProfile.user.name,
          staffEmail: staffProfile.user.email,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Staff profile deleted successfully.",
    });
  } catch (err) {
    console.error("Error deleting staff profile:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not delete staff profile.",
      err: err.message,
    });
  }
};

/* ---------------- SERVICE ASSIGNMENTS ---------------- */

/**
 * Assign Service to Staff
 * POST /api/v1/staff/assign-service
 */
const assignServiceToStaff = async (req, res) => {
  const userId = req.user.id;

  const { error, value } = assignServiceSchema.validate(req.body);
  if (error) {
    return res.status(422).json({
      success: false,
      msg: error.details.map((e) => e.message),
    });
  }

  try {
    // Get provider's business profile
    const businessProfile = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!businessProfile) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found.",
      });
    }

    // Verify staff belongs to this business
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { id: value.staffId },
    });

    if (!staffProfile || staffProfile.businessProfileId !== businessProfile.id) {
      return res.status(404).json({
        success: false,
        msg: "Staff not found or does not belong to your business.",
      });
    }

    // Verify service belongs to this business
    const service = await prisma.service.findUnique({
      where: { id: value.serviceId },
    });

    if (!service || service.businessProfileId !== businessProfile.id) {
      return res.status(404).json({
        success: false,
        msg: "Service not found or does not belong to your business.",
      });
    }

    // Check if assignment already exists
    const existingAssignment = await prisma.staffServiceAssignment.findUnique({
      where: {
        staffProfileId_serviceId_businessProfileId: {
          staffProfileId: value.staffId,
          serviceId: value.serviceId,
          businessProfileId: businessProfile.id,
        },
      },
    });

    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        msg: "Service is already assigned to this staff member.",
      });
    }

    // Create service assignment
    const assignment = await prisma.staffServiceAssignment.create({
      data: {
        staffProfileId: value.staffId,
        serviceId: value.serviceId,
        businessProfileId: businessProfile.id,
        skillLevel: value.skillLevel,
        isPrimaryService: value.isPrimaryService,
      },
      include: {
        staffProfile: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        service: {
          select: {
            name: true,
          },
        },
      },
    });

    // Log activity
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "SERVICE_ASSIGNED_TO_STAFF",
        status: "SUCCESS",
        metadata: {
          assignmentId: assignment.id,
          staffId: assignment.staffProfileId,
          staffName: assignment.staffProfile.user.name,
          serviceId: assignment.serviceId,
          serviceName: assignment.service.name,
          skillLevel: assignment.skillLevel,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    return res.status(201).json({
      success: true,
      msg: "Service assigned to staff successfully.",
      assignment,
    });
  } catch (err) {
    console.error("Error assigning service to staff:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not assign service to staff.",
      err: err.message,
    });
  }
};

/**
 * Get Staff Service Assignments
 * GET /api/v1/staff/:staffId/services
 */
const getStaffServiceAssignments = async (req, res) => {
  const { staffId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Verify staff exists and check access
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { id: staffId },
    });

    if (!staffProfile) {
      return res.status(404).json({
        success: false,
        msg: "Staff profile not found.",
      });
    }

    // Check access permissions
    if (userRole === "provider") {
      const businessProfile = await prisma.BusinessProfile.findUnique({
        where: { userId },
      });

      if (!businessProfile || businessProfile.id !== staffProfile.businessProfileId) {
        return res.status(403).json({
          success: false,
          msg: "Access denied.",
        });
      }
    }

    const assignments = await prisma.staffServiceAssignment.findMany({
      where: { staffProfileId: staffId },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            durationInMinutes: true,
            coverImage: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      msg: "Staff service assignments fetched successfully.",
      count: assignments.length,
      assignments,
    });
  } catch (err) {
    console.error("Error fetching staff service assignments:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch service assignments.",
      err: err.message,
    });
  }
};

/**
 * Remove Service Assignment
 * DELETE /api/v1/staff/assignment/:assignmentId
 */
const removeServiceAssignment = async (req, res) => {
  const { assignmentId } = req.params;
  const userId = req.user.id;

  try {
    const assignment = await prisma.staffServiceAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        msg: "Service assignment not found.",
      });
    }

    // Check access permissions
    const businessProfile = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!businessProfile || businessProfile.id !== assignment.businessProfileId) {
      return res.status(403).json({
        success: false,
        msg: "Access denied. You can only remove assignments from your business.",
      });
    }

    await prisma.staffServiceAssignment.delete({
      where: { id: assignmentId },
    });

    // Log activity
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "SERVICE_UNASSIGNED_FROM_STAFF",
        status: "SUCCESS",
        metadata: {
          assignmentId,
          staffId: assignment.staffProfileId,
          serviceId: assignment.serviceId,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Service assignment removed successfully.",
    });
  } catch (err) {
    console.error("Error removing service assignment:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not remove service assignment.",
      err: err.message,
    });
  }
};

/**
 * Update Service Assignment
 * PATCH /api/v1/staff/assignment/:assignmentId
 */
const updateServiceAssignment = async (req, res) => {
  const { assignmentId } = req.params;
  const userId = req.user.id;

  const { error, value } = updateServiceAssignmentSchema.validate(req.body);
  if (error) {
    return res.status(422).json({
      success: false,
      msg: error.details.map((e) => e.message),
    });
  }

  try {
    const assignment = await prisma.staffServiceAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        msg: "Service assignment not found.",
      });
    }

    // Check access permissions
    const businessProfile = await prisma.BusinessProfile.findUnique({
      where: { userId },
    });

    if (!businessProfile || businessProfile.id !== assignment.businessProfileId) {
      return res.status(403).json({
        success: false,
        msg: "Access denied.",
      });
    }

    const updatedAssignment = await prisma.staffServiceAssignment.update({
      where: { id: assignmentId },
      data: value,
    });

    // Log activity
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "SERVICE_ASSIGNMENT_UPDATED",
        status: "SUCCESS",
        metadata: {
          assignmentId,
          changes: value,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Service assignment updated successfully.",
      assignment: updatedAssignment,
    });
  } catch (err) {
    console.error("Error updating service assignment:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not update service assignment.",
      err: err.message,
    });
  }
};

/* ---------------- AVAILABILITY MANAGEMENT ---------------- */

/**
 * Set Staff Availability
 * POST /api/v1/staff/availability
 */
const setStaffAvailability = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  const { error, value } = setAvailabilitySchema.validate(req.body);
  if (error) {
    return res.status(422).json({
      success: false,
      msg: error.details.map((e) => e.message),
    });
  }

  try {
    let staffProfileId;
    let businessProfileId;

    // Determine staff profile and business profile
    if (userRole === "staff") {
      const staffProfile = await prisma.staffProfile.findUnique({
        where: { userId },
      });
      if (!staffProfile) {
        return res.status(404).json({
          success: false,
          msg: "Staff profile not found.",
        });
      }
      staffProfileId = staffProfile.id;
      businessProfileId = staffProfile.businessProfileId;
    } else if (userRole === "provider") {
      // Provider setting availability for their staff
      const { staffId } = req.body;
      if (!staffId) {
        return res.status(400).json({
          success: false,
          msg: "Staff ID is required.",
        });
      }

      const businessProfile = await prisma.BusinessProfile.findUnique({
        where: { userId },
      });

      if (!businessProfile) {
        return res.status(404).json({
          success: false,
          msg: "Business profile not found.",
        });
      }

      const staffProfile = await prisma.staffProfile.findUnique({
        where: { id: staffId },
      });

      if (!staffProfile || staffProfile.businessProfileId !== businessProfile.id) {
        return res.status(403).json({
          success: false,
          msg: "Access denied.",
        });
      }

      staffProfileId = staffId;
      businessProfileId = businessProfile.id;
    } else {
      return res.status(403).json({
        success: false,
        msg: "Access denied.",
      });
    }

    // Delete existing availability for the same context
    await prisma.staffAvailability.deleteMany({
      where: {
        staffProfileId,
        ...(value.weeklySchedule && { businessProfileId }),
        ...(value.dateAvailability && { date: { in: value.dateAvailability.map(d => d.date) } }),
      },
    });

    // Create new availability records
    let newAvailability = [];

    if (value.weeklySchedule) {
      const weeklyRecords = value.weeklySchedule.map((schedule) => ({
        staffProfileId,
        businessProfileId,
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        isAvailable: schedule.isAvailable,
      }));

      newAvailability = await prisma.staffAvailability.createMany({
        data: weeklyRecords,
      });
    }

    if (value.dateAvailability) {
      const dateRecords = value.dateAvailability.map((schedule) => ({
        staffProfileId,
        businessProfileId: null, // Date-specific availability doesn't need business
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        isAvailable: schedule.isAvailable,
      }));

      newAvailability = await prisma.staffAvailability.createMany({
        data: dateRecords,
      });
    }

    return res.status(201).json({
      success: true,
      msg: "Staff availability set successfully.",
      count: newAvailability.count,
    });
  } catch (err) {
    console.error("Error setting staff availability:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not set staff availability.",
      err: err.message,
    });
  }
};

/**
 * Get Staff Availability
 * GET /api/v1/staff/:staffId/availability
 */
const getStaffAvailability = async (req, res) => {
  const { staffId } = req.params;

  try {
    const availability = await prisma.staffAvailability.findMany({
      where: { staffProfileId: staffId },
      orderBy: [{ dayOfWeek: "asc" }, { date: "asc" }],
    });

    // Separate weekly and date-specific availability
    const weeklySchedule = availability.filter((a) => a.date === null);
    const dateAvailability = availability.filter((a) => a.date !== null);

    return res.status(200).json({
      success: true,
      msg: "Staff availability fetched successfully.",
      weeklySchedule,
      dateAvailability,
    });
  } catch (err) {
    console.error("Error fetching staff availability:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch staff availability.",
      err: err.message,
    });
  }
};

/* ---------------- BOOKING MANAGEMENT (STAFF) ---------------- */

/**
 * Get Staff's Assigned Bookings
 * GET /api/v1/staff/bookings
 */
const getStaffAssignedBookings = async (req, res) => {
  const userId = req.user.id;

  try {
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { userId },
    });

    if (!staffProfile) {
      return res.status(404).json({
        success: false,
        msg: "Staff profile not found.",
      });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const { status, date } = req.query;

    const where = { staffId: staffProfile.id };

    if (status) {
      where.bookingStatus = status;
    }

    if (date) {
      where.date = date;
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
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
              price: true,
            },
          },
          address: true,
          slot: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      msg: "Staff bookings fetched successfully.",
      count: bookings.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      bookings,
    });
  } catch (err) {
    console.error("Error fetching staff bookings:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch staff bookings.",
      err: err.message,
    });
  }
};

/**
 * Update Booking Status (by Staff)
 * PATCH /api/v1/staff/booking/:bookingId/status
 */
const updateBookingStatusByStaff = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user.id;

  const { error, value } = updateBookingStatusSchema.validate(req.body);
  if (error) {
    return res.status(422).json({
      success: false,
      msg: error.details.map((e) => e.message),
    });
  }

  try {
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { userId },
    });

    if (!staffProfile) {
      return res.status(404).json({
        success: false,
        msg: "Staff profile not found.",
      });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: true,
        service: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        msg: "Booking not found.",
      });
    }

    // Verify staff is assigned to this booking
    if (booking.staffId !== staffProfile.id) {
      return res.status(403).json({
        success: false,
        msg: "Access denied. You are not assigned to this booking.",
      });
    }

    // Update booking status
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        bookingStatus: value.status,
      },
    });

    // If booking is completed, calculate and create earnings record
    if (value.status === "COMPLETED" && booking.paymentStatus === "PAID") {
      const existingEarning = await prisma.staffEarning.findUnique({
        where: { bookingId },
      });

      if (!existingEarning) {
        // Calculate earnings
        const platformFee = Math.round(booking.totalAmount * 0.10);
        const remainingAmount = booking.totalAmount - platformFee;
        const staffShare = Math.round(remainingAmount * 0.50); // 50-50 split with business
        const businessEarnings = remainingAmount - staffShare;

        await prisma.staffEarning.create({
          data: {
            staffProfileId: staffProfile.id,
            bookingId,
            businessProfileId: booking.businessProfileId,
            totalAmount: booking.totalAmount,
            staffShare,
            platformFee,
            businessEarnings,
            paymentStatus: "PENDING",
          },
        });
      }
    }

    // Send notification to customer
    await NotificationService.sendNotification(
      booking.user.id,
      `Booking ${value.status.toLowerCase()}`,
      `Your booking for ${booking.service.name} has been ${value.status.toLowerCase()}.`,
      userId
    );

    return res.status(200).json({
      success: true,
      msg: `Booking status updated to ${value.status}.`,
      booking: updatedBooking,
    });
  } catch (err) {
    console.error("Error updating booking status:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not update booking status.",
      err: err.message,
    });
  }
};

/* ---------------- STAFF DASHBOARD ---------------- */

/**
 * Get Staff Dashboard Stats
 * GET /api/v1/staff/dashboard/stats
 */
const getStaffDashboardStats = async (req, res) => {
  const userId = req.user.id;

  try {
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { userId },
    });

    if (!staffProfile) {
      return res.status(404).json({
        success: false,
        msg: "Staff profile not found.",
      });
    }

    const [
      totalBookings,
      pendingBookings,
      completedBookings,
      inProgressBookings,
      totalEarnings,
      pendingPayments,
    ] = await Promise.all([
      prisma.booking.count({
        where: { staffId: staffProfile.id },
      }),
      prisma.booking.count({
        where: {
          staffId: staffProfile.id,
          bookingStatus: "PENDING",
        },
      }),
      prisma.booking.count({
        where: {
          staffId: staffProfile.id,
          bookingStatus: "COMPLETED",
        },
      }),
      prisma.booking.count({
        where: {
          staffId: staffProfile.id,
          bookingStatus: "IN_PROGRESS",
        },
      }),
      prisma.staffEarning.aggregate({
        where: {
          staffProfileId: staffProfile.id,
          paymentStatus: "PAID",
        },
        _sum: { staffShare: true },
      }),
      prisma.staffEarning.aggregate({
        where: {
          staffProfileId: staffProfile.id,
          paymentStatus: "PENDING",
        },
        _sum: { staffShare: true },
      }),
    ]);

    return res.status(200).json({
      success: true,
      msg: "Staff dashboard stats fetched successfully.",
      stats: {
        totalBookings,
        pendingBookings,
        completedBookings,
        inProgressBookings,
        totalEarnings: totalEarnings._sum.staffShare || 0,
        pendingPayments: pendingPayments._sum.staffShare || 0,
      },
    });
  } catch (err) {
    console.error("Error fetching staff dashboard stats:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch dashboard stats.",
      err: err.message,
    });
  }
};

/* ---------------- EARNINGS MANAGEMENT ---------------- */

/**
 * Get Staff Earnings
 * GET /api/v1/staff/earnings
 */
const getStaffEarnings = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    let staffProfileId;

    if (userRole === "staff") {
      const staffProfile = await prisma.staffProfile.findUnique({
        where: { userId },
      });
      if (!staffProfile) {
        return res.status(404).json({
          success: false,
          msg: "Staff profile not found.",
        });
      }
      staffProfileId = staffProfile.id;
    } else if (userRole === "provider") {
      const { staffId } = req.query;
      if (!staffId) {
        return res.status(400).json({
          success: false,
          msg: "Staff ID is required.",
        });
      }

      const businessProfile = await prisma.BusinessProfile.findUnique({
        where: { userId },
      });

      if (!businessProfile) {
        return res.status(404).json({
          success: false,
          msg: "Business profile not found.",
        });
      }

      const staffProfile = await prisma.staffProfile.findFirst({
        where: {
          id: staffId,
          businessProfileId: businessProfile.id,
        },
      });

      if (!staffProfile) {
        return res.status(403).json({
          success: false,
          msg: "Access denied.",
        });
      }

      staffProfileId = staffId;
    } else {
      return res.status(403).json({
        success: false,
        msg: "Access denied.",
      });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const { paymentStatus } = req.query;

    const where = { staffProfileId };

    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    const [earnings, total] = await Promise.all([
      prisma.staffEarning.findMany({
        where,
        include: {
          // Note: We need to add this relation to StaffEarning model
          // For now, we'll fetch booking details separately
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.staffEarning.count({ where }),
    ]);

    // Fetch booking details for each earning
    const earningsWithBookings = await Promise.all(
      earnings.map(async (earning) => {
        const booking = await prisma.booking.findUnique({
          where: { id: earning.bookingId },
          select: {
            id: true,
            date: true,
            service: {
              select: {
                name: true,
              },
            },
          },
        });

        return {
          ...earning,
          booking,
        };
      })
    );

    return res.status(200).json({
      success: true,
      msg: "Staff earnings fetched successfully.",
      count: earningsWithBookings.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      earnings: earningsWithBookings,
    });
  } catch (err) {
    console.error("Error fetching staff earnings:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch staff earnings.",
      err: err.message,
    });
  }
};

/* ---------------- GLOBAL STAFF FEATURES ---------------- */

/**
 * Register as Global Staff
 * POST /api/v1/staff/register-global
 */
const registerAsGlobalStaff = async (req, res) => {
  const userId = req.user.id;

  const { error, value } = registerAsGlobalStaffSchema.validate(req.body);
  if (error) {
    return res.status(422).json({
      success: false,
      msg: error.details.map((e) => e.message),
    });
  }

  try {
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { userId },
    });

    if (!staffProfile) {
      return res.status(404).json({
        success: false,
        msg: "Staff profile not found.",
      });
    }

    if (staffProfile.employmentType !== "GLOBAL_FREELANCE") {
      return res.status(400).json({
        success: false,
        msg: "Only global freelancers can use this feature.",
      });
    }

    const updatedStaff = await prisma.staffProfile.update({
      where: { id: staffProfile.id },
      data: {
        specialization: value.specialization,
        experience: value.experience || 0,
        bio: value.bio || null,
        photo: value.photo || null,
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Global staff profile updated successfully.",
      staff: updatedStaff,
    });
  } catch (err) {
    console.error("Error registering as global staff:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not update global staff profile.",
      err: err.message,
    });
  }
};

/* ---------------- ADMIN FEATURES ---------------- */

/**
 * Approve Global Staff
 * PATCH /api/v1/staff/admin/approve/:staffId
 */
const approveGlobalStaff = async (req, res) => {
  const { staffId } = req.params;

  try {
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { id: staffId },
      include: { user: true },
    });

    if (!staffProfile) {
      return res.status(404).json({
        success: false,
        msg: "Staff profile not found.",
      });
    }

    if (staffProfile.employmentType !== "GLOBAL_FREELANCE") {
      return res.status(400).json({
        success: false,
        msg: "Only global freelancers need approval.",
      });
    }

    if (staffProfile.isApproved) {
      return res.status(400).json({
        success: false,
        msg: "Staff is already approved.",
      });
    }

    const updatedStaff = await prisma.staffProfile.update({
      where: { id: staffId },
      data: {
        isApproved: true,
        approvedAt: new Date(),
      },
    });

    // Send notification to staff
    await NotificationService.sendNotification(
      staffProfile.user.id,
      "Profile Approved",
      "Your global staff profile has been approved. You can now apply to businesses.",
      req.user.id
    );

    return res.status(200).json({
      success: true,
      msg: "Global staff approved successfully.",
      staff: updatedStaff,
    });
  } catch (err) {
    console.error("Error approving global staff:", err);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not approve global staff.",
      err: err.message,
    });
  }
};

/* ---------------- BUSINESS APPLICATION WORKFLOW ---------------- */

/**
 * Staff Browse Businesses (Public)
 * GET /api/v1/staff/businesses/browse
 * Staff can browse approved businesses to apply to
 */
const browseBusinesses = async (req, res) => {
  try {
    const { search, category, page = 1, limit = 20 } = req.query;

    const where = {
      isApproved: true,
      isRejected: false,
      isActive: true,
    };

    // Add search filter
    if (search) {
      where.businessName = {
        contains: search,
        mode: "insensitive",
      };
    }

    // Add category filter
    if (category) {
      where.businessCategoryId = category;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [businesses, totalCount] = await Promise.all([
      prisma.businessProfile.findMany({
        where,
        skip,
        take: Number(limit),
        select: {
          id: true,
          businessName: true,
          contactEmail: true,
          phoneNumber: true,
          websiteURL: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          services: {
            select: {
              id: true,
              name: true,
              price: true,
            },
            where: { isActive: true },
            take: 5,
          },
          _count: {
            select: {
              services: true,
              staffProfiles: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.businessProfile.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      msg: "Businesses retrieved successfully",
      data: {
        businesses,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalCount,
          totalPages: Math.ceil(totalCount / Number(limit)),
        },
      },
    });
  } catch (err) {
    console.error("Error browsing businesses:", err);
    res.status(500).json({
      success: false,
      msg: "Server Error: Could not retrieve businesses.",
      err: err.message,
    });
  }
};

/**
 * Staff Apply to Business
 * POST /api/v1/staff/apply-business
 */
const applyToBusiness = async (req, res) => {
  const staffUserId = req.user.id;

  const { error, value } = applyToBusinessSchema.validate(req.body);
  if (error) {
    return res.status(422).json({
      success: false,
      msg: error.details.map((e) => e.message),
    });
  }

  try {
    // Get staff profile
    const staffProfile = await prisma.StaffProfile.findUnique({
      where: { userId: staffUserId },
    });

    if (!staffProfile) {
      return res.status(404).json({
        success: false,
        msg: "Staff profile not found. Please complete your profile first.",
      });
    }

    // Check if business exists
    const business = await prisma.BusinessProfile.findUnique({
      where: { id: value.businessProfileId },
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business not found.",
      });
    }

    if (!business.isApproved) {
      return res.status(400).json({
        success: false,
        msg: "Cannot apply to this business. It is not approved yet.",
      });
    }

    // Check if staff already works for this business
    if (staffProfile.businessProfileId === value.businessProfileId) {
      return res.status(400).json({
        success: false,
        msg: "You already work for this business.",
      });
    }

    // Check if there's already a pending application
    const existingApplication = await prisma.BusinessApplication.findUnique({
      where: {
        staffProfileId_businessProfileId: {
          staffProfileId: staffProfile.id,
          businessProfileId: value.businessProfileId,
        },
      },
    });

    if (existingApplication) {
      if (existingApplication.status === "PENDING") {
        return res.status(400).json({
          success: false,
          msg: "You already have a pending application to this business.",
        });
      } else if (existingApplication.status === "APPROVED") {
        return res.status(400).json({
          success: false,
          msg: "Your application to this business has already been approved.",
        });
      } else if (existingApplication.status === "REJECTED") {
        // Allow re-application if rejected, update the existing record
        await prisma.BusinessApplication.update({
          where: { id: existingApplication.id },
          data: {
            coverLetter: value.coverLetter || null,
            status: "PENDING",
            appliedAt: new Date(),
            rejectionReason: null,
          },
        });

        // Send notification to provider
        await NotificationService.sendNotification({
          senderId: staffUserId,
          receiverId: business.userId,
          title: "New Staff Application",
          message: `${staffProfile.user.name} has reapplied to join your business.`,
          type: "STAFF_APPLICATION",
          metadata: {
            applicationId: existingApplication.id,
            staffProfileId: staffProfile.id,
          },
        });

        return res.status(200).json({
          success: true,
          msg: "Application re-submitted successfully.",
          data: { applicationId: existingApplication.id },
        });
      }
    }

    // Create new application
    const newApplication = await prisma.BusinessApplication.create({
      data: {
        staffProfileId: staffProfile.id,
        businessProfileId: value.businessProfileId,
        coverLetter: value.coverLetter || null,
        status: "PENDING",
      },
    });

    // Send notification to provider
    await NotificationService.sendNotification({
      senderId: staffUserId,
      receiverId: business.userId,
      title: "New Staff Application",
      message: `${staffProfile.user.name} has applied to join your business.`,
      type: "STAFF_APPLICATION",
      metadata: {
        applicationId: newApplication.id,
        staffProfileId: staffProfile.id,
      },
    });

    // Log activity
    await prisma.ProviderAdminActivityLog.create({
      data: {
        actorId: staffUserId,
        actorType: "STAFF",
        actionType: "APPLY_TO_BUSINESS",
        status: "SUCCESS",
        businessProfileId: value.businessProfileId,
        metadata: {
          applicationId: newApplication.id,
          coverLetter: value.coverLetter,
        },
      },
    });

    res.status(201).json({
      success: true,
      msg: "Application submitted successfully.",
      data: { applicationId: newApplication.id },
    });
  } catch (err) {
    console.error("Error applying to business:", err);
    res.status(500).json({
      success: false,
      msg: "Server Error: Could not submit application.",
      err: err.message,
    });
  }
};

/**
 * Staff Get My Applications
 * GET /api/v1/staff/my-applications
 */
const getMyApplications = async (req, res) => {
  const staffUserId = req.user.id;

  try {
    // Get staff profile
    const staffProfile = await prisma.StaffProfile.findUnique({
      where: { userId: staffUserId },
    });

    if (!staffProfile) {
      return res.status(404).json({
        success: false,
        msg: "Staff profile not found.",
      });
    }

    // Get applications
    const applications = await prisma.BusinessApplication.findMany({
      where: {
        staffProfileId: staffProfile.id,
      },
      include: {
        businessProfile: {
          select: {
            id: true,
            businessName: true,
            contactEmail: true,
            phoneNumber: true,
            category: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { appliedAt: "desc" },
    });

    res.status(200).json({
      success: true,
      msg: "Applications retrieved successfully",
      data: applications,
    });
  } catch (err) {
    console.error("Error getting applications:", err);
    res.status(500).json({
      success: false,
      msg: "Server Error: Could not retrieve applications.",
      err: err.message,
    });
  }
};

/**
 * Provider Get Business Applications
 * GET /api/v1/provider/applications
 * Provider can see all applications to their business
 */
const getBusinessApplications = async (req, res) => {
  const providerUserId = req.user.id;

  try {
    // Get provider's business profile
    const businessProfile = await prisma.BusinessProfile.findUnique({
      where: { userId: providerUserId },
    });

    if (!businessProfile) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found.",
      });
    }

    const { status, page = 1, limit = 20 } = req.query;

    const where = {
      businessProfileId: businessProfile.id,
    };

    // Filter by status if provided
    if (status) {
      where.status = status.toUpperCase();
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [applications, totalCount] = await Promise.all([
      prisma.BusinessApplication.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          staffProfile: {
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
        },
        orderBy: { appliedAt: "desc" },
      }),
      prisma.BusinessApplication.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      msg: "Applications retrieved successfully",
      data: {
        applications,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalCount,
          totalPages: Math.ceil(totalCount / Number(limit)),
        },
      },
    });
  } catch (err) {
    console.error("Error getting business applications:", err);
    res.status(500).json({
      success: false,
      msg: "Server Error: Could not retrieve applications.",
      err: err.message,
    });
  }
};

/**
 * Provider Respond to Application
 * PATCH /api/v1/provider/applications/:applicationId/respond
 */
const respondToApplication = async (req, res) => {
  const providerUserId = req.user.id;
  const { applicationId } = req.params;

  const { status, rejectionReason } = req.body;

  if (!status || !["APPROVED", "REJECTED"].includes(status.toUpperCase())) {
    return res.status(400).json({
      success: false,
      msg: "Invalid status. Must be APPROVED or REJECTED.",
    });
  }

  if (status.toUpperCase() === "REJECTED" && !rejectionReason) {
    return res.status(400).json({
      success: false,
      msg: "Rejection reason is required when rejecting an application.",
    });
  }

  try {
    // Get provider's business profile
    const businessProfile = await prisma.BusinessProfile.findUnique({
      where: { userId: providerUserId },
    });

    if (!businessProfile) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found.",
      });
    }

    // Get application
    const application = await prisma.BusinessApplication.findUnique({
      where: { id: applicationId },
      include: {
        staffProfile: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        msg: "Application not found.",
      });
    }

    // Check if application belongs to this provider's business
    if (application.businessProfileId !== businessProfile.id) {
      return res.status(403).json({
        success: false,
        msg: "You don't have permission to respond to this application.",
      });
    }

    // Check if application is still pending
    if (application.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        msg: `Application has already been ${application.status.toLowerCase()}.`,
      });
    }

    const applicationStatus = status.toUpperCase();

    // Update application
    const updatedApplication = await prisma.BusinessApplication.update({
      where: { id: applicationId },
      data: {
        status: applicationStatus,
        rejectionReason: applicationStatus === "REJECTED" ? rejectionReason : null,
        reviewedAt: new Date(),
        respondedAt: new Date(),
      },
    });

    // If approved, update staff profile to link to business
    if (applicationStatus === "APPROVED") {
      await prisma.StaffProfile.update({
        where: { id: application.staffProfileId },
        data: {
          businessProfileId: businessProfile.id,
          employmentType: "BUSINESS_BASED",
          isApproved: true,
          approvedAt: new Date(),
        },
      });

      // Send notification to staff
      await NotificationService.sendNotification({
        senderId: providerUserId,
        receiverId: application.staffProfile.user.id,
        title: "Application Approved",
        message: `Your application to join ${businessProfile.businessName} has been approved!`,
        type: "APPLICATION_APPROVED",
        metadata: {
          applicationId: application.id,
          businessProfileId: businessProfile.id,
        },
      });

      // Log activity
      await prisma.ProviderAdminActivityLog.create({
        data: {
          actorId: providerUserId,
          actorType: "PROVIDER",
          actionType: "APPROVE_STAFF_APPLICATION",
          status: "SUCCESS",
          businessProfileId: businessProfile.id,
          metadata: {
            applicationId: application.id,
            staffProfileId: application.staffProfileId,
            staffName: application.staffProfile.user.name,
          },
        },
      });
    } else {
      // Rejected
      await NotificationService.sendNotification({
        senderId: providerUserId,
        receiverId: application.staffProfile.user.id,
        title: "Application Rejected",
        message: `Your application to join ${businessProfile.businessName} has been rejected. ${rejectionReason}`,
        type: "APPLICATION_REJECTED",
        metadata: {
          applicationId: application.id,
          rejectionReason: rejectionReason,
        },
      });

      // Log activity
      await prisma.ProviderAdminActivityLog.create({
        data: {
          actorId: providerUserId,
          actorType: "PROVIDER",
          actionType: "REJECT_STAFF_APPLICATION",
          status: "SUCCESS",
          businessProfileId: businessProfile.id,
          metadata: {
            applicationId: application.id,
            staffProfileId: application.staffProfileId,
            staffName: application.staffProfile.user.name,
            rejectionReason: rejectionReason,
          },
        },
      });
    }

    res.status(200).json({
      success: true,
      msg: `Application ${applicationStatus.toLowerCase()} successfully.`,
      data: updatedApplication,
    });
  } catch (err) {
    console.error("Error responding to application:", err);
    res.status(500).json({
      success: false,
      msg: "Server Error: Could not respond to application.",
      err: err.message,
    });
  }
};

/* ---------------- BOOKING ASSIGNMENT WORKFLOW ---------------- */

/**
 * Get Available Staff for Booking
 * GET /api/v1/provider/bookings/:bookingId/available-staff
 * Provider can see staff available for a specific booking based on:
 * - Staff assigned to this service
 * - Staff availability on booking date/time
 */
const getAvailableStaffForBooking = async (req, res) => {
  const providerUserId = req.user.id;
  const { bookingId } = req.params;

  try {
    // Get provider's business profile
    const businessProfile = await prisma.BusinessProfile.findUnique({
      where: { userId: providerUserId },
    });

    if (!businessProfile) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found.",
      });
    }

    // Get booking details
    const booking = await prisma.Booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        msg: "Booking not found.",
      });
    }

    // Check if booking belongs to this provider's business
    if (booking.businessProfileId !== businessProfile.id) {
      return res.status(403).json({
        success: false,
        msg: "You don't have permission to view this booking.",
      });
    }

    // Get booking date and day of week
    const bookingDate = new Date(booking.date);
    const dayOfWeek = bookingDate.getDay();
    const dateStr = bookingDate.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Get staff assigned to this service
    const staffServiceAssignments = await prisma.StaffServiceAssignment.findMany({
      where: {
        businessProfileId: businessProfile.id,
        serviceId: booking.serviceId,
      },
      include: {
        staffProfile: {
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
      },
    });

    // Get staff profiles with availability
    const staffProfiles = await prisma.StaffProfile.findMany({
      where: {
        id: { in: staffServiceAssignments.map(s => s.staffProfileId) },
        businessProfileId: businessProfile.id,
        isActive: true,
        isApproved: true,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true,
          },
        },
        serviceAssignments: {
          where: { serviceId: booking.serviceId },
          include: {
            service: {
              select: {
                name: true,
              },
            },
          },
        },
        availability: {
          where: {
            OR: [
              { dayOfWeek: dayOfWeek },
              { date: dateStr },
            ],
          },
        },
        bookings: {
          where: {
            date: booking.date,
            bookingStatus: { in: ["CONFIRMED", "IN_PROGRESS"] },
          },
        },
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    // Analyze availability for each staff member
    const availableStaff = staffProfiles.map(staff => {
      // Check if staff has availability for this day
      const hasAvailability = staff.availability.length > 0;

      // Check if staff is already booked at this time
      const conflictingBookings = staff.bookings.length;
      const isAvailable = hasAvailability && conflictingBookings === 0;

      return {
        id: staff.id,
        name: staff.user.name,
        email: staff.user.email,
        mobile: staff.user.mobile,
        photo: staff.photo,
        specialization: staff.specialization,
        experience: staff.experience,
        skillLevel: staff.serviceAssignments[0]?.skillLevel || null,
        isPrimaryService: staff.serviceAssignments[0]?.isPrimaryService || false,
        availability: staff.availability,
        hasAvailability,
        conflictingBookings,
        isAvailable,
        totalBookings: staff._count.bookings,
      };
    });

    // Sort by: primary service first, then experience, then total bookings
    availableStaff.sort((a, b) => {
      if (a.isAvailable && !b.isAvailable) return -1;
      if (!a.isAvailable && b.isAvailable) return 1;
      if (a.isPrimaryService && !b.isPrimaryService) return -1;
      if (!a.isPrimaryService && b.isPrimaryService) return 1;
      return (b.experience || 0) - (a.experience || 0);
    });

    res.status(200).json({
      success: true,
      msg: "Available staff retrieved successfully.",
      data: {
        bookingId,
        bookingDate: booking.date,
        serviceId: booking.serviceId,
        serviceName: booking.service.name,
        availableStaff,
        summary: {
          total: availableStaff.length,
          available: availableStaff.filter(s => s.isAvailable).length,
          unavailable: availableStaff.filter(s => !s.isAvailable).length,
        },
      },
    });
  } catch (err) {
    console.error("Error getting available staff:", err);
    res.status(500).json({
      success: false,
      msg: "Server Error: Could not retrieve available staff.",
      err: err.message,
    });
  }
};

/**
 * Assign Staff to Booking
 * PATCH /api/v1/provider/bookings/:bookingId/assign-staff
 * Provider assigns a staff member to a booking
 */
const assignStaffToBooking = async (req, res) => {
  const providerUserId = req.user.id;
  const { bookingId } = req.params;

  const { error, value } = assignStaffToBookingSchema.validate(req.body);
  if (error) {
    return res.status(422).json({
      success: false,
      msg: error.details.map((e) => e.message),
    });
  }

  try {
    // Get provider's business profile
    const businessProfile = await prisma.BusinessProfile.findUnique({
      where: { userId: providerUserId },
    });

    if (!businessProfile) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found.",
      });
    }

    // Get booking
    const booking = await prisma.Booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        msg: "Booking not found.",
      });
    }

    // Check if booking belongs to this provider's business
    if (booking.businessProfileId !== businessProfile.id) {
      return res.status(403).json({
        success: false,
        msg: "You don't have permission to assign staff to this booking.",
      });
    }

    // Get staff profile
    const staffProfile = await prisma.StaffProfile.findUnique({
      where: { id: value.staffId },
      include: {
        user: true,
      },
    });

    if (!staffProfile) {
      return res.status(404).json({
        success: false,
        msg: "Staff profile not found.",
      });
    }

    // Check if staff belongs to this business
    if (staffProfile.businessProfileId !== businessProfile.id) {
      return res.status(400).json({
        success: false,
        msg: "This staff member doesn't work for your business.",
      });
    }

    // Check if staff is active and approved
    if (!staffProfile.isActive || !staffProfile.isApproved) {
      return res.status(400).json({
        success: false,
        msg: "This staff member is not active or approved.",
      });
    }

    // Check if staff is assigned to this service
    const serviceAssignment = await prisma.StaffServiceAssignment.findUnique({
      where: {
        staffProfileId_serviceId_businessProfileId: {
          staffProfileId: value.staffId,
          serviceId: booking.serviceId,
          businessProfileId: businessProfile.id,
        },
      },
    });

    if (!serviceAssignment) {
      return res.status(400).json({
        success: false,
        msg: "This staff member is not assigned to this service.",
      });
    }

    // Update booking with staff assignment
    const updatedBooking = await prisma.Booking.update({
      where: { id: bookingId },
      data: {
        staffId: value.staffId,
        bookingStatus: "CONFIRMED",
      },
      include: {
        staff: {
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
      },
    });

    // Send notification to staff
    await NotificationService.sendNotification({
      senderId: providerUserId,
      receiverId: staffProfile.user.id,
      title: "New Booking Assigned",
      message: `You have been assigned to a new booking for ${booking.service.name} on ${booking.date}.`,
      type: "BOOKING_ASSIGNED",
      metadata: {
        bookingId: booking.id,
        serviceId: booking.serviceId,
        serviceName: booking.service.name,
        date: booking.date,
      },
    });

    // Log activity
    await prisma.ProviderAdminActivityLog.create({
      data: {
        actorId: providerUserId,
        actorType: "PROVIDER",
        actionType: "ASSIGN_STAFF_TO_BOOKING",
        status: "SUCCESS",
        businessProfileId: businessProfile.id,
        bookingId: booking.id,
        metadata: {
          staffId: value.staffId,
          staffName: staffProfile.user.name,
        },
      },
    });

    res.status(200).json({
      success: true,
      msg: "Staff assigned to booking successfully.",
      data: updatedBooking,
    });
  } catch (err) {
    console.error("Error assigning staff to booking:", err);
    res.status(500).json({
      success: false,
      msg: "Server Error: Could not assign staff to booking.",
      err: err.message,
    });
  }
};

/**
 * Remove Staff from Booking
 * PATCH /api/v1/provider/bookings/:bookingId/remove-staff
 * Provider removes staff assignment from a booking
 */
const removeStaffFromBooking = async (req, res) => {
  const providerUserId = req.user.id;
  const { bookingId } = req.params;

  try {
    // Get provider's business profile
    const businessProfile = await prisma.BusinessProfile.findUnique({
      where: { userId: providerUserId },
    });

    if (!businessProfile) {
      return res.status(404).json({
        success: false,
        msg: "Business profile not found.",
      });
    }

    // Get booking
    const booking = await prisma.Booking.findUnique({
      where: { id: bookingId },
      include: {
        staff: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        msg: "Booking not found.",
      });
    }

    // Check if booking belongs to this provider's business
    if (booking.businessProfileId !== businessProfile.id) {
      return res.status(403).json({
        success: false,
        msg: "You don't have permission to modify this booking.",
      });
    }

    if (!booking.staffId) {
      return res.status(400).json({
        success: false,
        msg: "No staff is assigned to this booking.",
      });
    }

    // Remove staff assignment
    const updatedBooking = await prisma.Booking.update({
      where: { id: bookingId },
      data: {
        staffId: null,
      },
    });

    // Send notification to staff
    await NotificationService.sendNotification({
      senderId: providerUserId,
      receiverId: booking.staff.user.id,
      title: "Booking Assignment Removed",
      message: `Your assignment to the booking on ${booking.date} has been removed.`,
      type: "BOOKING_UNASSIGNED",
      metadata: {
        bookingId: booking.id,
      },
    });

    // Log activity
    await prisma.ProviderAdminActivityLog.create({
      data: {
        actorId: providerUserId,
        actorType: "PROVIDER",
        actionType: "REMOVE_STAFF_FROM_BOOKING",
        status: "SUCCESS",
        businessProfileId: businessProfile.id,
        bookingId: booking.id,
        metadata: {
          previousStaffId: booking.staffId,
          staffName: booking.staff.user.name,
        },
      },
    });

    res.status(200).json({
      success: true,
      msg: "Staff removed from booking successfully.",
      data: updatedBooking,
    });
  } catch (err) {
    console.error("Error removing staff from booking:", err);
    res.status(500).json({
      success: false,
      msg: "Server Error: Could not remove staff from booking.",
      err: err.message,
    });
  }
};

module.exports = {
  // Staff Profile Management
  createStaffProfile,
  getStaffProfiles,
  getStaffProfileById,
  updateStaffProfile,
  deleteStaffProfile,

  // Service Assignments
  assignServiceToStaff,
  getStaffServiceAssignments,
  removeServiceAssignment,
  updateServiceAssignment,

  // Availability Management
  setStaffAvailability,
  getStaffAvailability,

  // Booking Management (Staff)
  getStaffAssignedBookings,
  updateBookingStatusByStaff,

  // Staff Dashboard
  getStaffDashboardStats,

  // Earnings Management
  getStaffEarnings,

  // Global Staff Features
  registerAsGlobalStaff,

  // Admin Features
  approveGlobalStaff,

  // Business Application Workflow
  browseBusinesses,
  applyToBusiness,
  getMyApplications,
  getBusinessApplications,
  respondToApplication,

  // Booking Assignment Workflow
  getAvailableStaffForBooking,
  assignStaffToBooking,
  removeStaffFromBooking,
};
