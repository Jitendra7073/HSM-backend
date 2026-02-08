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
  /* ---------------- DEBUG LOGS ---------------- */
  console.log("🔔 Webhook received!");

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    console.error("❌ Missing stripe-signature header");
    return res.status(400).send("Missing stripe-signature");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
    console.log(`✅ Webhook verified: ${event.type}`);
  } catch (err) {
    console.error(`❌ Signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.mode === "subscription") {
        await handleProviderSubscriptionCompleted(session, req);
      } else {
        await handleCheckoutCompleted(session, req);
      }
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await handleProviderSubscriptionUpdated(event.data.object, req);
    }

    if (event.type === "payment_intent.payment_failed") {
      await handlePaymentFailed(event.data.object, req);
    }

    // Stripe Connect account events for staff payouts
    if (event.type === "account.updated") {
      await handleAccountUpdated(event.data.object, req);
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(200).json({ received: true });
  }
};

/* --------------------------- CUSTOMER PAYMENT SUCCESS --------------------------- */

const handleCheckoutCompleted = async (session, req) => {
  console.log("💰 Processing checkout.session.completed", session.id);
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
            include: {
              businessProfile: {
                include: {
                  user: {
                    include: {
                      providerSubscription: {
                        include: {
                          plan: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });

          if (!booking) {
            throw new Error(`Booking ${bookingId} expired or not found`);
          }

          // Calculate Dynamic Fee
          let commissionRate = 10;
          const plan =
            booking.businessProfile?.user?.providerSubscription?.plan;

          if (plan?.commissionRate !== undefined) {
            commissionRate = plan.commissionRate;
          }

          const fee = Math.round(booking.totalAmount * (commissionRate / 100));
          const earning = booking.totalAmount - fee;

          const confirmed = await tx.booking.update({
            where: { id: booking.id },
            data: {
              paymentStatus: "PAID",
              bookingStatus: "CONFIRMED",
              paymentLink: null,
              expiresAt: null,
              platformFee: fee,
              providerEarnings: earning,
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
          where: { status: "PENDING", userId },
        });
        return confirmedBookings;
      },
      {
        timeout: 50000,
      },
    );
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
      user.id,
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
            tag: `provider_booking_${paymentId}`,
          },
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
      provider.userId,
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
            tag: `customer_booking_${paymentId}`,
          },
        );
      }
    } catch (err) {
      console.error("Customer notification error:", err.message);
    }

    // create log
    await prisma.customerActivityLog.create({
      data: {
        customerId: userId,
        actionType: "BOOKING_CREATED",
        status: "SUCCESS",
        metadata: {
          paymentId: paymentId,
          services: cart.map((c) => ({
            title: c.service.name,
            price: c.service.price,
            bookingDate: c.date,
            slotTime: c.slot ? c.slot.time : "Not Assigned",
          })),
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });
  } catch (error) {
    console.error("Error in handleCheckoutCompleted:", error.message);
  }
};

/* ----------------------- PROVIDER SUBSCRIPTION SUCCESS ----------------------- */

const handleProviderSubscriptionCompleted = async (session, req) => {
  const { userId, subscriptionType, isTrial, providerName, businessName } =
    session.metadata || {};
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
      role: true,
    },
  });

  const business = await prisma.businessProfile.findUnique({
    where: { userId: userId },
  });

  const subscription = await stripe.subscriptions.retrieve(
    session.subscription,
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
  const periodEndUnix =
    subscription.status === "trialing"
      ? subscription.trial_end
      : subscription.current_period_end ??
      subscription.created +
      (priceItem.price.recurring?.interval === "year"
        ? 365 * 24 * 60 * 60
        : 30 * 24 * 60 * 60);

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
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      cancelAt: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000)
        : null,
    },
    update: {
      planId: plan.id,
      status: subscription.status,
      currentPeriodEnd,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: session.customer,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      cancelAt: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000)
        : null,
    },
  });

  // create log
  await prisma.providerAdminActivityLog.create({
    data: {
      actorId: userId,
      actorType: provider.role,
      actionType: "SUBSCRIPTION_ACTIVATED",
      status: "SUCCESS",
      metadata: {
        planId: plan.id,
        status: subscription.status,
        currentPeriodEnd,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: session.customer,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        cancelAt: subscription.cancel_at,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    },
  });

  /* ---------------- EMAIL FOR TRIAL OR SUBSCRIPTION ---------------- */
  try {
    if (isInTrial && isTrial === "true") {
      // Send trial started email
      const { sendMail } = require("../utils/sendmail");
      const {
        providerTrialStartedEmailTemplate,
      } = require("../helper/mail-tamplates/tamplates");

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
        userId,
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

      const pdfBuffer = await generateProviderSubscriptionInvoicePDF(
        invoiceData,
      );

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

const handleProviderSubscriptionUpdated = async (subscription, req) => {
  const periodEndUnix =
    subscription.status === "trialing"
      ? subscription.trial_end
      : subscription.current_period_end;

  // Retrieve current subscription to check for state changes (idempotency for notifications)
  const currentDbSub = await prisma.ProviderSubscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  const isNewlyCancelled =
    !currentDbSub?.cancelAtPeriodEnd && subscription.cancel_at_period_end;

  await prisma.ProviderSubscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: subscription.status,
      currentPeriodEnd: new Date(periodEndUnix),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      cancelAt: subscription.cancel_at
        ? new Date(subscription.cancel_at)
        : null,
    },
  });

  const userId = currentDbSub?.userId;

  let actorType = "PROVIDER";
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user) actorType = user.role;
  }

  // create log
  if (userId) {
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: userId,
        actorType: actorType,
        actionType: "SUBSCRIPTION_UPDATED",
        status: "SUCCESS",
        metadata: {
          status: subscription.status,
          currentPeriodEnd: new Date(periodEndUnix * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          cancelAt: subscription.cancel_at,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });
  }

  if (isNewlyCancelled && currentDbSub) {
    const user = await prisma.user.findUnique({
      where: { id: currentDbSub.userId },
      select: { email: true, name: true, id: true },
    });

    if (user) {
      try {
        const {
          providerSubscriptionCancelledEmailTemplate,
        } = require("../helper/mail-tamplates/tamplates");
        await sendMail({
          email: user.email,
          subject: "Subscription Cancellation Scheduled",
          template: providerSubscriptionCancelledEmailTemplate
            ? providerSubscriptionCancelledEmailTemplate({
              userName: user.name,
              endDate: new Date(periodEndUnix * 1000).toLocaleDateString(),
            })
            : `<p>Hello ${user.name
            },<br>Your subscription has been cancelled. It will remain active until ${new Date(
              periodEndUnix * 1000,
            ).toLocaleDateString()}.</p>`,
        });

        const { storeNotification } = require("./notification.controller");
        await storeNotification(
          "Subscription Cancelled",
          `Your subscription has been cancelled.`,
          user.id,
        );
      } catch (err) {
        console.error("Error sending cancellation notification:", err);
      }
    }
  }
};

/* ------------------------- CUSTOMER PAYMENT FAILED ------------------------- */

const handlePaymentFailed = async (intent, req) => {
  const { userId, addressId, paymentId, dbCart } = intent.metadata || {};
  if (!userId || !addressId || !paymentId || !dbCart) return;

  const cartIds = JSON.parse(dbCart);

  await prisma.customerPayment.update({
    where: { id: paymentId },
    data: { status: "FAILED" },
  });
  await prisma.customerPayment.deleteMany({
    where: { status: "PENDING", userId },
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

  // create log
  await prisma.providerAdminActivityLog.create({
    data: {
      actorId: userId,
      actorType: user.role,
      actionType: "PAYMENT_FAILED",
      status: "SUCCESS",
      metadata: {
        intent: intent,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    },
  });

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

/* ------------------------- STRIPE CONNECT ACCOUNT UPDATED ------------------------- */

/**
 * Handle Stripe Connect account updates (for staff payouts)
 * Updates staff stripeAccountStatus when their account status changes
 * Also fetches and stores bank account details whenever they're added
 */
const handleAccountUpdated = async (account, req) => {
  try {
    console.log(`Processing account.updated for Stripe account: ${account.id}`);

    // Find user by stripeAccountId
    const user = await prisma.user.findFirst({
      where: {
        stripeAccountId: account.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        stripeAccountStatus: true,
      },
    });

    if (!user) {
      console.log(`No user found for Stripe account: ${account.id}`);
      return;
    }

    // Determine account status based on Stripe data
    let newStatus = "PENDING";

    // Check if account has all requirements collected
    if (account.charges_enabled && account.payouts_enabled) {
      newStatus = "VERIFIED";
    } else if (account.details_submitted) {
      newStatus = "RESTRICTED";
    }

    // Update user's Stripe account status
    await prisma.user.update({
      where: { id: user.id },
      data: {
        stripeAccountStatus: newStatus,
      },
    });

    console.log(`Updated Stripe account status for user ${user.id}: ${user.stripeAccountStatus} → ${newStatus}`);

    // Fetch and store bank account details whenever external accounts exist
    // Don't wait for full verification - save as soon as bank accounts are added
    try {
      const externalAccounts = await stripe.accounts.listExternalAccounts(
        account.id,
        { object: "bank_account", limit: 10 }
      );

      console.log(`Found ${externalAccounts.data.length} external bank accounts for user ${user.id}`);

      if (externalAccounts.data.length > 0) {
        // Store each bank account in our database
        for (const bankAccount of externalAccounts.data) {
          // Check if bank account already exists
          const existing = await prisma.bankAccount.findFirst({
            where: {
              stripeExternalId: bankAccount.id,
            },
          });

          if (!existing) {
            // Create new bank account record
            await prisma.bankAccount.create({
              data: {
                userId: user.id,
                stripeAccountId: account.id,
                stripeExternalId: bankAccount.id,
                bankName: bankAccount.bank_name,
                last4: bankAccount.last4,
                routingNumber: bankAccount.routing_number,
                country: bankAccount.country,
                currency: bankAccount.currency,
                status: bankAccount.status,
                accountHolderType: bankAccount.account_holder_type,
                fingerprint: bankAccount.fingerprint,
                isDefault: externalAccounts.data.length === 1, // First account is default
              },
            });

            console.log(`✓ Stored new bank account for user ${user.id}: ${bankAccount.bank_name} ending in ${bankAccount.last4}`);
          } else {
            // Update existing bank account if status changed
            if (existing.status !== bankAccount.status) {
              await prisma.bankAccount.update({
                where: { id: existing.id },
                data: {
                  status: bankAccount.status,
                },
              });
              console.log(`✓ Updated bank account status for user ${user.id}: ${bankAccount.bank_name} → ${bankAccount.status}`);
            }
          }
        }
      }
    } catch (bankError) {
      console.error("Error storing bank account details:", bankError);
      // Don't fail the webhook if bank account storage fails
    }

    // Send notification if account was just verified
    if (newStatus === "VERIFIED" && user.stripeAccountStatus !== "VERIFIED") {
      await storeNotification(
        "💳 Stripe Account Verified",
        "Your Stripe account has been verified and you can now receive payments.",
        user.id,
      );
    }
  } catch (error) {
    console.error("Error in handleAccountUpdated:", error);
  }
};

module.exports = { stripeWebhookHandler };
