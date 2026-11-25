const express = require("express");
const router = express.Router();
const { Hackathon, HackathonRegistration } = require("../models");
const authenticateToken = require("../middleware/auth.middleware");
const authorizeRole = require("../middleware/authorizeRole");
const { isValidId } = require("../utils/objectId");
const { isRegistrationOpen, findUserTeamMember } = require("../utils/hackathon");

// ========================================
// POST /hackathons/:id/register
// Register the logged-in user
// ========================================
router.post(
  "/hackathons/:id/register",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const hackathonId = req.params.id;

      const hackathon = isValidId(hackathonId)
        ? await Hackathon.findById(hackathonId)
        : null;

      if (!hackathon) {
        return res.status(404).json({
          success: false,
          message: "Hackathon not found",
        });
      }

      if (
        (hackathon.status || "").toUpperCase() !== "UPCOMING" ||
        !isRegistrationOpen(hackathon)
      ) {
        return res.status(400).json({
          success: false,
          message: "Registration is not available for this hackathon",
        });
      }

      // older records store the deadline as registrationEndDate
      const deadline = hackathon.regDeadline || hackathon.get("registrationEndDate");

      if (!deadline || new Date() > new Date(deadline)) {
        return res.status(400).json({
          success: false,
          message: "Registration deadline has passed",
        });
      }

      const registration = await HackathonRegistration.create({
        userId,
        hackathonId,
      });

      return res.status(201).json({
        success: true,
        message: "Hackathon registration successful",
        data: registration,
      });
    } catch (error) {
      console.error("Registration error:", error);

      // Duplicate key (userId + hackathonId)
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "You are already registered for this hackathon",
        });
      }

      // Referenced user / hackathon does not exist
      if (error.name === "ValidationError") {
        return res.status(404).json({
          success: false,
          message: "User or hackathon not found",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to register for hackathon",
      });
    }
  }
);

// ========================================
// GET /hackathons/:id/registrations
// Admin only: View all registrations
// ========================================
router.get(
  "/hackathons/:id/registrations",
  authenticateToken,
  authorizeRole("ADMIN"),
  async (req, res) => {
    try {
      const hackathonId = req.params.id;

      const hackathon = isValidId(hackathonId)
        ? await Hackathon.findById(hackathonId)
        : null;

      if (!hackathon) {
        return res.status(404).json({
          success: false,
          message: "Hackathon not found",
        });
      }

      const registrations = await HackathonRegistration.find({ hackathonId })
        .populate({ path: "user", select: "name email" })
        .sort({ registeredAt: -1 });

      return res.status(200).json({
        success: true,
        count: registrations.length,
        data: registrations,
      });
    } catch (error) {
      console.error("Get registrations error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch registrations",
      });
    }
  }
);

// ========================================
// GET /hackathons/:id/registrations/me
// View the logged-in user's registration
// ========================================
router.get(
  "/hackathons/:id/registrations/me",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const hackathonId = req.params.id;

      const registration =
        isValidId(userId) && isValidId(hackathonId)
          ? await HackathonRegistration.findOne({ userId, hackathonId })
          : null;

      if (!registration) {
        return res.status(404).json({
          success: false,
          message: "Registration not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: registration,
      });
    } catch (error) {
      console.error("Get my registration error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch registration",
      });
    }
  }
);

// ========================================
// DELETE /hackathons/:id/register
// Cancel the logged-in user's registration
// ========================================
router.delete(
  "/hackathons/:id/register",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const hackathonId = req.params.id;

      const registration =
        isValidId(userId) && isValidId(hackathonId)
          ? await HackathonRegistration.findOne({ userId, hackathonId })
          : null;

      if (!registration) {
        return res.status(404).json({
          success: false,
          message: "Registration not found",
        });
      }

      // must leave the team first
      const inTeam = await findUserTeamMember(userId, hackathonId);
      if (inTeam) {
        return res.status(400).json({
          success: false,
          message: "Leave or delete your team before cancelling registration",
        });
      }

      await registration.deleteOne();

      return res.status(200).json({
        success: true,
        message: "Registration cancelled successfully",
      });
    } catch (error) {
      console.error("Cancel registration error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to cancel registration",
      });
    }
  }
);

module.exports = router;
