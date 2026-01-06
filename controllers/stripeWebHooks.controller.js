const prisma = require("../prismaClient");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const { sendMail } = require("../utils/sendmail");
const { generateInvoicePDF } = require("../utils/generateInvoice");
const {
  generateProviderSubscriptionInvoicePDF,
} = require("../utils/generateProviderBilling");
const { buildInvoiceData } = require("../utils/buildInvoiceData");
const {
  bookingSuccessEmailTemplate,
  bookingFailedEmailTemplate,
  providerSubscriptionSuccessEmailTemplate,
} = require("../helper/mail-tamplates/tamplates");

const NotificationService = require("../service/notification-service");
const { storeNotification } = require("./notification.controller");

/* ---------------------------- STRIPE WEBHOOK HANDLER ---------------------------- */

const stripeWebhookHandler = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).send("Missing stripe-signature");

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.mode === "subscription") {
        await handleProviderSubscriptionCompleted(session);
      } else {
        await handleCheckoutCompleted(session);
      }
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await handleProviderSubscriptionUpdated(event.data.object);
    }

    if (event.type === "payment_intent.payment_failed") {
      await handlePaymentFailed(event.data.object);
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(200).json({ received: true });
  }
};

/* --------------------------- CUSTOMER PAYMENT SUCCESS --------------------------- */

const handleCheckoutCompleted = async (session) => {
  const { userId, addressId, paymentId, bookingIds, dbCart } =
    session.metadata || {};

  if (!userId || !addressId || !paymentId || !bookingIds || !dbCart) {
    console.error("Missing metadata in webhook:", session.metadata);
    return;
  }

  try {
    const cartIds = JSON.parse(dbCart);
    const bookingIdList = JSON.parse(bookingIds);

    // Fetch user and address
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const address = await prisma.address.findUnique({
      where: { id: addressId },
    });

    if (!user || !address) {
      console.error("User or address not found");
      return;
    }

    // Fetch cart items with all relations
    const cart = await prisma.cart.findMany({
      where: { id: { in: cartIds }, userId },
      include: {
        service: {
          include: {
            businessProfile: {
              include: { user: true },
            },
          },
        },
        slot: true,
        business: true,
      },
    });

    if (!cart.length) {
      console.error("Cart items not found");
      return;
    }

    /* --------------------------- CONFIRM BOOKINGS --------------------------- */
    const result = await prisma.$transaction(
      async (tx) => {
        // Idempotency check: verify payment hasn't been processed
        const payment = await tx.customerPayment.findUnique({
          where: { id: paymentId },
        });

        if (!payment) {
          throw new Error(`Payment record ${paymentId} not found`);
        }

        if (payment.status === "PAID") {
          return null; // Return null to signal that processing was skipped
        }

        // Also check if any bookings are already confirmed
        const existingConfirmed = await tx.booking.findFirst({
          where: {
            id: { in: bookingIdList },
            bookingStatus: "CONFIRMED",
            paymentStatus: "PAID",
          },
        });

        if (existingConfirmed) {
          return null; // Return null to signal that processing was skipped
        }

        const confirmedBookings = [];

        for (const bookingId of bookingIdList) {
          // Find the locked booking
          const booking = await tx.booking.findFirst({
            where: {
              id: bookingId,
              userId,
              bookingStatus: "PENDING_PAYMENT",
              paymentStatus: "PENDING",
              expiresAt: {
                gt: new Date(),
              },
            },
          });

          if (!booking) {
            throw new Error(`Booking ${bookingId} expired or not found`);
          }

          // Confirm the booking
          const confirmed = await tx.booking.update({
            where: { id: booking.id },
            data: {
              paymentStatus: "PAID",
              bookingStatus: "CONFIRMED",
              paymentLink: null, // Clear payment link since payment is complete
              expiresAt: null, // Remove expiration
            },
          });

          confirmedBookings.push(confirmed);
        }

        // Update payment record
        await tx.customerPayment.update({
          where: { id: paymentId },
          data: {
            status: "PAID",
            stripeSessionId: session.id,
            paymentIntentId: session.payment_intent,
            bookingIds: JSON.stringify(confirmedBookings.map((b) => b.id)),
          },
        });

        // Clear cart
        await tx.cart.deleteMany({
          where: { id: { in: cartIds }, userId },
        });

        await tx.customerPayment.deleteMany({
          where: { status: "PENDING" },
        });
        return confirmedBookings;
      },
      {
        timeout: 10000,
      }
    );

    // If transaction returned null, payment was already processed - skip notifications
    if (!result || result.length === 0) {
      return;
    }

    /* ---------------- SEND EMAIL WITH INVOICE ---------------- */
    try {
      const invoiceData = buildInvoiceData({
        business: {
          name: cart[0].business.businessName,
          email: cart[0].business.contactEmail,
          phone: cart[0].business.phoneNumber,
        },

        customer: {
          name: user.name,
          email: user.email,
          address: `${address.street}, ${address.city}, ${address.state} - ${address.postalCode}`,
        },

        provider: {
          name: cart[0].service.businessProfile.user.name,
        },

        items: cart.map((c) => ({
          title: c.service.name,
          price: c.service.price,
          bookingDate: c.date,
          slotTime: c.slot ? c.slot.time : "Not Assigned",
        })),

        payment: {
          status: "PAID",
          method: "Stripe",
          transactionId: session.payment_intent,
        },

        invoiceNumber: `INV-${Date.now()}`,
      });

      const pdfBuffer = await generateInvoicePDF(invoiceData);

      await sendMail({
        email: user.email,
        subject: "Booking Confirmed - Invoice Attached",
        template: bookingSuccessEmailTemplate({
          userName: user.name,
          bookingIds: result.map((b) => b.id),
          totalAmount: cart.reduce((sum, c) => sum + c.service.price, 0),
          paymentId,
          paymentDate: new Date().toISOString(),
          services: cart.map((c) => ({
            title: c.service.name,
            price: c.service.price,
            bookingDate: c.date,
            slotTime: c.slot ? c.slot.time : "Not Assigned",
          })),
          businessName: cart[0].business.businessName,
        }),
        attachments: [
          {
            filename: "invoice.pdf",
            content: pdfBuffer,
          },
        ],
      });
    } catch (err) {
      console.error("Failed to send invoice email:", err.message);
    }

    /* ---------------- SEND PUSH NOTIFICATION TO PROVIDER ---------------- */
    const provider = await prisma.businessProfile.findUnique({
      where: { id: result[0].businessProfileId },
      select: { userId: true },
    });

    if (!provider) {
      console.error("Provider not found");
      return;
    }

    const services = await prisma.service.findMany({
      where: { id: { in: result.map((r) => r.serviceId) } },
    });

    const payload = {
      title: "New Booking Received",
      body: `New booking for ${services.map((s) => s.name).join(", ")} by ${user.name
        }`,
      type: "BOOKING_CREATED",
    };

    await storeNotification(
      payload.title,
      payload.body,
      provider.userId,
      user.id
    );

    try {
      const fcmTokens = await prisma.fCMToken.findMany({
        where: { userId: provider.userId },
      });

      if (fcmTokens.length > 0) {
        await NotificationService.sendNotification(
          fcmTokens,
          payload.title,
          payload.body,
          {
            type: payload.type,
            tag: `provider_booking_${paymentId}`
          }
        );
      }
    } catch (err) {
      console.error("Notification error:", err.message);
    }

    // Notify customer about booking confirmation
    const customerPayload = {
      title: "Booking Confirmed",
      body: `Your booking for ${services
        .map((s) => s.name)
        .join(", ")} has been confirmed.`,
      type: "BOOKING_CONFIRMED",
    };

    await storeNotification(
      customerPayload.title,
      customerPayload.body,
      user.id,
      provider.userId
    );

    try {
      const customerFcmTokens = await prisma.fCMToken.findMany({
        where: { userId: user.id },
      });

      if (customerFcmTokens.length > 0) {
        await NotificationService.sendNotification(
          customerFcmTokens,
          customerPayload.title,
          customerPayload.body,
          {
            type: customerPayload.type,
            tag: `customer_booking_${paymentId}`
          }
        );
      }
    } catch (err) {
      console.error("Customer notification error:", err.message);
    }
  } catch (error) {
    console.error("Error in handleCheckoutCompleted:", error.message);
  }
};

