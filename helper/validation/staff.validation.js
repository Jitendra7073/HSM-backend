const Joi = require("joi");

/* ---------------- STAFF PROFILE VALIDATION ---------------- */
const createStaffProfileSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  name: Joi.string().min(3).max(50).required(),
  mobile: Joi.string()
    .pattern(/^[0-9]{10}$/)
    .required(),
  password: Joi.string().min(6).required(),
  employmentType: Joi.string()
    .valid("BUSINESS_BASED", "GLOBAL_FREELANCE")
    .default("BUSINESS_BASED"),
  specialization: Joi.array()
    .items(Joi.string().min(2).max(50))
    .min(1)
    .required(),
  experience: Joi.number()
    .min(0)
    .max(50)
    .optional()
    .default(0),
  bio: Joi.string()
    .max(500)
    .optional()
    .allow(""),
  photo: Joi.string()
    .uri()
    .optional()
    .allow(null, ""),
});

const updateStaffProfileSchema = Joi.object({
  name: Joi.string().min(3).max(50).optional(),
  mobile: Joi.string()
    .pattern(/^[0-9]{10}$/)
    .optional(),
  specialization: Joi.array()
    .items(Joi.string().min(2).max(50))
    .min(1)
    .optional(),
  experience: Joi.number()
    .min(0)
    .max(50)
    .optional(),
  bio: Joi.string()
    .max(500)
    .optional()
    .allow(""),
  photo: Joi.string()
    .uri()
    .optional()
    .allow(null, ""),
  isActive: Joi.boolean().optional(),
});

/* ---------------- SERVICE ASSIGNMENT VALIDATION ---------------- */
const assignServiceSchema = Joi.object({
  staffId: Joi.string().uuid().required(),
  serviceId: Joi.string().required(),
  skillLevel: Joi.string()
    .valid("BEGINNER", "INTERMEDIATE", "EXPERT")
    .optional()
    .default("INTERMEDIATE"),
  isPrimaryService: Joi.boolean()
    .optional()
    .default(false),
});

const updateServiceAssignmentSchema = Joi.object({
  skillLevel: Joi.string()
    .valid("BEGINNER", "INTERMEDIATE", "EXPERT")
    .optional(),
  isPrimaryService: Joi.boolean().optional(),
});

/* ---------------- AVAILABILITY VALIDATION ---------------- */
const setAvailabilitySchema = Joi.object({
  // Recurring weekly schedule
  weeklySchedule: Joi.array()
    .items(
      Joi.object({
        dayOfWeek: Joi.number()
          .min(0)
          .max(6)
          .required(),
        startTime: Joi.string()
          .pattern(/^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)$/)
          .required(),
        endTime: Joi.string()
          .pattern(/^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)$/)
          .required(),
        isAvailable: Joi.boolean()
          .optional()
          .default(true),
      })
    )
    .optional(),

  // Specific date availability
  dateAvailability: Joi.array()
    .items(
      Joi.object({
        date: Joi.string()
          .pattern(/^\d{4}-\d{2}-\d{2}$/)
          .required(),
        startTime: Joi.string()
          .pattern(/^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)$/)
          .required(),
        endTime: Joi.string()
          .pattern(/^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)$/)
          .required(),
        isAvailable: Joi.boolean()
          .optional()
          .default(true),
      })
    )
    .optional(),
})
  .or("weeklySchedule", "dateAvailability")
  .messages({
    "object.missing": "Either weeklySchedule or dateAvailability must be provided",
  });

/* ---------------- BOOKING STAFF ASSIGNMENT VALIDATION ---------------- */
const assignStaffToBookingSchema = Joi.object({
  staffId: Joi.string().uuid().required(),
});

/* ---------------- BOOKING STATUS UPDATE (BY STAFF) ---------------- */
const updateBookingStatusSchema = Joi.object({
  status: Joi.string()
    .valid("CONFIRMED", "IN_PROGRESS", "COMPLETED")
    .required(),
  notes: Joi.string()
    .max(500)
    .optional()
    .allow(""),
});

/* ---------------- STAFF EARNINGS VALIDATION ---------------- */
const processStaffPaymentSchema = Joi.object({
  earningIds: Joi.array()
    .items(Joi.string().uuid())
    .min(1)
    .required(),
  paymentMethod: Joi.string()
    .valid("BANK_TRANSFER", "CASH", "UPI", "OTHER")
    .required(),
  notes: Joi.string()
    .max(500)
    .optional()
    .allow(""),
});

/* ---------------- GLOBAL STAFF VALIDATION ---------------- */
const registerAsGlobalStaffSchema = Joi.object({
  specialization: Joi.array()
    .items(Joi.string().min(2).max(50))
    .min(1)
    .required(),
  experience: Joi.number()
    .min(0)
    .max(50)
    .optional()
    .default(0),
  bio: Joi.string()
    .max(500)
    .optional()
    .allow(""),
  photo: Joi.string()
    .uri()
    .optional()
    .allow(null, ""),
});

const applyToBusinessSchema = Joi.object({
  businessProfileId: Joi.string().uuid().required(),
  coverLetter: Joi.string()
    .max(1000)
    .optional()
    .allow("", null),
});

module.exports = {
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
};
