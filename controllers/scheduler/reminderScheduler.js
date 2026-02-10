const cron = require("node-cron");
const prisma = require("../../prismaClient");
const { sendNotification } = require("../notification.controller");

/**
 * Send 30-minute reminder notifications for upcoming bookings
 * Runs every 5 minutes
 */
const sendBookingReminders = async () => {
  try {
    // Get current time and 30-35 minutes from now
    const now = new Date();
    const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
    const thirtyFiveMinutesFromNow = new Date(now.getTime() + 35 * 60 * 1000);

    const upcomingBookings = await prisma.booking.findMany({
      where: {
        bookingStatus: "CONFIRMED",
        trackingStatus: "NOT_STARTED",
        reminderSentAt: null, // Not yet sent
        StaffAssignBooking: {
          some: {
            status: "ACCEPTED",
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true,
          },
        },
        service: {
          select: {
            name: true,
          },
        },
        businessProfile: {
          select: {
            id: true,
            businessName: true,
            userId: true,
          },
        },
        slot: {
          select: {
            time: true,
          },
        },
        StaffAssignBooking: {
          where: {
            status: "ACCEPTED",
          },
          include: {
            assignedStaff: {
              select: {
                id: true,
                name: true,
                email: true,
                mobile: true,
              },
            },
          },
        },
      },
    });

    // Filter bookings that are within 30-35 minutes
    const bookingsToRemind = upcomingBookings.filter((booking) => {
      const bookingDateTime = new Date(
        `${booking.date}T${booking.slot?.time || "00:00"}`,
      );
      return (
        bookingDateTime >= thirtyMinutesFromNow &&
        bookingDateTime <= thirtyFiveMinutesFromNow
      );
    });

    // Send reminders for each booking
    for (const booking of bookingsToRemind) {
      try {
        const staffMember = booking.StaffAssignBooking[0]?.assignedStaff;
        const providerId = booking.businessProfile.userId;

        if (!staffMember) {
          console.log(`No staff assigned for booking ${booking.id}`);
          continue;
        }

        // Send notification to staff
        const staffNotificationTitle = "Upcoming Booking Reminder";
        const staffNotificationMessage = `You have an upcoming booking: ${
          booking.service.name
        } at ${booking.slot?.time} for ${booking.user.name}. Address: ${
          booking.user.street || "N/A"
        }, ${booking.user.city || "N/A"}`;

        await prisma.notification.create({
          data: {
            title: staffNotificationTitle,
            message: staffNotificationMessage,
            receiverId: staffMember.id,
            senderId: providerId,
          },
        });

        // Send notification to provider
        const providerNotificationTitle = "Staff Booking Reminder";
        const providerNotificationMessage = `Staff ${staffMember.name} has booking ${booking.service.name} starting in 30 minutes at ${booking.slot?.time}`;

        await prisma.notification.create({
          data: {
            title: providerNotificationTitle,
            message: providerNotificationMessage,
            receiverId: providerId,
            senderId: staffMember.id,
          },
        });

        // Mark reminder as sent
        await prisma.booking.update({
          where: { id: booking.id },
          data: { reminderSentAt: now },
        });
      } catch (bookingError) {
        console.error(
          `Error processing reminder for booking ${booking.id}:`,
          bookingError,
        );
      }
    }
  } catch (error) {
    console.error("Booking reminder scheduler failed:", error);
  }
};

/**
 * Start the reminder scheduler job
 * Runs every 5 minutes
 */
const startReminderScheduler = () => {
  // Run every 5 minutes: */5 * * * *
  cron.schedule("*/5 * * * *", async () => {
    await sendBookingReminders();
  });
};

module.exports = {
  sendBookingReminders,
  startReminderScheduler,
};
