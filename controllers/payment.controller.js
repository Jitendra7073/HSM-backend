const prisma = require("../prismaClient");
const Stripe = require("stripe");

/* ---------------- CUSTOMER PAYMENT ---------------- */
const customerPayment = async (req, res) => {
  const userId = req.user.id;

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const { cartItems, addressId } = req.body;

    if (!cartItems || cartItems.length === 0)
      return res.status(400).json({ msg: "Cart is empty" });

    if (!addressId) return res.status(400).json({ msg: "Address required" });

    const dbCart = await prisma.cart.findMany({
      where: { id: { in: cartItems }, userId },
      include: { service: true, business: true },
    });

    const isAlreadyBookedByUser = await prisma.booking.findFirst({
      where: {
        userId,
        serviceId: { in: dbCart.map((c) => c.service.id) },
        slotId: { in: dbCart.map((c) => c.slotId) },
        date: { in: dbCart.map((c) => c.date) },
      },
    });

    if (isAlreadyBookedByUser)
      return res.status(400).json({
        msg: `You have already booked a slot for ${isAlreadyBookedByUser.date.split("T")[0]}`,
      });

    const businessIds = [...new Set(dbCart.map((c) => c.business.id))];
    if (businessIds.length > 1)
      return res
        .status(400)
        .json({ msg: "Only same-business services allowed" });

    const totalAmount = dbCart.reduce((s, c) => s + c.service.price, 0);

    const paymentRecord = await prisma.customerPayment.create({
      data: {
        userId,
        addressId,
        amount: totalAmount,
        status: "PENDING",
        bookingIds: JSON.stringify([]),
      },
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",

      metadata: {
        userId,
        addressId,
        paymentId: paymentRecord.id,
        cartItems: JSON.stringify(cartItems),
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

    return res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Payment failed" });
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
    console.error("Provider subscription error:", err);
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
    console.error("Seed plans error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create provider subscription plans",
    });
  }
};

module.exports = {
  customerPayment,
  providerSubscriptionCheckout,
  seedProviderSubscriptionPlans

};
