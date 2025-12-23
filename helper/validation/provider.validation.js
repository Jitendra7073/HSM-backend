const Joi = require("joi");

/* ---------------- BUSINESS PROFILE SCHEMA ---------------- */
const businessProfileSchema = Joi.object({
  businessName: Joi.string().trim().min(3).max(50).required(),
  businessCategoryId: Joi.string().trim().required(),
  contactEmail: Joi.string().email().lowercase().trim().required(),
  phoneNumber: Joi.string()
    .pattern(/^[0-9]{10}$/)
    .required(),
  websiteURL: Joi.string().trim().uri(),
  socialLinks: Joi.array().items(Joi.string().uri()),
  isActive: Joi.boolean().default(true),
});

/* ---------------- SERVICE PROFILE SCHEMA ---------------- */
const serviceProfileSchema = Joi.object({
  name: Joi.string().min(5).max(50).required(),
  description: Joi.string().min(10).max(200).required(),
  durationInMinutes: Joi.number().positive().required(),
  price: Joi.number().min(1).required(),
  totalBookingAllow:Joi.number().positive().required(),
  currency: Joi.string().valid("INR", "USD", "EUR").default("INR"),
  isActive: Joi.boolean().default(true),
  coverImage: Joi.string().uri().optional().allow(null),
  images: Joi.array().items(Joi.string().uri()).default([]),
  averageRating: Joi.number().min(0).max(5).default(0),
  reviewCount: Joi.number().integer().min(0).default(0),
});

/* ---------------- SLOT PROFILE SCHEMA ---------------- */
const slotProfileSchema = Joi.object({
  time: Joi.string()
    .pattern(/^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)$/)
    .required(),
});

/* ---------------- TEAM MEMBER SCHEMA ---------------- */
const teamMemberSchema = Joi.object({
  name: Joi.string().trim().min(3).max(50).required(),
  role: Joi.string().trim().min(2).max(50).required(),
  description: Joi.string().trim().max(500).allow('').optional(),
  status: Joi.string()
    .valid('Available', 'Busy', 'Off')
    .default('Available'),
  phone: Joi.string()
    .pattern(/^[0-9]{10}$/)
    .required(),
  email: Joi.string().email().lowercase().trim().required(),
});
module.exports = {
  businessProfileSchema,
  serviceProfileSchema,
  slotProfileSchema,
  teamMemberSchema
};
