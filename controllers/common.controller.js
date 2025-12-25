const prisma = require("../prismaClient");

const {
  AddressValidation,
} = require("../helper/validation/address.validation");
const jwt = require("jsonwebtoken");

/* ---------------- GET USER PROFILE ---------------- */
const getUserProfile = async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        role: true,
        createdAt: true,
        addresses: true, // include all addresses
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
      return res.status(404).json({ success: false, msg: "User not found." });
    }

    return res.status(200).json({
      success: true,
      msg: "User profile fetched successfully.",
      user,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch user profile.",
    });
  }
};

/* ---------------- GET ME ---------------- */
const getMe = async (req, res) => {
  const token = req.params.token;
  const user = jwt.verify(token, process.env.JWT_SECRET_KEY);
  if (!token || !user) {
    return res.status(400).json({ success: false, message: "Invalid Token" });
  }
  const userId = user.id;

  try {
    const userData = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        role: true,
        createdAt: true,
      },
    });
    return res.status(200).json({ success: true, user: userData });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ---------------- DELETE PROFILE ---------------- */
const deleteProfile = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({
      success: false,
      msg: "User Id is required.",
    });
  }
  try {
    const res = await prisma.user.delete({
      where: { id: userId },
    });
    return res.status(200).json({
      success: true,
      msg: "User deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not delete user.",
    });
  }
};

/* ---------------- GET ADDRESS ---------------- */
const getAddress = async (req, res) => {
  const userId = req.user.id;

  try {
    const address = await prisma.Address.findMany({
      where: { userId },
    });

    return res.status(200).json({
      success: true,
      msg: "Address fetched successfully.",
      address,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch address.",
    });
  }
};

/* ---------------- ADD ADDRESS ---------------- */
const addAddress = async (req, res) => {
  const userId = req.user.id;
  const { error, value } = AddressValidation.validate(req.body);

  if (error) {
    return res.status(400).send({
      success: false,
      msg: error.details.map((e) => e.message),
    });
  }
  try {
    const isTooMuchAddress = await prisma.Address.findMany({
      where: { userId },
    });

    if (isTooMuchAddress.length >= 5) {
      return res.status(400).send({
        success: false,
        msg: "You already added Maximum Addresses.",
      });
    }

    const newAddress = await prisma.Address.create({
      data: { ...value, userId },
    });
    return res.status(201).send({
      success: true,
      msg: "Address created successfully.",
      address: newAddress,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      msg: "Server Error: Could not create address.",
    });
  }
};

/* ---------------- DELETE ADDRESS ---------------- */
const deleteAddress = async (req, res) => {
  const userId = req.user.id;
  const { addressId } = req.params;

  try {
    const address = await prisma.Address.findFirst({
      where: {
        id: addressId,
        userId,
      },
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        msg: "Address not found.",
      });
    }

    const confirmedBookingExists = await prisma.Booking.findFirst({
      where: {
        addressId: addressId,
        bookingStatus: "CONFIRMED",
      },
    });

    if (confirmedBookingExists) {
      return res.status(400).json({
        success: false,
        msg: "This address is associated with a booking which may not be completed yet!",
      });
    }

    await prisma.Address.delete({
      where: { id: addressId },
    });

    return res.status(200).json({
      success: true,
      msg: "Address deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Server error while deleting address.",
    });
  }
};

module.exports = {
  getUserProfile,
  addAddress,
  deleteAddress,
  getAddress,
  getMe,
  deleteProfile,
};
