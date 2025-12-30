const prisma = require("../prismaClient");
const {
  slotBookingRequestTemplate,
} = require("../helper/mail-tamplates/tamplates");
const { sendMail } = require("../utils/sendmail");
const {
  FeedbackValidation,
} = require("../helper/validation/feedback.validation");

/* ---------------- GET ALL PROVIDERS ---------------- */
const getAllProviders = async (req, res) => {
  try {
    const providers = await prisma.user.findMany({
      where: {
        role: "provider",

        // subscribed providers
        providerSubscription: {
          status: "active",
          currentPeriodEnd: {
            gt: new Date(), // not expired
          },
        },

        // active businesses
        businessProfile: {
          isActive: true,
        },
      },

      select: {
        id: true,
        name: true,
        mobile: true,

        businessProfile: {
          select: {
            id: true,
            businessName: true,
            isActive: true,

            services: {
              where: {
                isActive: true,
              },
              select: {
                id: true,
                name: true,
                category: true,
                durationInMinutes: true,
                price: true,
              },
            },
          },
        },

        addresses: true,
      },
    });

    if (!providers.length) {
      return res.status(200).json({
        success: true,
        msg: "No subscribed providers available.",
        count: 0,
        providers: [],
      });
    }

    return res.status(200).json({
      success: true,
      msg: "Subscribed providers fetched successfully.",
      count: providers.length,
      providers,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch providers.",
    });
  }
};

/* ---------------- GET PROVIDER BY ID ---------------- */
const getProviderById = async (req, res) => {
  const { providerId } = req.params;

  try {
    const provider = await prisma.user.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        businessProfile: {
          select: {
            id: true,
            businessName: true,
            contactEmail: true,
            phoneNumber: true,
            websiteURL: true,
            isActive: true,
            socialLinks: true,
            services: {
              select: {
                id: true,
                name: true,
                category: true,
                durationInMinutes: true,
                currency: true,
                price: true,
                coverImage: true,
                images: true,
                averageRating: true,
                reviewCount: true,
                totalBookingAllow:true,
                isActive: true,
                feedback: true,
              },
            },
            slots: {
              select: {
                id: true,
                time: true,
              },
            },
          },
        },
        addresses: true,
      },
    });

    if (!provider) {
      return res
        .status(404)
        .json({ success: false, msg: "Provider not found." });
    }

    return res.status(200).json({
      success: true,
      msg: "Provider fetched successfully.",
      provider,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, msg: "Server Error: Could not fetch provider." });
  }
};

/* ---------------- GET CUSTOMER BOOKINGS ---------------- */
const getCustomerBookings = async (req, res) => {
  const customerId = req.user.id;

  try {
    const currentTime = new Date();

    const bookings = await prisma.booking.findMany({
      where: { userId: customerId },

      include: {
        service: {
          select: {
            name: true,
          },
        },
        businessProfile: {
          select: {
            businessName: true,
            user: {
              select: {
                email: true,
                mobile: true,
              },
            },
          },
        },
        slot: {
          select: {
            time: true,
          },
        },
        address: true,
      },

      orderBy: { createdAt: "desc" },
    });

    const formatted = bookings.map((b) => {
      let paymentLinkInfo = null;

      // Only show payment link for pending payments that haven't expired
      if (
        b.bookingStatus === "PENDING_PAYMENT" &&
        b.paymentStatus === "PENDING" &&
        b.paymentLink &&
        b.expiresAt &&
        new Date(b.expiresAt) > currentTime
      ) {
        const timeLeftMs = new Date(b.expiresAt) - currentTime;
        const timeLeftMinutes = Math.floor(timeLeftMs / (1000 * 60));
        const timeLeftSeconds = Math.floor((timeLeftMs % (1000 * 60)) / 1000);

        paymentLinkInfo = {
          url: b.paymentLink,
          timeLeftMinutes,
          timeLeftSeconds,
          expiresAt: b.expiresAt,
        };
      }

      return {
        ...b,
        business: {
          id: b.businessProfile?.id,
          name: b.businessProfile?.businessName,
          email: b.businessProfile?.user?.email,
          phone: b.businessProfile?.user?.mobile,
        },
        paymentLinkInfo,
        businessProfile: undefined,
      };
    });

    return res.status(200).json({
      success: true,
      msg: "Bookings fetched successfully.",
      count: formatted.length,
      bookings: formatted,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, msg: "Could not fetch bookings." });
  }
};

