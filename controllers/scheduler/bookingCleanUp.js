const cron = require("node-cron");
const { CleanupExpiredBookings } = require("../payment.controller");
const prisma = require("../../prismaClient");

const startBookingCleanupJob = () => {
  cron.schedule("*/30 * * * * *", async () => {
    try {
      await CleanupExpiredBookings();
    } catch (error) {
      console.error("Booking cleanup job failed:", error);
    }
  });
};

const startTokenCleanupJob = () => {
  // Run every hour to clean expired refresh tokens
  cron.schedule("0 * * * *", async () => {
    try {
      const result = await prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });
    } catch (error) {
      console.error("Token cleanup job failed:", error);
    }
  });
};

module.exports = { startBookingCleanupJob, startTokenCleanupJob };
