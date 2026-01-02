const cron = require("node-cron");
const { CleanupExpiredBookings } = require("../payment.controller");
const prisma = require("../../prismaClient");

const startBookingCleanupJob = () => {
  cron.schedule("*/30 * * * * *", async () => {
    try {
      await CleanupExpiredBookings();
      await prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });
    } catch (error) {
      console.error("Booking cleanup job failed:", error);
    }
  });
};
const startBookingCancellationCleanupJob = () => {
  cron.schedule("0 9 * * *", async () => {
    try {
      await autoApproveCancellations();
    } catch (error) {
      console.error("Booking cancellation cleanup job failed:", error);
    }
  });
};

const autoApproveCancellations = async () => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const bookings = await prisma.Booking.findMany({
    where: {
      bookingStatus: "CANCEL_REQUESTED",
      updatedAt: { lte: sevenDaysAgo },
    },
  });

  for (const booking of bookings) {
    await prisma.$transaction(async (tx) => {
      await tx.Booking.update({
        where: { id: booking.id },
        data: {
          bookingStatus: "CANCELLED",
          updatedAt: new Date(),
          paymentStatus: "REFUNDED",
        },
      });
    });
  }
};

module.exports = {
  startBookingCleanupJob,
  startBookingCancellationCleanupJob,
};