/* ---------------- CANCEL BOOKING ---------------- */
const cancelBooking = async (req, res) => {
  const customerId = req.user.id;
  const { bookingId } = req.body;

  try {
    const booking = await prisma.Booking.findUnique({
      where: { id: bookingId },
    });

    // Validate booking ownership
    if (!booking || booking.userId !== customerId) {
      return res
        .status(404)
        .json({ success: false, msg: "Booking not found or not yours." });
    }

    // Only allow cancelling pending bookings
    if (booking.bookingStatus !== "PENDING") {
      return res.status(400).json({
        success: false,
        msg: `Cannot cancel a ${booking.bookingStatus.toLowerCase()} booking.`,
      });
    }

    // Update booking status to CANCELLED
    await prisma.Booking.update({
      where: { id: bookingId },
      data: {
        bookingStatus: "CANCELLED",
        paymentStatus: "CANCELLED",
        updatedAt: new Date(),
      },
    });

    await prisma.Slot.update({
      where: { id: booking.slotId },
      data: { isBooked: false, bookedById: null },
    });

    // Update payment record
    if (booking.payment) {
      await prisma.CustomerPayment.update({
        where: { id: booking.payment.id },
        data: {
          status: "CANCELLED",
        },
      });
    }

    return res
      .status(200)
      .json({ success: true, msg: "Booking cancelled successfully." });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, msg: "Could not cancel booking." });
  }
};

/* ---------------- GET ALL SERVICES ---------------- */
const getAllServices = async (req, res) => {
  try {
    const services = await prisma.service.findMany();
    return res.status(200).json({
      success: true,
      msg: "Services fetched successfully.",
      count: services.length,
      services,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, msg: "Could not fetch services." });
  }
};

/* ---------------- GET CART ITEMS ---------------- */
const getCart = async (req, res) => {
  const userId = req.user.id;

  try {
    const cart = await prisma.Cart.findMany({
      where: { userId },
      select: {
        id: true,
        date: true,
        business: {
          select: {
            id: true,
            businessName: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
        slot: {
          select: {
            id: true,
            time: true,
          },
        },
      },
    });

    if (cart.length === 0) {
      return res.status(200).json({
        success: true,
        msg: "Cart is empty.",
        totalItems: 0,
        totalPrice: 0,
      });
    }

    const totalItems = cart.length;
    const totalPrice = cart.reduce((sum, item) => sum + item.service.price, 0);

    return res.status(200).json({
      success: true,
      msg: "Cart fetched successfully.",
      totalItems,
      totalPrice,
      cart,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, msg: "Could not fetch cart." });
  }
};

/* ---------------- ADD ITEM TO CART ---------------- */
const addToCart = async (req, res) => {
  const userId = req.user.id;
  const { serviceId, businessId, slotId, date } = req.body;

  try {
    // ==== Check if business exists ====
    const business = await prisma.BusinessProfile.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      return res.status(404).json({
        success: false,
        msg: "Business does not exist.",
      });
    }

    // ==== Check if service exists ====
    const service = await prisma.Service.findUnique({
      where: { id: serviceId },
    });
    if (!service) {
      return res.status(404).json({
        success: false,
        msg: "Service not found.",
      });
    }

    // ==== Check if slot exists ====
    const slot = await prisma.Slot.findUnique({ where: { id: slotId } });
    if (!slot) {
      return res.status(404).json({
        success: false,
        msg: "Slot does not exist.",
      });
    }

    const isoDate = new Date(date).toISOString();

    // ==== Prevent duplicate cart entries ====
    const existing = await prisma.Cart.findFirst({
      where: {
        userId,
        serviceId,
        slotId,
        date: isoDate,
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        msg: "This service & slot is already in your cart.",
      });
    }

    // ==== Add to cart ====
    const added = await prisma.Cart.create({
      data: {
        userId,
        serviceId,
        businessId,
        slotId,
        date: isoDate,
      },
    });

    return res.status(201).json({
      success: true,
      msg: "Service added to cart successfully.",
      cart: added,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: "Internal server error while adding to cart.",
    });
  }
};

/* ---------------- REMOCVE ITEM FROM CART ---------------- */
const removeItemFromCart = async (req, res) => {
  try {
    const { cartId } = req.body;

    if (!cartId) {
      return res.status(400).json({
        success: false,
        msg: "cartId is required.",
      });
    }

    const cartItem = await prisma.Cart.findUnique({
      where: { id: cartId },
    });

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        msg: "Item not found in cart.",
      });
    }

    await prisma.Cart.delete({
      where: { id: cartId },
    });

    return res.status(200).json({
      success: true,
      msg: "Item removed from your cart.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not remove item from cart",
    });
  }
};

