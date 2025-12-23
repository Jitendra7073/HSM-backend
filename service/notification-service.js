const admin = require("../firebase/firebase");
const prisma = require("../prismaClient");


/* ---------------- NOTIFICATION SERVICE ---------------- */
class NotificationService {
  static async sendNotification(tokens, title, body, data = {}) {
    try {

      let tokenList = [];

      if (typeof tokens === "string") {
        tokenList = [tokens];
      } else if (Array.isArray(tokens)) {
        tokenList = tokens
          .map((t) => {
            if (typeof t === "string") return t;
            if (typeof t === "object" && t.token) return t.token;
            return null;
          })
          .filter(Boolean);
      }

      if (!tokenList.length) {
        return;
      }

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

      const message = {
        tokens: tokenList,
        notification: { title, body },
        data: stringifyData(data),
      };

      let response;
      try {
        response = await admin.messaging().sendEachForMulticast(message);
      } catch (err) {
        if (err.code === "app/invalid-credential") {
          fcmDisabled = true;
          console.error("FCM disabled: invalid Firebase credentials");
          return;
        }
        throw err;
      }

      /* ---------- CLEANUP INVALID TOKENS ---------- */
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
        await prisma.fCMToken.deleteMany({
          where: { token: { in: invalidTokens } },
        });
      }

      return response;

    } catch (error) {
      console.error("Notification service error:", error);
    }
  }
}

/* ---------------- FCM ERROR HANDLER ---------------- */
async function handleFCMError(err, tokens = []) {
  if (err.code === "app/invalid-credential") {
    fcmDisabled = true;
    console.error("Firebase Admin credential invalid. FCM disabled.");
    return;
  }
  if (
    err.code === "messaging/registration-token-not-registered" ||
    err.code === "messaging/invalid-registration-token"
  ) {
    await prisma.fCMToken.deleteMany({
      where: { token: { in: tokens } },
    });
    return;
  }

  console.error("FCM send error:", err.code || err.message);
}

/* ---------------- HELPER: STRINGIFY DATA ---------------- */
function stringifyData(data) {
  const result = {};
  for (const key in data) {
    result[key] = String(data[key]);
  }
  return result;
}

module.exports = NotificationService;