/* ----------------------- PROVIDER SUBSCRIPTION SUCCESS ----------------------- */

const handleProviderSubscriptionCompleted = async (session) => {
  const { userId, subscriptionType, isTrial, providerName, businessName } = session.metadata || {};
  if (!userId || subscriptionType !== "PROVIDER") {
    console.warn("Invalid subscription metadata");
    return;
  }

  const provider = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      mobile: true,
      addresses: true,
    },
  });

  const business = await prisma.businessProfile.findUnique({
    where: { userId: userId },
  });

  const subscription = await stripe.subscriptions.retrieve(
    session.subscription
  );

  const priceItem = subscription.items?.data?.[0];
  if (!priceItem?.price?.id) {
    console.error("Price ID not found in subscription");
    return;
  }

  const plan = await prisma.providerSubscriptionPlan.findFirst({
    where: {
      stripePriceId: priceItem.price.id,
    },
  });

  if (!plan) {
    console.error("Plan not found for price:", priceItem.price.id);
    return;
  }

  /* ----------------------- SAFE DATE HANDLING ----------------------- */

  const periodStartUnix =
    subscription.current_period_start ?? subscription.created;

  // Use trial_end for trial period, current_period_end for active subscription
  const periodEndUnix = subscription.status === "trialing" 
    ? subscription.trial_end 
    : (subscription.current_period_end ??
      subscription.created +
      (priceItem.price.recurring?.interval === "year"
        ? 365 * 24 * 60 * 60
        : 30 * 24 * 60 * 60));

  const currentPeriodStart = new Date(periodStartUnix * 1000);
  const currentPeriodEnd = new Date(periodEndUnix * 1000);

  const isInTrial = subscription.status === "trialing";

  /* ----------------------- UPSERT ----------------------- */
  await prisma.ProviderSubscription.upsert({
    where: { userId },
    create: {
      userId,
      planId: plan.id,
      stripeCustomerId: session.customer,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodStart,
      currentPeriodEnd,
    },
    update: {
      planId: plan.id,
      status: subscription.status,
      currentPeriodEnd,
    },
  });

  /* ---------------- EMAIL FOR TRIAL OR SUBSCRIPTION ---------------- */
  try {
    if (isInTrial && isTrial === "true") {
      // Send trial started email
      const { sendMail } = require("../utils/sendmail");
      const { providerTrialStartedEmailTemplate } = require("../helper/mail-tamplates/tamplates");

      await sendMail({
        email: business.contactEmail,
        subject: "Your 7-Day Free Trial Has Started!",
        template: providerTrialStartedEmailTemplate({
          providerName: provider.name,
          businessName: business.businessName,
          planName: plan.name,
          trialEndDate: currentPeriodEnd,
          planPrice: plan.price,
        }),
      });

      // Store notification
      const { storeNotification } = require("./notification.controller");
      await storeNotification(
        "Free Trial Started!",
        `Your 7-day free trial for ${plan.name} plan has started. Enjoy premium features!`,
        userId
      );
    } else {
      // Send subscription activated email with invoice
      const invoiceData = {
        business: {
          email: business.contactEmail,
          phone: business.phoneNumber,
          website: business.websiteURL,
        },
        invoice: {
          number: business.id.slice(0, 6) + "_" + business.userId.slice(0, 6),
          date: new Date(),
        },
        provider: {
          name: provider.name,
          email: provider.email,
          phone: provider.mobile,
          address: `${provider.addresses.street}, ${provider.addresses.city}, ${provider.addresses.state}-${provider.addresses.postalCode}`,
        },
        subscription: {
          periodStart: currentPeriodStart,
          periodEnd: currentPeriodEnd,
          status: subscription.status,
        },
        plan: {
          name: plan.name,
          price: plan.price,
          billingCycle: plan.interval,
        },
        payment: {
          status: subscription.status,
          method: "Stripe",
          stripeSubscriptionId: subscription.id,
        },
      };

      const pdfBuffer = await generateProviderSubscriptionInvoicePDF(invoiceData);

      await sendMail({
        email: business.contactEmail,
        subject: "Subscription Activated",
        template: providerSubscriptionSuccessEmailTemplate({
          providerName: provider.name,
          businessName: business.businessName,
          planName: plan.name,
          planAmount: plan.price,
          subscriptionId: subscription.id,
          subscriptionStart: currentPeriodStart,
          subscriptionEnd: currentPeriodEnd,
        }),
        attachments: [
          {
            filename: "invoice.pdf",
            content: pdfBuffer,
          },
        ],
      });
    }
  } catch (err) {
    console.error("Failed to send email:", err);
  }
};

