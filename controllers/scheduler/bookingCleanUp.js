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

module.exports = {
  startBookingCleanupJob,
};
