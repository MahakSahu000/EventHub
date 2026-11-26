const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { isValidId } = require("../utils/objectId");

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      status: false,
      message: "Access token is required",
      data: null,
    });
  }

  const token = authHeader.split(" ")[1];

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is missing");
    return res.status(500).json({
      status: false,
      message: "Server configuration error",
      data: null,
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({
      status: false,
      message: "Invalid or expired access token",
      data: null,
    });
  }

  try {
    // check user still exists and was not force logged out
    const user = isValidId(decoded.userId)
      ? await User.findById(decoded.userId).select("role tokenVersion")
      : null;

    if (!user || (decoded.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({
        status: false,
        message: "Session expired, please login again",
        data: null,
      });
    }

    // always use latest role from database
    req.user = { userId: decoded.userId, role: user.role };
    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    return res.status(500).json({
      status: false,
      message: "Authentication failed",
      data: null,
    });
  }
}

module.exports = authenticateToken;
