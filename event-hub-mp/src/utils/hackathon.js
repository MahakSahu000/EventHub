const express = require("express");
const router = express.Router();
const { Hackathon } = require("../models");

const authenticateToken = require("../middleware/auth.middleware");
const authorizeRole = require("../middleware/authorizeRole");
const { isValidId } = require("../utils/objectId");
const { Team, TeamInvite } = require("../models");
const { sendOk, sendError } = require("../utils/response");
const { logAudit } = require("../utils/audit");
const { emitAll } = require("../utils/socket");
const { PHASES, MIN_TEAM_SIZE, MAX_TEAM_SIZE, getPhase } = require("../utils/hackathon");


router.post(
  "/",
  authenticateToken,
  authorizeRole("ADMIN"),
  async (req, res) => {
    try {
      const {
        title,
        description,
        theme,
        location,
        mode,
        startDate,
        endDate,
        regDeadline,
        maxTeamSize,
      } = req.body;

      if (
        !title ||
        !description ||
        !startDate ||
        !endDate ||
        !regDeadline
      ) {
        return res.status(400).json({
          success: false,
          message: "Required fields are missing",
        });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      const deadline = new Date(regDeadline);
      const teamSize = maxTeamSize ?? 4;

      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        Number.isNaN(deadline.getTime())
      ) {
        return res.status(400).json({
          success: false,
          message: "Please provide valid dates",
        });
      }

      if (end <= start) {
        return res.status(400).json({
          success: false,
          message: "End date must be after start date",
        });
      }

      if (
        !Number.isInteger(teamSize) ||
        teamSize < MIN_TEAM_SIZE ||
        teamSize > MAX_TEAM_SIZE
      ) {
        return res.status(400).json({
          success: false,
          message: `maxTeamSize must be between ${MIN_TEAM_SIZE} and ${MAX_TEAM_SIZE}`,
        });
      }

      const hackathon = await Hackathon.create({
        title,
        description,
        theme: theme || null,
        location: location || null,
        mode: mode || "ONLINE",
        startDate: start,
        endDate: end,
        regDeadline: deadline,
        maxTeamSize: teamSize,
      });

      return res.status(201).json({
        success: true,
        message: "Hackathon created successfully",
        data: hackathon,
      });
    } catch (error) {
      console.error("Create hackathon error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create hackathon",
      });
    }
  }
);


// 2. GET ALL HACKATHONS
// GET /hackathons
router.get("/", async (req, res) => {
  try {
    const hackathons = await Hackathon.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: hackathons.length,
      data: hackathons,
    });
  } catch (error) {
    console.error("Get hackathons error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch hackathons",
    });
  }
});

// 3. GET HACKATHON BY ID 
router.get("/:id", async (req, res) => {
  try {
    const hackathon = isValidId(req.params.id)
      ? await Hackathon.findById(req.params.id)
      : null;

    if (!hackathon) {
      return res.status(404).json({
        success: false,
        message: "Hackathon not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: hackathon,
    });
  } catch (error) {
    console.error("Get hackathon error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch hackathon",
    });
  }
});


// 4. UPDATE HACKATHON (ADMIN ONLY)
// PUT /hackathons/:id
router.put(
  "/:id",
  authenticateToken,
  authorizeRole("ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const {
        title,
        description,
        theme,
        location,
        mode,
        startDate,
        endDate,
        regDeadline,
        status,
        maxTeamSize,
      } = req.body;

      const existingHackathon = isValidId(id)
        ? await Hackathon.findById(id)
        : null;

      if (!existingHackathon) {
        return res.status(404).json({
          success: false,
          message: "Hackathon not found",
        });
      }

      const data = {};

      if (title !== undefined) {
        if (typeof title !== "string" || !title.trim()) {
          return res.status(400).json({
            success: false,
            message: "title must be a non-empty string",
          });
        }
        data.title = title.trim();
      }

      if (description !== undefined) {
        if (
          typeof description !== "string" ||
          !description.trim()
        ) {
          return res.status(400).json({
            success: false,
            message: "description must be a non-empty string",
          });
        }
        data.description = description.trim();
      }

      if (theme !== undefined) data.theme = theme;
      if (location !== undefined) data.location = location;
      if (mode !== undefined) data.mode = mode;
      if (status !== undefined) data.status = status;

      if (maxTeamSize !== undefined) {
        if (
          !Number.isInteger(maxTeamSize) ||
          maxTeamSize < 1
        ) {
          return res.status(400).json({
            success: false,
            message: "maxTeamSize must be a positive integer",
          });
        }

        data.maxTeamSize = maxTeamSize;
      }

      for (const field of [
        "startDate",
        "endDate",
        "regDeadline",
      ]) {
        if (req.body[field] !== undefined) {
          const date = new Date(req.body[field]);

          if (Number.isNaN(date.getTime())) {
            return res.status(400).json({
              success: false,
              message: `Invalid date for ${field}`,
            });
          }

          data[field] = date;
        }
      }

      const finalStart =
        data.startDate || existingHackathon.startDate;

      const finalEnd =
        data.endDate || existingHackathon.endDate;

      if (finalEnd <= finalStart) {
        return res.status(400).json({
          success: false,
          message: "End date must be after start date",
        });
      }

      const updatedHackathon = await Hackathon.findByIdAndUpdate(
        id,
        data,
        { returnDocument: "after", runValidators: true }
      );

      return res.status(200).json({
        success: true,
        message: "Hackathon updated successfully",
        data: updatedHackathon,
      });
    } catch (error) {
      console.error("Update hackathon error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update hackathon",
      });
    }
  }
);

