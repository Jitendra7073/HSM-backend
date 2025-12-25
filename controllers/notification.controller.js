const prisma = require("../prismaClient");

/* ---------------- STORE FCM TOKEN ---------------- */

const storeFcmTokenService = async ({ userId, token }) => {
  if (!userId || !token) {
    throw new Error("UserId and FCM token are required");
  }

  const existingToken = await prisma.FCMToken.findUnique({
    where: { token },
  });

  if (existingToken) {
    return {
      created: false,
      message: "Already registered",
    };
  }

  await prisma.FCMToken.create({
    data: { userId, token },
  });

  return {
    created: true,
    message: "Device registered successfully",
  };
};

const storeFcmToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    const result = await storeFcmTokenService({ userId, token });

    return res.status(result.created ? 201 : 200).json({
      success: true,
      msg: result.message,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Failed to register device",
    });
  }
};

/* ---------------- STORE NOTIFICATION ---------------- */
const StoreNotification = async (newBooking_Payload, receiverId, senderId) => {
  try {
    await prisma.Notification.create({
      data: {
        title: newBooking_Payload.title,
        message: newBooking_Payload.body,
        receiverId: receiverId,
        senderId: senderId,
      },
    });
  } catch (error) {
    console.error("Failed to store notification!");
  }
};

/* ---------------- GET ALL NOTIFICATION ---------------- */
const getAllReceivedNotifications = async (req, res) => {
  const userId = req.user.id;
  try {
    const notifications = await prisma.notification.findMany({
      where: { receiverId: userId, read: false },
    });
    return res.status(200).json({
      success: true,
      msg: "notification fetched.",
      notifications,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Unable to fetch the notification",
    });
  }
};

/* ---------------- UPDATE NOTIFICATION STATUS ---------------- */
const markNotificationAsRead = async (req, res) => {
  const { notificationId } = req.params;
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) {
      return res.status(404).json({
        success: false,
        msg: "We could not found this Notification!",
      });
    }

    const markAsRead = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        read: true,
      },
    });
    if (!markAsRead) {
      return res.status(500).json({
        success: false,
        msg: "Something went wrong!",
      });
    }
    return res.status(200).json({
      success: true,
      msg: "Mark as read.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Error: During updating the status of notification.",
    });
  }
};
module.exports = {
  storeFcmToken,
  StoreNotification,
  getAllReceivedNotifications,
  markNotificationAsRead,
};
