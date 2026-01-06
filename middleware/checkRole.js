const prisma = require("../prismaClient");

/* ---------------- USER ROLE BASE ACCESS ---------------- */
const RoleBasedAccess = (role) => {
  return async (req, res, next) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (user.role != role && user.role != "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Unauthorized User.",
      });
    }
    return next();
  };
};

module.exports = { RoleBasedAccess };
