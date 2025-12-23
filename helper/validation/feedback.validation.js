const Joi = require("joi");

/* ---------------- FEEDBACK VALIDATION SCHEMA ---------------- */
const FeedbackValidation = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().trim().min(2).max(200),
  serviceId: Joi.string().required(),
});

module.exports = {
  FeedbackValidation,
};
