const prisma = require("../prismaClient");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const {
  SignUpSchema,
  LogInSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} = require("../helper/validation/auth.validation");
const { assignToken, verifyToken } = require("../helper/jwtToken");
const { sendMail } = require("../utils/sendmail");

/* ---------------- EMAIL TEMPLATES ---------------- */
const {
  welcomeUserTamplate,
  forgotPasswordTamplate,
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

    res
      .status(201)
      .json({ success: true, message: "User registered successfully", user });

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

    const token = assignToken(user);

    res.cookie("token", token, {
      httpOnly: false,
      // secure: true,
      secure: process.env.NODE_ENV === "development",
      sameSite: "lax",
      maxAge: 60 * 60 * 1000,
      path: "/",
    });

    res.status(200).json({
      success: true,
      message: "Login Successfully",
      role: user.role,
      token,
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
      message: `Reset link Sended Successfully to ${value.email}`,
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
      data: { password: hashed },
    });

    await prisma.resetToken.delete({ where: { token } });

    res
      .status(200)
      .json({ success: true, message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ---------------- LOGOUT ---------------- */
const logout = async (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(400).send({
      success: false,
      msg: "Login required",
    });
  }

  res.clearCookie("token");

  return res.status(200).json({
    success: true,
    msg: "Logout Successfully.",
  });
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  logout,
};
