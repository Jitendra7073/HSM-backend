const cron = require("node-cron");
const prisma = require("../../prismaClient");

/**
 * Update staff availability based on approved leave periods
 * Runs daily at midnight (00:00)
 */
const updateStaffAvailabilityForLeave = async () => {
  try {
    console.log("Running staff availability update for leave periods...");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all approved leaves
    const approvedLeaves = await prisma.staffLeave.findMany({
      where: {
        status: "APPROVED",
        OR: [
          { startDate: today },
          { endDate: today },
          {
            AND: [
              { startDate: { lte: today } },
              { endDate: { gte: today } },
            ],
          },
        ],
      },
      select: {
        id: true,
        staffId: true,
        startDate: true,
        endDate: true,
        leaveType: true,
      },
    });

    // Group leaves by staff
    const staffOnLeave = new Map();
    for (const leave of approvedLeaves) {
      const startDate = new Date(leave.startDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(leave.endDate);
      endDate.setHours(0, 0, 0, 0);

      // Check if today is within the leave period
      if (today >= startDate && today <= endDate) {
        if (!staffOnLeave.has(leave.staffId)) {
          staffOnLeave.set(leave.staffId, []);
        }
        staffOnLeave.get(leave.staffId).push(leave);
      }
    }

    // Update staff availability for those on leave
    for (const [staffId, leaves] of staffOnLeave) {
      await prisma.user.update({
        where: { id: staffId },
        data: { availability: "NOT_AVAILABLE" },
      });
      console.log(
        `Set staff ${staffId} to NOT_AVAILABLE (on leave: ${leaves[0].leaveType})`
      );
    }

    // Reset availability for staff whose leave ended yesterday
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const endedLeaves = await prisma.staffLeave.findMany({
      where: {
        status: "APPROVED",
        endDate: yesterday,
      },
      select: {
        id: true,
        staffId: true,
        endDate: true,
      },
    });

    for (const leave of endedLeaves) {
      // Check if staff has any other active leaves
      const hasActiveLeave = await prisma.staffLeave.findFirst({
        where: {
          staffId: leave.staffId,
          status: "APPROVED",
          startDate: { lte: today },
          endDate: { gte: today },
        },
      });

      if (!hasActiveLeave) {
        // Check if staff has active bookings
        const activeBookings = await prisma.booking.findMany({
          where: {
            StaffAssignBooking: {
              some: {
                assignedStaffId: leave.staffId,
                status: "ACCEPTED",
              },
            },
            OR: [{ trackingStatus: "BOOKING_STARTED" }, { trackingStatus: "PROVIDER_ON_THE_WAY" }, { trackingStatus: "SERVICE_STARTED" }],
          },
        });

        if (activeBookings.length > 0) {
          // Set to ON_WORK if has active bookings
          await prisma.user.update({
            where: { id: leave.staffId },
            data: { availability: "ON_WORK" },
          });
          console.log(
            `Set staff ${leave.staffId} to ON_WORK (leave ended, has active bookings)`
          );
        } else {
          // Reset to AVAILABLE
          await prisma.user.update({
            where: { id: leave.staffId },
            data: { availability: "AVAILABLE" },
          });
          console.log(
            `Reset staff ${leave.staffId} to AVAILABLE (leave ended)`
          );
        }
      }
    }

    console.log(
      `Staff availability update completed. Updated ${staffOnLeave.size} staff on leave.`
    );
  } catch (error) {
    console.error("Error updating staff availability for leave:", error);
  }
};

// Schedule to run every day at midnight
cron.schedule("0 0 * * *", updateStaffAvailabilityForLeave);

// Also run on startup
updateStaffAvailabilityForLeave();

module.exports = {
  updateStaffAvailabilityForLeave,
};
