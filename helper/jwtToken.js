const jwt = require("jsonwebtoken");

/* ---------- GENERATE ACCESS TOKEN ---------- */
const GenerateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      type: "access",
    },
    process.env.JWT_SECRET_KEY,
    { expiresIn: "15m" }
  );
};

/* ---------- GENERATE REFRESH TOKEN ---------- */
const GenerateRefreshToken = (user, tokenVersion) => {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      tokenVersion,
      type: "refresh",
    },
    process.env.JWT_SECRET_KEY,
    { expiresIn: "7d" }
  );
};

/* ---------------- GENERATE A JWT TOKEN ---------------- */
const assignToken = (user) => {
  const payload = {
    id: user.id,
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET_KEY, {
    expiresIn: "7d",
  });
  return token;
};

/* ---------------- VERIFY JWT TOKEN ---------------- */
const verifyToken = (token) => {
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET_KEY);
    return user;
  } catch (error) {
    // Re-throw the error to be handled by caller
    // Don't log here - let the caller decide how to handle
    throw error;
  }
};

module.exports = {
  assignToken,
  verifyToken,
  GenerateAccessToken,
  GenerateRefreshToken,
};
