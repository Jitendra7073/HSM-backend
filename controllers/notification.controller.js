const prisma = require("../prismaClient");

/* ---------------- STORE / UPDATE FCM TOKEN ---------------- */
const storeFcmTokenService = async ({ userId, token }) => {
  if (!userId || !token || token.trim().length < 20) {
    throw new Error("Invalid userId or FCM token");
  }

  const normalizedToken = token.trim();

  return await prisma.$transaction(async (tx) => {
    const existingToken = await tx.fCMToken.findUnique({
      where: { token: normalizedToken },
    });

    //  Token exists for same user
    if (existingToken && existingToken.userId === userId) {
      if (!existingToken.isActive) {
        await tx.fCMToken.update({
          where: { token: normalizedToken },
          data: { isActive: true },
        });
      }

      return {
        created: false,
        message: "Device already registered",
      };
    }

    //  Token exists but linked to another user
    if (existingToken && existingToken.userId !== userId) {
      await tx.fCMToken.update({
        where: { token: normalizedToken },
        data: {
          userId,
          isActive: true,
        },
      });

      return {
        created: false,
        message: "Device re-linked to user",
      };
    }

    //  New token
    await tx.fCMToken.create({
      data: {
        userId,
        token: normalizedToken,
        isActive: true,
      },
    });

    return {
      created: true,
      message: "Device registered successfully",
    };
  });
};

/* ---------------- STORE FCM TOKEN API ---------------- */
const storeFcmToken = async (req, res) => {
  try {
    const userId = req.user?.id;
    const token = req.headers["x-fcm-token"];

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Unauthorized",
      });
    }

    const result = await storeFcmTokenService({ userId, token });

    return res.status(result.created ? 201 : 200).json({
      success: true,
      msg: result.message,
    });
  } catch (error) {
    console.error("FCM token store failed:", error);

    return res.status(500).json({
      success: false,
      msg: error.message || "Failed to register device",
    });
  }
};

/* ---------------- STORE NOTIFICATION ---------------- */
const storeNotification = async (title, body, receiverId, senderId) => {
  if (!title || !body || !receiverId) return;

  try {
    await prisma.notification.create({
      data: {
        title,
        message: body,
        receiverId,
        senderId: senderId || null,
      },
    });
  } catch (error) {
    console.error("Failed to store notification:", error);
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
  storeNotification,
  getAllReceivedNotifications,
  markNotificationAsRead,
};
