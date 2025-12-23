const Joi = require("joi")

/* ---------------- ADDRESS VALIDATION SCHEMA ---------------- */
const AddressValidation = Joi.object({
  street: Joi.string().trim().min(3).max(100).required(),
  city: Joi.string().trim().min(2).max(50).required(),
  state: Joi.string().trim().min(2).max(50).required(),
  postalCode: Joi.string().trim().pattern(/^[0-9]{5,6}$/).required(),
  country: Joi.string().trim().min(2).max(50).required(),
  type:Joi.string().trim().min(4).max(10).required(),
  landmark: Joi.string().trim().allow("").max(100),
});


module.exports = {
  AddressValidation
}