const cron = require("node-cron");
const { CleanupExpiredBookings } = require("../payment.controller");
const prisma = require("../../prismaClient");

const startBookingCleanupJob = () => {
  cron.schedule("*/30 * * * * *", async () => {
    try {
      console.log("Running booking cleanup job...");
      await CleanupExpiredBookings();
      console.log("Booking cleanup completed");
    } catch (error) {
      console.error("Booking cleanup job failed:", error);
    }
  });
};

const startTokenCleanupJob = () => {
  // Run every hour to clean expired refresh tokens
  cron.schedule("0 * * * *", async () => {
    try {
      console.log("Running token cleanup job...");
      const result = await prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });
      console.log(`Token cleanup completed - deleted ${result.count} expired tokens`);
    } catch (error) {
      console.error("Token cleanup job failed:", error);
    }
  });
};

module.exports = { startBookingCleanupJob, startTokenCleanupJob };
