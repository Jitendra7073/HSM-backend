const { verifyToken } = require("../helper/jwtToken");

/* ---------------- CHECK USER AUTH TOKEN ---------------- */
const checkAuthToken = () => {
  return (req, res, next) => {
    const token = req.cookies.accessToken;

    if (!token) {
      res.status(401).json({
        success: false,
        msg: "Access token required!",
      });
      return;
    }

    try {
      const User = verifyToken(token);
      if (User.type !== "access") {
        res.status(401).json({
          success: false,
          msg: "Invalid token type!",
        });
        return;
      }
      req.user = User;
      next();
    } catch (error) {
      console.error("Token verification error:", error);
      res.status(401).json({
        success: false,
        msg: "Invalid or expired access token!",
      });
    }
  };
};

module.exports = { checkAuthToken };
