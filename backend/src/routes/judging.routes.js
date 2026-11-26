const express = require("express");
const router = express.Router();

const Judging = require("../models/Judging");
const Project = require("../models/Project");
const Hackathon = require("../models/Hackathon");

const authenticateToken = require("../middleware/auth.middleware");
const authorizeRole = require("../middleware/authorizeRole");

// POST /judging
// Judge submits or updates a project's score.
router.post(
  "/",
  authenticateToken,
  authorizeRole("JUDGE"),
  async (req, res) => {
    try {
      const {
        projectId,
        innovationScore,
        technicalScore,
        presentationScore,
        usefulnessScore,
        comments = "",
      } = req.body;

      if (
        !projectId ||
        innovationScore === undefined ||
        technicalScore === undefined ||
        presentationScore === undefined ||
        usefulnessScore === undefined
      ) {
        return res.status(400).json({
          status: false,
          message: "Project ID and all four scores are required",
          data: null,
        });
      }

      const scores = [
        innovationScore,
        technicalScore,
        presentationScore,
        usefulnessScore,
      ];

      if (
        scores.some(
          (score) =>
            typeof score !== "number" ||
            !Number.isFinite(score) ||
            score < 0 ||
            score > 10
        )
      ) {
        return res.status(400).json({
          status: false,
          message: "Each score must be a number between 0 and 10",
          data: null,
        });
      }

      if (typeof comments !== "string" || comments.length > 1000) {
        return res.status(400).json({
          status: false,
          message: "Comments must be text with a maximum of 1000 characters",
          data: null,
        });
      }

      const project = await Project.findById(projectId).exec();

      if (!project) {
        return res.status(404).json({
          status: false,
          message: "Project not found",
          data: null,
        });
      }

      const hackathon = await Hackathon.findById(project.hackathonId).exec();

      if (!hackathon) {
        return res.status(404).json({
          status: false,
          message: "Hackathon not found",
          data: null,
        });
      }

      // Judges can score only projects that have been submitted.
      if (project.status !== "SUBMITTED") {
        return res.status(400).json({
          status: false,
          message: "Only submitted projects can be judged",
          data: null,
        });
      }

      const judging = await Judging.findOneAndUpdate(
        {
          projectId: project._id,
          judgeId: req.user.userId || req.user.id,
        },
        {
          $set: {
            projectId: project._id,
            judgeId: req.user.userId || req.user.id,
            hackathonId: project.hackathonId,
            innovationScore,
            technicalScore,
            presentationScore,
            usefulnessScore,
            comments: comments.trim(),
          },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      ).exec();

      return res.status(200).json({
        status: true,
        message: "Project score saved successfully",
        data: {
          judging,
          totalScore:
            innovationScore +
            technicalScore +
            presentationScore +
            usefulnessScore,
        },
      });
    } catch (error) {
      console.error("Save judging score error:", error);

      if (error.name === "CastError") {
        return res.status(400).json({
          status: false,
          message: "Invalid project ID",
          data: null,
        });
      }

      if (error.code === 11000) {
        return res.status(409).json({
          status: false,
          message: "You have already scored this project",
          data: null,
        });
      }

      return res.status(500).json({
        status: false,
        message: "Failed to save project score",
        data: null,
      });
    }
  }
);

// GET /judging/hackathon/:hackathonId
// Judges and admins can view scores for a hackathon.
router.get(
  "/hackathon/:hackathonId",
  authenticateToken,
  authorizeRole("JUDGE", "ADMIN"),
  async (req, res) => {
    try {
      const { hackathonId } = req.params;

      const hackathon = await Hackathon.findById(hackathonId).exec();

      if (!hackathon) {
        return res.status(404).json({
          status: false,
          message: "Hackathon not found",
          data: null,
        });
      }

      const scores = await Judging.find({ hackathonId })
        .populate({
          path: "projectId",
          select: "title description status",
        })
        .populate({
          path: "judgeId",
          select: "name email",
        })
        .sort({ createdAt: -1 })
        .exec();

      return res.status(200).json({
        status: true,
        message: "Judging scores fetched successfully",
        data: scores,
      });
    } catch (error) {
      console.error("Fetch judging scores error:", error);

      if (error.name === "CastError") {
        return res.status(400).json({
          status: false,
          message: "Invalid hackathon ID",
          data: null,
        });
      }

      return res.status(500).json({
        status: false,
        message: "Failed to fetch judging scores",
        data: null,
      });
    }
  }
);

module.exports = router;