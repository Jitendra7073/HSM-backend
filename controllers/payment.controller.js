const prisma = require("../prismaClient");
const Stripe = require("stripe");

/* ---------------- CUSTOMER PAYMENT ---------------- */
const customerPayment = async (req, res) => {
  const userId = req.user.id;

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { cartItems, addressId } = req.body;

    /* ---------- BASIC VALIDATION ---------- */
    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ msg: "Cart is empty" });
    }

    if (!addressId) {
      return res.status(400).json({ msg: "Address required" });
    }

    /* ---------- FETCH CART ---------- */
    const dbCart = await prisma.cart.findMany({
      where: { id: { in: cartItems }, userId },
      include: {
        service: true,
        business: true,
        slot: true,
      },
    });

    if (!dbCart.length) {
      return res.status(400).json({ msg: "Invalid cart items" });
    }

    /* ---------- SAME BUSINESS CHECK ---------- */
    const businessIds = [...new Set(dbCart.map((c) => c.business.id))];
    if (businessIds.length > 1) {
      return res.status(400).json({
        msg: "Only same-business services allowed",
      });
    }

    /* ---------- DUPLICATE BOOKING CHECK ---------- */
    const alreadyBooked = await prisma.booking.findFirst({
      where: {
        userId,
        OR: dbCart.map((item) => ({
          serviceId: item.serviceId,
          slotId: item.slotId,
          date: item.date,
          bookingStatus: {
            in: ["CONFIRMED", "PENDING_PAYMENT"],
          },
        })),
      },
    });

    if (alreadyBooked) {
      return res.status(400).json({
        msg: `You already booked a slot for ${alreadyBooked.date}`,
      });
    }

    /* ---------- CALCULATE TOTAL ---------- */
    const totalAmount = dbCart.reduce(
      (sum, item) => sum + item.service.price,
      0
    );

    /* --------------------------- SLOT RESERVATION WITH LOCKING --------------------------- */
    let reservedBookings;
    
    try {
      reservedBookings = await prisma.$transaction(
        async (tx) => {
          const bookings = [];

          for (const item of dbCart) {
            // Get service with slot limit
            const service = await tx.service.findUnique({
              where: { id: item.serviceId },
              select: { totalBookingAllow: true },
            });

            if (!service) {
              throw new Error(`Service ${item.serviceId} not found`);
            }

            // Count existing VALID bookings (not expired)
            const count = await tx.booking.count({
              where: {
                serviceId: item.serviceId,
                slotId: item.slotId,
                date: item.date,
                bookingStatus: {
                  in: ["CONFIRMED", "PENDING_PAYMENT"],
                },
                OR: [
                  { expiresAt: null }, // Confirmed bookings
                  { expiresAt: { gt: new Date() } }, // Non-expired pending
                ],
              },
            });

            // CHECK IF SLOT IS FULL
            if (count >= service.totalBookingAllow) {
              throw new Error(
                `Slot ${item.slot?.time || "Unknown"} is full for ${item.service.name}`
              );
            }
            await new Promise((r) => setTimeout(r, 5000));

            // Create booking reservation
            const booking = await tx.booking.create({
              data: {
                addressId,
                userId,
                serviceId: item.serviceId,
                businessProfileId: item.business.id,
                slotId: item.slotId,
                date: item.date,
                totalAmount: item.service.price, // Individual amount per booking
                bookingStatus: "PENDING_PAYMENT",
                paymentStatus: "PENDING",
                expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min lock
              },
            });

            bookings.push(booking);
          }

          return bookings;
        },
        {
          isolationLevel: "Serializable", 
          timeout: 10000, // 10 second timeout
        }
      );
    } catch (transactionError) {
      console.error("Slot reservation failed:", transactionError.message);
      
      // Return user-friendly error
      return res.status(409).json({
        msg: transactionError.message || "Slot reservation failed. Please try again.",
      });
    }

    /* ---------- CREATE PAYMENT RECORD ---------- */
    const paymentRecord = await prisma.customerPayment.create({
      data: {
        userId,
        addressId,
        amount: totalAmount,
        status: "PENDING",
        bookingIds: JSON.stringify(reservedBookings.map((b) => b.id)),
      },
    });

    /* ---------- STRIPE CHECKOUT ---------- */
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      metadata: {
        userId,
        addressId,
        paymentId: paymentRecord.id,
        bookingIds: JSON.stringify(reservedBookings.map((b) => b.id)),
        dbCart: JSON.stringify(cartItems), 
      },
      line_items: dbCart.map((item) => ({
        price_data: {
          currency: "inr",
          product_data: { name: item.service.name },
          unit_amount: item.service.price * 100,
        },
        quantity: 1,
      })),
      success_url: `${process.env.FRONTEND_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.FRONTEND_CANCEL_URL,
    });

    /* ---------- STORE PAYMENT LINK IN BOOKINGS ---------- */
    await prisma.booking.updateMany({
      where: {
        id: { in: reservedBookings.map(b => b.id) },
        bookingStatus: "PENDING_PAYMENT",
      },
      data: {
        paymentLink: session.url,
      },
    });

    return res.json({ 
      url: session.url,
      bookingIds: reservedBookings.map(b => b.id),
    });
    
  } catch (err) {
    console.error("Payment initiation error:", err.message);
    return res.status(500).json({
      msg: "Payment failed. Please try again.",
    });
  }
};

/* ---------------- CLEANUP EXPIRED BOOKINGS ---------------- */
const CleanupExpiredBookings = async () => {
  try {
    const expired = await prisma.booking.deleteMany({
      where: {
        bookingStatus: "PENDING_PAYMENT",
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return expired.count;
  } catch (error) {
    console.error("Cleanup failed:", error);
  }
};

/* ---------------- PROVIDER SUBSCRIPTION CHECKOUT  ---------------- */
const providerSubscriptionCheckout = async (req, res) => {
  const userId = req.user.id;

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const { priceId } = req.body;

    if (!priceId) {
      return res.status(400).json({ msg: "Subscription plan required" });
    }

    // Ensure user is provider
    const provider = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        businessProfile: { select: { id: true } },
      },
    });

    if (!provider || provider.role !== "provider") {
      return res.status(403).json({ msg: "Only providers can subscribe" });
    }

    if (!provider.businessProfile) {
      return res
        .status(400)
        .json({ msg: "Create business profile before subscribing" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: provider.email,

      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],

      metadata: {
        userId,
        businessProfileId: provider.businessProfile.id,
        subscriptionType: "PROVIDER",
      },

      success_url: `${process.env.FRONTEND_PROVIDER_SUCCESS_URL}`,
      cancel_url: `${process.env.FRONTEND_PROVIDER_CANCEL_URL}`,
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res
      .status(500)
      .json({ msg: "Failed to create subscription checkout" });
  }
};

/* ---------------- SEED PROVIDER SUBSCRIPTION PLANS  ---------------- */
const seedProviderSubscriptionPlans = async (req, res) => {
  try {
    const plans = await prisma.providerSubscriptionPlan.createMany({
      data: [
        {
          name: "PREMIMUM",
          price: 399,
          currency: "INR",
          interval: "month",
          stripePriceId: "price_1SgOSs9gg6uXWvhmXeL1WqvB",
          isActive: true,
        },
        {
          name: "PRO",
          price: 999,
          currency: "INR",
          interval: "year",
          stripePriceId: "price_1SgOTU9gg6uXWvhmtApjtiLp",
          isActive: true,
        },
      ],
      skipDuplicates: true,
    });

    return res.status(201).json({
      success: true,
      message: "Provider subscription plans created successfully",
      plans,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create provider subscription plans",
    });
  }
};

/* ---------------- GET PENDING PAYMENT BOOKINGS ---------------- */
const getPendingPaymentBookings = async (req, res) => {
  const userId = req.user.id;

  try {
    const currentTime = new Date();

    const pendingBookings = await prisma.booking.findMany({
      where: {
        userId,
        bookingStatus: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
        expiresAt: {
          gt: currentTime, // Only show bookings that haven't expired yet
        },
        paymentLink: {
          not: null, // Only show bookings with payment links
        },
      },
      include: {
        service: {
          include: {
            businessProfile: {
              include: {
                user: true,
              },
            },
          },
        },
        slot: true,
        address: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Calculate remaining time for each booking
    const bookingsWithTimeLeft = pendingBookings.map(booking => ({
      ...booking,
      timeLeftMinutes: Math.max(0, Math.floor((new Date(booking.expiresAt) - currentTime) / (1000 * 60))),
      timeLeftSeconds: Math.max(0, Math.floor((new Date(booking.expiresAt) - currentTime) / 1000) % 60),
    }));

    return res.status(200).json({
      success: true,
      message: "Pending payment bookings retrieved successfully",
      bookings: bookingsWithTimeLeft,
    });
  } catch (error) {
    console.error("Get pending payments error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve pending payments",
    });
  }
};

module.exports = {
  customerPayment,
  providerSubscriptionCheckout,
  seedProviderSubscriptionPlans,
  CleanupExpiredBookings,
  getPendingPaymentBookings
};