/* ------------------------ PROVIDER SUBSCRIPTION UPDATE / CANCEL ------------------------ */

const handleProviderSubscriptionUpdated = async (subscription) => {
  const periodEndUnix = subscription.status === "trialing" 
    ? subscription.trial_end 
    : subscription.current_period_end;

  await prisma.ProviderSubscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: subscription.status,
      currentPeriodEnd: new Date(periodEndUnix * 1000),
    },
  });
};

/* ------------------------- CUSTOMER PAYMENT FAILED ------------------------- */

const handlePaymentFailed = async (intent) => {
  const { userId, addressId, paymentId, dbCart } = session.metadata || {};
  if (!userId || !addressId || !paymentId || !dbCart) return;

  const cartIds = JSON.parse(dbCart);

  await prisma.customerPayment.update({
    where: { id: paymentId },
    data: { status: "FAILED" },
  });
  await tx.customerPayment.deleteMany({
    where: { status: "PENDING" },
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const cart = await prisma.cart.findMany({
    where: { id: { in: cartIds }, userId },
    include: {
      service: {
        include: {
          businessProfile: {
            include: { user: true },
          },
        },
      },
      slot: true,
      business: true,
    },
  });
  if (!cart.length) return;

  await sendMail({
    email: user.email,
    subject: "Payment Failed",
    template: bookingFailedEmailTemplate({
      userName: user.name,
      services: cart.map((c) => ({
        title: c.service.name,
        price: c.service.price,
        bookingDate: c.date,
        slotTime: c.slot ? c.slot.time : "Not Assigned",
      })),
      businessName: cart[0].business.businessName,
    }),
  });
};

module.exports = { stripeWebhookHandler };
