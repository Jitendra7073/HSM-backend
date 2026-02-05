const prisma = require("../prismaClient");

const {
  AddressValidation,
} = require("../helper/validation/address.validation");

/* ---------------- GET ADDRESS ---------------- */
const getAddress = async (req, res) => {
  const userId = req.user.id;

  try {
    const addresses = await prisma.address.findMany({
      where: { userId },
    });

    return res.status(200).json({
      success: true,
      msg: "Address fetched successfully.",
      addresses, // Changed from 'address' to 'addresses' to match frontend expectation
    });
  } catch (error) {
    console.error("Error fetching addresses:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch address.",
      error: error.message,
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
    const isTooMuchAddress = await prisma.address.findMany({
      where: { userId },
    });

    if (isTooMuchAddress.length >= 5) {
      return res.status(400).send({
        success: false,
        msg: "You already added Maximum Addresses.",
      });
    }

    const newAddress = await prisma.address.create({
      data: { ...value, userId },
    });

    if (req.user.role === "customer") {
      // create log
      await prisma.customerActivityLog.create({
        data: {
          customerId: userId,
          actionType: "ADDRESS_ADDED",
          status: "SUCCESS",
          metadata: {
            addressId: newAddress.id,
            role: req.user.role,
          },
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
    }

    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: req.user.role,
        actionType: "ADDRESS_ADDED",
        status: "SUCCESS",
        metadata: {
          addressId: newAddress.id,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
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
    const address = await prisma.address.findFirst({
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

    await prisma.address.delete({
      where: { id: addressId },
    });

    if (req.user.role === "customer") {
      // create log
      await prisma.customerActivityLog.create({
        data: {
          customerId: userId,
          actionType: "ADDRESS_DELETED",
          status: "SUCCESS",
          metadata: {
            addressId: addressId,
          },
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
    } else {
      await prisma.providerAdminActivityLog.create({
        data: {
          actorId: userId,
          actorType: req.user.role,
          actionType: "ADDRESS_DELETED",
          status: "SUCCESS",
          metadata: {
            addressId: addressId,
          },
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
    }

    return res.status(200).json({
      success: true,
      msg: "Address deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Unable to delete it, processed with other!",
    });
  }
};

module.exports = {
  addAddress,
  deleteAddress,
  getAddress,
};
