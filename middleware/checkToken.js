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

    // Atomically rotate the refresh token to avoid gaps/races
    await prisma.refreshToken.update({
      where: { token: refreshToken },
      data: {
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Set new cookies
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 15 * 60 * 1000,
      path: "/",
      ...(isProduction && { domain: process.env.COOKIE_DOMAIN || undefined }),
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
    // Silent fail - only log if it's not a common JWT error
    if (
      error.name !== "JsonWebTokenError" &&
      error.name !== "TokenExpiredError"
    ) {
      console.error("Refresh token error:", error.message);
    }
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

      // Check if user is restricted (skip for admin users)
      const user = await prisma.user.findUnique({
        where: { id: User.id },
        select: {
          isRestricted: true,
          role: true,
          id: true,
          name: true,
          email: true,
          mobile: true,
          tokenVersion: true,
          createdAt: true,
          businessProfile: {
            select: {
              isApproved: true,
              isRestricted: true,
              isRejected: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          msg: "User not found!",
        });
      }

      const isProfileRoute = req.originalUrl.includes("/api/v1/profile");

      if (user.isRestricted && user.role !== "admin" && !isProfileRoute) {
        if (user.role !== "provider") {
          return res.status(403).json({
            success: false,
            msg: "Your account has been restricted. Please contact support.",
          });
        }
      }
      req.user = user;
      next();
    } catch (error) {
      if (refreshToken) {
        const result = await refreshAccessToken(refreshToken, res);

        if (result) {
          const user = await prisma.user.findUnique({
            where: { id: result.user.id },
            select: {
              isRestricted: true,
              role: true,
              id: true,
              name: true,
              email: true,
              mobile: true,
              tokenVersion: true,
              createdAt: true,
              businessProfile: {
                select: {
                  isApproved: true,
                  isRestricted: true,
                  isRejected: true,
                },
              },
            },
          });

          const isProfileRoute = req.originalUrl.includes("/api/v1/profile");

          // 1. GLOBAL USER RESTRICTION
          if (
            user.isRestricted &&
            user.role !== "admin" &&
            user.role !== "provider" &&
            !isProfileRoute
          ) {
            return res.status(403).json({
              success: false,
              msg: "Your account has been restricted. Please contact support for assistance.",
            });
          }
          req.user = user || result.user;
          return next();
        }

        // Refresh failed - only log if it's an unexpected error
        if (
          error.name !== "JsonWebTokenError" &&
          error.name !== "TokenExpiredError"
        ) {
          console.error("Token verification and refresh failed:", error.name);
        }
      } else {
        // No refresh token - only log unexpected errors
        if (
          error.name !== "JsonWebTokenError" &&
          error.name !== "TokenExpiredError"
        ) {
          console.error(
            "Token verification failed (no refresh token):",
            error.name
          );
        }
      }

      // If refresh failed or no refresh token, return error
      return res.status(401).json({
        success: false,
        msg: "Invalid or expired access token!",
        refreshRequired: true,
      });
    }
  };
};

module.exports = { checkAuthToken };
