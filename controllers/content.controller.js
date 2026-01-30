const prisma = require("../prismaClient");
const { sendMail } = require("../utils/sendmail");
const { storeNotification } = require("./notification.controller");

/* ---------------- FETCH CONTENT (PUBLIC) ---------------- */
const getContent = async (req, res) => {
  const { key } = req.params;

  try {
    const content = await prisma.siteContent.findUnique({
      where: { key },
    });

    if (!content) {
      return res
        .status(404)
        .json({ success: false, message: "Content not found" });
    }

    return res.status(200).json({ success: true, data: content });
  } catch (error) {
    console.error("Get content error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch content" });
  }
};

/* ---------------- UPDATE CONTENT (ADMIN) ---------------- */
const updateContent = async (req, res) => {
  const { key } = req.params;
  const { title, content } = req.body;
  const userId = req.user.id; // Admin ID

  if (!title || !content) {
    return res
      .status(400)
      .json({ success: false, message: "Title and content required" });
  }

  try {
    const updated = await prisma.siteContent.upsert({
      where: { key },
      update: {
        title,
        content,
        updatedBy: userId,
      },
      create: {
        key,
        title,
        content,
        updatedBy: userId,
      },
    });

    // Notify Users (Async to prevent blocking)
    notifyUsersOfUpdate(updated.title, key).catch((err) =>
      console.error("Notification error:", err),
    );

    return res
      .status(200)
      .json({
        success: true,
        message: "Content updated successfully",
        data: updated,
      });
  } catch (error) {
    console.error("Update content error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update content" });
  }
};

// Helper to notify users
const notifyUsersOfUpdate = async (title, key) => {
  // In a real production app, use a queue system (Bull/RabbitMQ) for mass notifications.
  // Here we will simulate the intent or handle a small batch.

  // 1. Send generic announcement notification logic (if supported)
  // or loop through active users (Caution: heavy operation)

  // For this task, we will log the action.
  // Implementing mass email/push for potentially thousands of users synchronously is dangerous.
  console.log(
    `[Notification System] Content '${title}' (${key}) updated. Triggering mass alert...`,
  );

  // Example: Find last 50 active users to notify (Proof of Concept)
  const activeUsers = await prisma.user.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true },
  });

  for (const user of activeUsers) {
    // Send In-App Notification
    await storeNotification(
      "Policy Update",
      `Our ${title} has been updated. Please review the changes.`,
      user.id,
    );

    // Send Email (Mock/Actual)
    // await sendMail({ ... })
  }
};

module.exports = {
  getContent,
  updateContent,
};
