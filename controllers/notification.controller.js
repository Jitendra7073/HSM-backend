const prisma = require("../prismaClient");

/* ---------------- STORE FCM TOKEN ---------------- */
const storeFcmToken = async (req, res) => {
  const userId = req.user.id;
  const { token } = req.body;

  if (!userId || !token) {
    return res.status(400).json({
      success: false,
      msg: "UserId and FCM token are required!",
    });
  }

  const isTokenExists = await prisma.FCMToken.findUnique({
    where: { token },
  });

  if (isTokenExists) {
    return res.status(200).json({
      success: true,
      msg: "Already registered",
    });
  }

  await prisma.FCMToken.create({
    data: { userId, token },
  });

  return res.status(201).json({
    success: true,
    msg: "Device registered successfully",
  });
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

module.exports = { storeFcmToken, StoreNotification };