/* ---------------- GET ALL FEEDBACK ---------------- */
const getAllFeedback = async (req, res) => {
  const userId = req.user.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      msg: "Unauthorized: User not logged in",
    });
  }

  try {
    const feedbacks = await prisma.Feedback.findMany({
      where: { userId: userId },
    });

    return res.status(200).json({
      success: true,
      msg: "All feedbacks",
      feedbacks,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Server error: unable to get your feedbacks!",
    });
  }
};

/* ---------------- GIVE FEEDBACK ---------------- */
const giveFeedback = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      msg: "Unauthorized: User not logged in",
    });
  }

  const { error, value } = FeedbackValidation.validate(req.body, {
    abortEarly: false,
  });

  if (error) {
    return res.status(422).json({
      success: false,
      msg: error.details.map((e) => e.message),
    });
  }

  const { rating, comment, bookingId } = value;

  try {
    /* ---------------- USER INFORMATION ---------------- */
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    /* ---------------- BOOKING CHECK ---------------- */
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        msg: "Booking not found",
      });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({
        success: false,
        msg: "You are not allowed to give feedback for this booking",
      });
    }

    if (booking.bookingStatus !== "COMPLETED") {
      return res.status(400).json({
        success: false,
        msg: "You can give feedback only after service completion",
      });
    }

    /* ---------------- DUPLICATE FEEDBACK CHECK ---------------- */
    const existingFeedback = await prisma.feedback.findUnique({
      where: { bookingId },
    });

    if (existingFeedback) {
      return res.status(409).json({
        success: false,
        msg: "Feedback already submitted for this booking",
      });
    }

    /* ---------------- TRANSACTION ---------------- */
    const feedback = await prisma.$transaction(async (tx) => {
      const feedback = await tx.feedback.create({
        data: {
          userId,
          serviceId: booking.serviceId,
          bookingId,
          username: user.name,
          servicename: booking.service.name,
          rating,
          comment,
        },
      });

      /* ---------------- UPDATE SERVICE RATING ---------------- */
      const allRatings = await tx.feedback.aggregate({
        where: { serviceId: booking.serviceId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      await tx.service.update({
        where: { id: booking.serviceId },
        data: {
          averageRating: Number(allRatings._avg.rating.toFixed(1)),
          reviewCount: allRatings._count.rating,
        },
      });

      /* ---------------- MARK BOOKING ---------------- */
      await tx.booking.update({
        where: { id: bookingId },
        data: { isFeedbackProvided: true },
      });

      return feedback;
    });

    return res.status(201).json({
      success: true,
      msg: "Feedback submitted successfully",
      feedback,
    });
  } catch (error) {
    console.error("Give Feedback Error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server error: unable to save your feedback",
    });
  }
};

module.exports = {
  getAllProviders,
  getProviderById,
  getCustomerBookings,
  cancelBooking,
  getAllServices,
  getCart,
  addToCart,
  removeItemFromCart,
  getAllFeedback,
  giveFeedback,
};
