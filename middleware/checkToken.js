const { verifyToken } = require("../helper/jwtToken");
const prisma = require("../prismaClient");
const {
  GenerateAccessToken,
  GenerateRefreshToken,
} = require("../helper/jwtToken");

/* ---------------- REFRESH ACCESS TOKEN HELPER ---------------- */
const refreshAccessToken = async (refreshToken, res) => {
  try {
    // Verify refresh token
    const decoded = verifyToken(refreshToken);

    if (decoded.type !== "refresh") {
      return null;
    }

    // Check if refresh token exists in database
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      return null;
    }

    // Generate new tokens
    const user = storedToken.user;
    const newAccessToken = GenerateAccessToken(user);
    const newRefreshToken = GenerateRefreshToken(user, user.tokenVersion);

    // Delete old refresh token and create new one (token rotation)
    await prisma.refreshToken.delete({ where: { token: refreshToken } });
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Set new cookies
    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60 * 1000, 
      path: "/",
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    });

    return { accessToken: newAccessToken, user };
  } catch (error) {
    console.error("Refresh token error:", error);
    return null;
  }
};

/* ---------------- CHECK USER AUTH TOKEN ---------------- */
const checkAuthToken = () => {
  return async (req, res, next) => {
    const token = req.cookies.accessToken;
    const refreshToken = req.cookies.refreshToken;

    // If no access token, try refresh token
    if (!token) {
      if (refreshToken) {
        const result = await refreshAccessToken(refreshToken, res);

        if (result) {
          req.user = result.user;
          return next();
        }
      }

      return res.status(401).json({
        success: false,
        msg: "Access token required!",
      });
    }

    try {
      // Try to verify access token
      const User = verifyToken(token);

      if (User.type !== "access") {
        return res.status(401).json({
          success: false,
          msg: "Invalid token type!",
        });
      }

      req.user = User;
      next();
    } catch (error) {
      // Access token expired or invalid
      console.error("Token verification error:", error.message);

      // If it's expired and we have a refresh token, try to refresh
      if (error.name === "TokenExpiredError" && refreshToken) {
        const result = await refreshAccessToken(refreshToken, res);

        if (result) {
          req.user = result.user;
          return next();
        }
      }

      // If refresh failed or no refresh token, return error
      return res.status(401).json({
        success: false,
        msg: "Invalid or expired access token!",
        refreshRequired: true, // Flag to tell frontend to redirect to login
      });
    }
  };
};

module.exports = { checkAuthToken };
