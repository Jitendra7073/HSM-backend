const Joi = require("joi");

// Card details validation schema
const StaffCardDetailsValidation = Joi.object({
  cardNumber: Joi.string()
    .pattern(/^[0-9]{13,19}$/)
    .required()
    .messages({
      "string.pattern.base": "Card number must be 13-19 digits",
      "any.required": "Card number is required",
    }),

  cardholderName: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      "string.min": "Cardholder name must be at least 2 characters",
      "string.max": "Cardholder name cannot exceed 100 characters",
      "any.required": "Cardholder name is required",
    }),

  expiryMonth: Joi.number()
    .integer()
    .min(1)
    .max(12)
    .required()
    .messages({
      "number.min": "Expiry month must be between 1 and 12",
      "number.max": "Expiry month must be between 1 and 12",
      "any.required": "Expiry month is required",
    }),

  expiryYear: Joi.number()
    .integer()
    .min(new Date().getFullYear())
    .max(new Date().getFullYear() + 20)
    .required()
    .messages({
      "number.min": "Card has expired",
      "number.max": "Invalid expiry year",
      "any.required": "Expiry year is required",
    }),

  cvv: Joi.string()
    .pattern(/^[0-9]{3,4}$/)
    .required()
    .messages({
      "string.pattern.base": "CVV must be 3 or 4 digits",
      "any.required": "CVV is required",
    }),

  cardType: Joi.string()
    .valid("visa", "mastercard", "amex", "discover", "rupay")
    .required()
    .messages({
      "any.only": "Invalid card type",
      "any.required": "Card type is required",
    }),

  isDefault: Joi.boolean().optional(),
});

module.exports = {
  StaffCardDetailsValidation,
};
