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
const {
  logUserActivity,
  logAuthFailure,
  logActionError,
  logError,
  logInfo,
  LogStatus,
} = require("../utils/logger");

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
    if (isExist) {
      // Log failed registration attempt
      await logAuthFailure({
        email: value.email,
        reason: "User already exists",
        req,
      });
      return res
        .status(400)
        .json({ success: false, message: "User already registered" });
    }

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

    // --- ASSIGN FREE PLAN IF PROVIDER ---
    if (value.role === "provider") {
      try {
        const freePlan = await prisma.providerSubscriptionPlan.findFirst({
          where: { price: 0, isActive: true },
        });

        if (freePlan) {
          await prisma.providerSubscription.create({
            data: {
              userId: user.id,
              planId: freePlan.id,
              status: "active",
              stripeSubscriptionId: `free_sub_${user.id}`,
              stripeCustomerId: `free_cust_${user.id}`,
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(
                new Date().setFullYear(new Date().getFullYear() + 100),
              ),
              cancelAtPeriodEnd: false,
              isActive: true,
            },
          });
        }
      } catch (planErr) {
        console.error("Failed to assign default free plan:", planErr);
      }
    }
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      accessToken,
    });

    if (value.role == "customer") {
      // create log
      await prisma.customerActivityLog.create({
        data: {
          customerId: user.id,
          actionType: "REGISTER",
          status: "SUCCESS",
          metadata: {
            name: value.name,
            email: value.email,
            role: value.role,
          },
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
    }
    // create log
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: user.id,
        actorType: req.user.role,
        actionType: "REGISTER",
        status: "SUCCESS",
        metadata: {
          name: value.name,
          email: value.email,
          role: value.role,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
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

    if (!user) {
      // Log failed login attempt - user not found (store in DB for admin tracking)
      await logAuthFailure({
        email: value.email,
        reason: "User not found",
        req,
      });
      return res
        .status(400)
        .json({ success: false, message: "User not found" });
    }

    const validPass = await bcrypt.compare(value.password, user.password);
    if (!validPass) {
      // Log failed login attempt - invalid password (store in DB for admin tracking)
      await logUserActivity({
        user,
        actionType: "LOGIN",
        status: LogStatus.FAILED,
        metadata: {
          email: value.email,
          reason: "Invalid password",
        },
        req,
        description: "Failed login attempt - incorrect password",
      });

      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });
    }

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

    // --- AUTO-ASSIGN FREE PLAN IF MISSING (PROVIDER) ---
    if (user.role === "provider") {
      try {
        const subscription = await prisma.providerSubscription.findUnique({
          where: { userId: user.id },
        });

        if (!subscription) {
          const freePlan = await prisma.providerSubscriptionPlan.findFirst({
            where: { price: 0, isActive: true },
          });

          if (freePlan) {
            await prisma.providerSubscription.create({
              data: {
                userId: user.id,
                planId: freePlan.id,
                status: "active",
                stripeSubscriptionId: `free_plan_${Date.now()}`,
                stripeCustomerId: `free_cust_${user.id}`,
                currentPeriodStart: new Date(),
                currentPeriodEnd: new Date(
                  new Date().setFullYear(new Date().getFullYear() + 100),
                ), // 100 years
                cancelAtPeriodEnd: false,
                isActive: true,
              },
            });
          }
        }
      } catch (planErr) {
        console.error("Failed to auto-assign free plan on login:", planErr);
      }
    }
    // ---------------------------------------------------

    // Log successful login to database for admin tracking
    await logUserActivity({
      user,
      actionType: "LOGIN",
      status: LogStatus.SUCCESS,
      metadata: {
        email: value.email,
        role: user.role,
        loginTime: new Date().toISOString(),
      },
      req,
      description: `Successful login for ${user.role}`,
    });

    res.status(200).json({
      success: true,
      message: "Login Successfully",
      role: user.role,
      accessToken, // Also send in response for immediate use
    });
  } catch (err) {
    logError("Login error", err, {
      email: value.email,
    });
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

    if (user.role == "customer") {
      // create log
      await prisma.customerActivityLog.create({
        data: {
          customerId: user.id,
          actionType: "PASSWORD_RESET_REQUEST",
          status: "EMAIL_SENT",
          metadata: {
            token,
            expiresAt,
          },
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
    }

    // create log
    await prisma.providerAdminActivityLog.create({
      data: {
        actorId: user.id,
        actorType: req.user.role,
        actionType: "PASSWORD_RESET_REQUEST",
        status: "EMAIL_SENT",
        metadata: {
          token,
          expiresAt,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
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
      include: { user: true }, // Include user data for logging
    });

    if (!resetRecord) {
      // Log invalid token attempt to database
      logWarning("Invalid password reset token attempted", {
        token: token?.substring(0, 10) + "...",
        ip: req.ip,
      });
      return res.status(400).json({ success: false, message: "Invalid Token" });
    }

    if (resetRecord.expiresAt < new Date()) {
      // Log expired token attempt to database
      await logUserActivity({
        user: resetRecord.user,
        actionType: "PASSWORD_RESET",
        status: LogStatus.FAILED,
        metadata: {
          reason: "Token expired",
          expiryTime: resetRecord.expiresAt.toISOString(),
        },
        req,
        description: "Password reset failed - token expired",
      });

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
        tokenVersion: { increment: 1 },
      },
    });

    // Delete all refresh tokens for this user (force re-login)
    await prisma.refreshToken.deleteMany({
      where: { userId: resetRecord.userId },
    });

    await prisma.resetToken.delete({ where: { token } });

    // Log successful password reset to database for admin tracking
    await logUserActivity({
      user: resetRecord.user,
      actionType: "PASSWORD_RESET",
      status: LogStatus.SUCCESS,
      metadata: {
        email: resetRecord.user.email,
        passwordChanged: true,
        allSessionsInvalidated: true,
      },
      req,
      description: "Password successfully reset and all sessions invalidated",
    });

    res
      .status(200)
      .json({ success: true, message: "Password reset successfully" });
  } catch (err) {
    logError("Reset password error", err, {
      token: token?.substring(0, 10) + "...",
    });
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
  try {
    const user = req.user;

    // Check if user is authenticated
    if (!user || !user.id) {
      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");
      return res.status(200).json({
        success: true,
        msg: "Logged out successfully.",
      });
    }

    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      // Delete refresh token from database
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    }

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    // Log logout activity to database for admin tracking
    await logUserActivity({
      user,
      actionType: "LOGOUT",
      status: LogStatus.SUCCESS,
      metadata: {
        email: user.email || "N/A",
        role: user.role || "unknown",
        logoutTime: new Date().toISOString(),
      },
      req,
      description: `User logged out successfully`,
    });

    return res.status(200).json({
      success: true,
      msg: "Logout Successfully.",
    });
  } catch (err) {
    logError("Logout error", err, {
      userId: req.user?.id,
      hasUser: !!req.user,
    });

    // Clear cookies even if logging fails
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    return res.status(200).json({
      success: true,
      msg: "Logged out successfully.",
    });
  }
};



module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,

};