// PUT /hackathons/:id/phase { phase }  (ADMIN)
router.put(
  "/:id/phase",
  authenticateToken,
  authorizeRole("ADMIN"),
  async (req, res) => {
    try {
      const hackathon = isValidId(req.params.id)
        ? await Hackathon.findById(req.params.id)
        : null;
      if (!hackathon) return sendError(res, 404, "Hackathon not found");

      const newPhase = String(req.body.phase || "").toUpperCase();
      const currentIndex = PHASES.indexOf(getPhase(hackathon));
      const newIndex = PHASES.indexOf(newPhase);

      if (newIndex === -1) {
        return sendError(res, 400, "Phase must be one of: " + PHASES.join(", "));
      }
      if (newIndex !== currentIndex + 1) {
        return sendError(
          res,
          400,
          "Can only move to next phase (" + (PHASES[currentIndex + 1] || "none") + ")"
        );
      }

      const oldPhase = getPhase(hackathon);
      hackathon.phase = newPhase;

      let lockedTeams = 0;
      if (newPhase === "CHECK_IN") {
        // registration ends here, so close it and lock every team
        hackathon.registrationOpen = false;
        const result = await Team.updateMany(
          { hackathonId: hackathon._id, locked: false },
          { locked: true, lockedAt: new Date() }
        );
        lockedTeams = result.modifiedCount;
        await TeamInvite.updateMany(
          { hackathonId: hackathon._id, status: "PENDING" },
          { status: "CANCELLED" }
        );
      }
      if (newPhase === "HACKATHON") hackathon.status = "ONGOING";
      if (newPhase === "COMPLETED") hackathon.status = "COMPLETED";

      await hackathon.save();

      await logAudit(req.user.userId, "HACKATHON_PHASE_CHANGE", "Hackathon", hackathon.id, {
        from: oldPhase,
        to: newPhase,
        lockedTeams: lockedTeams,
      });
      emitAll("hackathon:update", { hackathonId: hackathon.id, phase: newPhase });

      return sendOk(res, 200, "Phase changed to " + newPhase, hackathon);
    } catch (error) {
      console.error("Change phase error:", error);
      return sendError(res, 500, "Failed to change phase");
    }
  }
);

// POST /hackathons/:id/close-registration  (ADMIN)
router.post(
  "/:id/close-registration",
  authenticateToken,
  authorizeRole("ADMIN"),
  async (req, res) => {
    try {
      const hackathon = isValidId(req.params.id)
        ? await Hackathon.findById(req.params.id)
        : null;
      if (!hackathon) return sendError(res, 404, "Hackathon not found");

      if (hackathon.registrationOpen === false) {
        return sendError(res, 400, "Registrations are already closed");
      }

      hackathon.registrationOpen = false;
      await hackathon.save();

      await logAudit(req.user.userId, "REGISTRATION_CLOSED", "Hackathon", hackathon.id, {
        title: hackathon.title,
      });
      emitAll("hackathon:update", { hackathonId: hackathon.id });

      return sendOk(res, 200, "Registrations closed", hackathon);
    } catch (error) {
      console.error("Close registration error:", error);
      return sendError(res, 500, "Failed to close registrations");
    }
  }
);

// 5. DELETE HACKATHON (ADMIN ONLY)
router.delete(
  "/:id",
  authenticateToken,
  authorizeRole("ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const hackathon = isValidId(id)
        ? await Hackathon.findById(id)
        : null;

      if (!hackathon) {
        return res.status(404).json({
          success: false,
          message: "Hackathon not found",
        });
      }

      await hackathon.deleteOne();

      await logAudit(req.user.userId, "HACKATHON_DELETE", "Hackathon", id, {
        title: hackathon.title,
      });

      return res.status(200).json({
        success: true,
        message: "Hackathon deleted successfully",
      });
    } catch (error) {
      console.error("Delete hackathon error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete hackathon",
      });
    }
  }
);

module.exports = router;