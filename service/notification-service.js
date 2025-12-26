const admin = "../firebase/firebase.js";
const prisma = "../prismaClient.js";

let fcmDisabled = false;

/* ---------------- HELPERS ---------------- */
async function handleFCMError(err, tokens = []) {
  console.error("FCM error:", err.code, err.message);

  if (err.code === "app/invalid-credential") {
    fcmDisabled = true;
    return;
  }

  if (
    err.code === "messaging/registration-token-not-registered" ||
    err.code === "messaging/invalid-registration-token"
  ) {
    await prisma.fCMToken.updateMany({
      where: { token: { in: tokens } },
      data: { isActive: false },
    });
  }
}

function normalizeTokens(tokens) {
  let list = [];

  if (typeof tokens === "string") {
    list = [tokens.trim()];
  } else if (Array.isArray(tokens)) {
    list = tokens
      .map((t) => {
        if (typeof t === "string") return t.trim();
        if (typeof t === "object" && t.token) return t.token.trim();
        return null;
      })
      .filter((t) => t && t.length > 20);
  }

  return [...new Set(list)];
}

function stringifyData(data = {}) {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );
}



/* ---------------- NOTIFICATION SERVICE ---------------- */
class NotificationService {
  static async sendNotification(tokens, title, body, data = {}) {
    if (fcmDisabled) return;
    if (!title || !body) return;

    try {
      const tokenList = normalizeTokens(tokens);
      if (!tokenList.length) return;

      // Single token
      if (tokenList.length === 1) {
        try {
          return await admin.messaging().send({
            token: tokenList[0],
            notification: { title, body },
            data: stringifyData(data),
          });
        } catch (err) {
          await handleFCMError(err, [tokenList[0]]);
          return;
        }
      }

      // Multiple tokens
      const response = await admin.messaging().sendEachForMulticast({
        tokens: tokenList,
        notification: { title, body },
        data: stringifyData(data),
      });

      const invalidTokens = [];

      response.responses.forEach((res, idx) => {
        if (!res.success) {
          const code = res.error?.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            invalidTokens.push(tokenList[idx]);
          }
        }
      });

      if (invalidTokens.length) {
        await prisma.fCMToken.updateMany({
          where: { token: { in: invalidTokens } },
          data: { isActive: false },
        });
      }

      return response;
    } catch (error) {
      console.error(" Notification send failed:", error);
    }
  }
}

module.exports = NotificationService;