const cron = require("node-cron");
const { CleanupExpiredBookings } = require("../payment.controller");

export const startBookingCleanupJob = () => {
  cron.schedule("*/30 * * * * *", async () => {
    await CleanupExpiredBookings();
  });
};
