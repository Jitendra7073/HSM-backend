const jwt = require("jsonwebtoken");

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
  const user = jwt.verify(token, process.env.JWT_SECRET_KEY);
  return user;
};

module.exports = {
  assignToken,
  verifyToken,
};
