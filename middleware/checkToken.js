const { verifyToken } = require("../helper/jwtToken");

/* ---------------- CHECK USER AUTH TOKEN ---------------- */
const checkAuthToken = () => {
  return (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
      res.status(404).json({
        success: false,
        msg: "Login Required!",
      });

      return next();
    }

    try {
      const User = verifyToken(token);
      req.user = User;
    } catch (error) {
      console.error("Error :", error);
    }

    return next();
  };
};

module.exports = { checkAuthToken };
