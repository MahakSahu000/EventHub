const express = require("express");
const router = express.Router();
const { AuditLog } = require("../models");
const authenticateToken = require("../middleware/auth.middleware");
const authorizeRole = require("../middleware/authorizeRole");
const { sendOk, sendError } = require("../utils/response");

// GET /audit-logs?limit=100  (admin)
router.get("/", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    let limit = parseInt(req.query.limit) || 100;
    if (limit > 500) limit = 500;

    const logs = await AuditLog.find()
      .populate({ path: "actor", select: "name email" })
      .sort({ createdAt: -1 })
      .limit(limit);

    return sendOk(res, 200, "Audit logs fetched successfully", logs);
  } catch (error) {
    console.error("Get audit logs error:", error);
    return sendError(res, 500, "Failed to fetch audit logs");
  }
});

module.exports = router;
