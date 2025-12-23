const Joi = require("joi");

/* ---------------- UPDATE BOOKING SCHEMA  ---------------- */
const updateBookingStatusValidation = Joi.object({
  status: Joi.string()
    .message("This action is only performed after changing the status")
    .valid(
      "Pending",
      "Confirmed",
      "Inprogress",
      "Onhold",
      "Completed",
      "Cancelled",
      "Rejected",
      "Failed",
      "Refunded",
      "Closed"
    )
    .required(),
  reason: Joi.string().trim().min(5).max(200).optional(),
});

module.exports = {
  updateBookingStatusValidation,
};
