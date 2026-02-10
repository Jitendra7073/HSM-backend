const prisma = require("../prismaClient");
const jwt = require("jsonwebtoken");

/* ---------------- GET USER PROFILE ---------------- */
const getUserProfile = async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        role: true,
        availability: true,
        createdAt: true,
        addresses: true, // include all addresses
        businessProfile: true,
        providerSubscription: {
          select: {
            plan: {
              select: {
                name: true,
                price: true,
                currency: true,
                interval: true,
                maxServices: true,
                maxBookings: true,
                commissionRate: true,
              },
            },
            currentPeriodStart: true,
            currentPeriodEnd: true,
            status: true,
            cancelAtPeriodEnd: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, msg: "User not found." });
    }

    return res.status(200).json({
      success: true,
      msg: "User profile fetched successfully.",
      user,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      err,
      msg: "Server Error: Could not fetch user profile.",
    });
  }
};

/* ---------------- GET ME ---------------- */
const getMe = async (req, res) => {
  const token = req.params.token;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: true,
      message: "Token is required",
    });
  }

  try {
    // Verify token with proper error handling
    const user = jwt.verify(token, process.env.JWT_SECRET_KEY);

    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        error: true,
        message: "Invalid token payload",
      });
    }

    const userId = user.id;

    const userData = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        role: true,
        createdAt: true,
      },
    });

    if (!userData) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "User not found",
      });
    }

    return res.status(200).json({ success: true, user: userData });
  } catch (err) {
    // Handle JWT verification errors gracefully
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        error: true,
        message: "Invalid token signature",
      });
    }

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: true,
        message: "Token has expired",
      });
    }

    if (err.name === "NotBeforeError") {
      return res.status(401).json({
        success: false,
        error: true,
        message: "Token not active yet",
      });
    }

    console.error("getMe error:", err);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error while verifying token",
    });
  }
};

/* ---------------- DELETE PROFILE ---------------- */
const deleteProfile = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({
      success: false,
      msg: "User Id is required.",
    });
  }
  try {
    const res = await prisma.user.delete({
      where: { id: userId },
    });
    return res.status(200).json({
      success: true,
      msg: "User deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not delete user.",
    });
  }
};

module.exports = {
  getUserProfile,
  getMe,
  deleteProfile,
};
