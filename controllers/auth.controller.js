const prisma = require("../prismaClient");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const {
  SignUpSchema,
  LogInSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} = require("../helper/validation/auth.validation");
const {
  assignToken,
  verifyToken,
  GenerateAccessToken,
  GenerateRefreshToken,
} = require("../helper/jwtToken");
const { sendMail } = require("../utils/sendmail");

/* ---------------- EMAIL TEMPLATES ---------------- */
const {
  welcomeUserTamplate,
  forgotPasswordTamplate,
  newProviderRegisteredTemplate,
} = require("../helper/mail-tamplates/tamplates");

/* ---------------- REGISTRATION ---------------- */
const register = async (req, res) => {
  const { error, value } = SignUpSchema.validate(req.body, {
    abortEarly: false,
  });
  if (error)
    return res
      .status(400)
      .json({ success: false, errors: error.details.map((e) => e.message) });

  try {
    const isExist = await prisma.user.findUnique({
      where: { email: value.email },
    });
    if (isExist)
      return res
        .status(400)
        .json({ success: false, message: "User already registered" });

    const hashed = await bcrypt.hash(value.password, 10);
    const user = await prisma.user.create({
      data: { ...value, password: hashed },
    });

    const accessToken = GenerateAccessToken(user);
    const refreshToken = GenerateRefreshToken(user, user.tokenVersion);

    // Store refresh token in database
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Set cookies
    // Determine cookie settings based on environment
    const isProduction = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: "/",
      ...(isProduction && { domain: process.env.COOKIE_DOMAIN || undefined }),
    };

    const refreshCookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
      ...(isProduction && { domain: process.env.COOKIE_DOMAIN || undefined }),
    };

    res.cookie("accessToken", accessToken, cookieOptions);

    res.cookie("refreshToken", refreshToken, refreshCookieOptions);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      accessToken,
    });

    if (value.role == "provider") {
      const admins = await prisma.user.findMany({
        where: { role: "admin" },
      });

      admins.forEach((admin) => {
        sendMail({
          email: admin.email,
          subject: "New Provider Registered",
          template: newProviderRegisteredTemplate({
            adminName: admin.name,
            providerName: value.name,
            providerEmail: value.email,
          }),
        });
      });
    }

    sendMail({
      email: value.email,
      subject: "Welcome to Home Service Management",
      template: welcomeUserTamplate(value.name),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ---------------- LOGIN ---------------- */
const login = async (req, res) => {
  const { error, value } = LogInSchema.validate(req.body);
  if (error)
    return res
      .status(400)
      .json({ success: false, errors: error.details.map((e) => e.message) });

  try {
    const user = await prisma.user.findUnique({
      where: { email: value.email },
    });
    if (!user)
      return res
        .status(400)
        .json({ success: false, message: "User not found" });

    const validPass = await bcrypt.compare(value.password, user.password);
    if (!validPass)
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });

    // Generate tokens
    const accessToken = GenerateAccessToken(user);
    const refreshToken = GenerateRefreshToken(user, user.tokenVersion);

    // Store refresh token in database
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Set cookies
    // Determine cookie settings based on environment
    const isProduction = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: "/",
      ...(isProduction && { domain: process.env.COOKIE_DOMAIN || undefined }),
    };

    const refreshCookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
      ...(isProduction && { domain: process.env.COOKIE_DOMAIN || undefined }),
    };

    res.cookie("accessToken", accessToken, cookieOptions);

    res.cookie("refreshToken", refreshToken, refreshCookieOptions);

    res.status(200).json({
      success: true,
      message: "Login Successfully",
      role: user.role,
      accessToken, // Also send in response for immediate use
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ---------------- FORGOT PASSWORD ---------------- */
const forgotPassword = async (req, res) => {
  const { error, value } = ForgotPasswordSchema.validate(req.body);
  if (error)
    return res
      .status(400)
      .json({ success: false, errors: error.details.map((e) => e.message) });

  try {
    const user = await prisma.user.findUnique({
      where: { email: value.email },
    });
    if (!user)
      return res
        .status(400)
        .json({ success: false, message: "Email not found" });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 15); // 15 min

    await prisma.resetToken.create({
      data: { token, userId: user.id, expiresAt },
    });

    await sendMail({
      email: value.email,
      subject: "Password Reset Request",
      template: forgotPasswordTamplate(user.name, token),
    });
    res.status(200).json({
      success: true,
      message: `Reset link Sent Successfully to ${value.email}`,
      token,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ---------------- RESET PASSWORD ---------------- */
const resetPassword = async (req, res) => {
  const { token } = req.query;
  const { error, value } = ResetPasswordSchema.validate(req.body);
  if (error)
    return res
      .status(400)
      .json({ success: false, errors: error.details.map((e) => e.message) });

  try {
    const resetRecord = await prisma.resetToken.findUnique({
      where: { token },
    });

    if (!resetRecord)
      return res.status(400).json({ success: false, message: "Invalid Token" });

    if (resetRecord.expiresAt < new Date()) {
      await prisma.resetToken.delete({ where: { token } });
      return res
        .status(400)
        .json({ success: false, message: "Token is expired." });
    }
    const hashed = await bcrypt.hash(value.newPassword, 10);
    await prisma.user.update({
      where: { id: resetRecord.userId },
      data: {
        password: hashed,
        tokenVersion: { increment: 1 }, // Invalidate all refresh tokens
      },
    });

    // Delete all refresh tokens for this user
    await prisma.refreshToken.deleteMany({
      where: { userId: resetRecord.userId },
    });

    await prisma.resetToken.delete({ where: { token } });

    res
      .status(200)
      .json({ success: true, message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ---------------- REFRESH TOKEN ---------------- */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.cookies;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Refresh token not provided",
      });
    }

    // Verify refresh token
    const decoded = verifyToken(token);

    if (decoded.type !== "refresh") {
      return res.status(401).json({
        success: false,
        message: "Invalid token type",
      });
    }

    // Check if refresh token exists in database
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      });
    }

    // Generate new tokens
    const user = storedToken.user;
    const newAccessToken = GenerateAccessToken(user);
    const newRefreshToken = GenerateRefreshToken(user, user.tokenVersion);

    // Rotate the refresh token in-place to avoid gaps/races
    await prisma.refreshToken.update({
      where: { token },
      data: {
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Determine cookie settings based on environment
    const isProduction = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: "/",
      ...(isProduction && { domain: process.env.COOKIE_DOMAIN || undefined }),
    };

    const refreshCookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
      ...(isProduction && { domain: process.env.COOKIE_DOMAIN || undefined }),
    };

    res.cookie("accessToken", newAccessToken, cookieOptions);

    res.cookie("refreshToken", newRefreshToken, refreshCookieOptions);

    res.status(200).json({
      success: true,
      message: "Tokens refreshed successfully",
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid refresh token",
    });
  }
};

/* ---------------- LOGOUT ---------------- */
const logout = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (refreshToken) {
    // Delete refresh token from database
    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }

  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");

  return res.status(200).json({
    success: true,
    msg: "Logout Successfully.",
  });
};

/* ---------------- LOGOUT FROM ALL DEVICES ---------------- */
const logoutAll = async (req, res) => {
  const userId = req.user.id;

  // Increment token version to invalidate all existing refresh tokens
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });

  // Delete all refresh tokens for this user
  await prisma.refreshToken.deleteMany({
    where: { userId },
  });

  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");

  return res.status(200).json({
    success: true,
    msg: "Logged out from all devices successfully.",
  });
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
  logoutAll,
};
