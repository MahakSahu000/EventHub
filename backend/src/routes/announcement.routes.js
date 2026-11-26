const express = require("express");
const router = express.Router();
const { Hackathon, Announcement } = require("../models");
const authenticateToken = require("../middleware/auth.middleware");
const authorizeRole = require("../middleware/authorizeRole");
const { isValidId } = require("../utils/objectId");
const { sendOk, sendError } = require("../utils/response");
const { logAudit } = require("../utils/audit");
const { emitAll } = require("../utils/socket");

// GET /announcements?hackathonId=...
router.get("/", authenticateToken, async (req, res) => {
  try {
    if (!isValidId(req.query.hackathonId)) return sendError(res, 400, "Valid hackathonId is required");
    const list = await Announcement.find({ hackathonId: req.query.hackathonId })
      .populate({ path: "createdBy", select: "name" })
      .sort({ createdAt: -1 });
    return sendOk(res, 200, "Announcements fetched successfully", list);
  } catch (error) {
    console.error("Get announcements error:", error);
    return sendError(res, 500, "Failed to fetch announcements");
  }
});

// POST /announcements  (admin)  { hackathonId, title, message }
router.post("/", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const { hackathonId, title, message } = req.body;
    const hackathon = isValidId(hackathonId) ? await Hackathon.findById(hackathonId) : null;
    if (!hackathon) return sendError(res, 404, "Hackathon not found");

    if (typeof title !== "string" || !title.trim() || typeof message !== "string" || !message.trim()) {
      return sendError(res, 400, "title and message are required");
    }

    const announcement = await Announcement.create({
      hackathonId,
      title: title.trim(),
      message: message.trim(),
      createdById: req.user.userId,
    });

    await logAudit(req.user.userId, "ANNOUNCEMENT_CREATE", "Announcement", announcement.id, {
      title: announcement.title,
    });

    // send to everyone online
    emitAll("announcement:new", {
      id: announcement.id,
      hackathonId: hackathonId,
      title: announcement.title,
      message: announcement.message,
      createdAt: announcement.createdAt,
    });

    return sendOk(res, 201, "Announcement posted", announcement);
  } catch (error) {
    console.error("Create announcement error:", error);
    return sendError(res, 500, "Failed to post announcement");
  }
});

// DELETE /announcements/:id  (admin)
router.delete("/:id", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const a = isValidId(req.params.id) ? await Announcement.findById(req.params.id) : null;
    if (!a) return sendError(res, 404, "Announcement not found");

    await a.deleteOne();
    await logAudit(req.user.userId, "ANNOUNCEMENT_DELETE", "Announcement", a.id, { title: a.title });
    emitAll("announcement:deleted", { id: a.id, hackathonId: String(a.hackathonId) });

    return sendOk(res, 200, "Announcement deleted", null);
  } catch (error) {
    console.error("Delete announcement error:", error);
    return sendError(res, 500, "Failed to delete announcement");
  }
});

module.exports = router;
