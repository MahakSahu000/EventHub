const express = require("express");
const { Project } = require("../models");

const authenticateToken = require("../middleware/auth.middleware");
const authorizeRole = require("../middleware/authorizeRole");
const { isValidId } = require("../utils/objectId");

const router = express.Router();

// Shared populate config (same shape Prisma's `include` produced)
const projectPopulate = [
  { path: "user", select: "name email" },
  { path: "hackathon", select: "title" },
];

// 1. Submit a project
// Logged-in participant submits a project for themselves.
router.post(
  "/",
  authenticateToken,
  authorizeRole("PARTICIPANT", "ADMIN"),
  async (req, res) => {
    try {
      const {
        title,
        description,
        repositoryUrl,
        demoUrl,
        hackathonId,
      } = req.body;

      if (!title || !description || !hackathonId) {
        return res.status(400).json({
          message: "title, description and hackathonId are required",
        });
      }

      const project = await Project.create({
        title,
        description,
        repositoryUrl,
        demoUrl,
        userId: req.user.userId,
        hackathonId,
      });

      return res.status(201).json({
        message: "Project submitted successfully",
        project,
      });
    } catch (error) {
      console.error("Submit project error:", error);

      return res.status(500).json({
        message: "Failed to submit project",
      });
    }
  }
);

// 2. Get all projects
// Admin can view all projects.
router.get(
  "/",
  authenticateToken,
  authorizeRole("ADMIN"),
  async (req, res) => {
    try {
      const projects = await Project.find().populate(projectPopulate);

      return res.status(200).json({ projects });
    } catch (error) {
      console.error("Get projects error:", error);

      return res.status(500).json({
        message: "Failed to fetch projects",
      });
    }
  }
);

// 3. Get a single project
// Admin can view any project; participants can view their own.
router.get(
  "/:id",
  authenticateToken,
  authorizeRole("PARTICIPANT", "ADMIN"),
  async (req, res) => {
    try {
      const project = isValidId(req.params.id)
        ? await Project.findById(req.params.id).populate(projectPopulate)
        : null;

      if (!project) {
        return res.status(404).json({
          message: "Project not found",
        });
      }

      if (
        req.user.role.toUpperCase() !== "ADMIN" &&
        String(project.userId) !== req.user.userId
      ) {
        return res.status(403).json({
          message: "You can only view your own project",
        });
      }

      return res.status(200).json({ project });
    } catch (error) {
      console.error("Get project error:", error);

      return res.status(500).json({
        message: "Failed to fetch project",
      });
    }
  }
);

// 4. Update a project
// Admin can update any project; participants can update their own.
router.put(
  "/:id",
  authenticateToken,
  authorizeRole("PARTICIPANT", "ADMIN"),
  async (req, res) => {
    try {
      const {
        title,
        description,
        repositoryUrl,
        demoUrl,
        status,
      } = req.body;

      const existingProject = isValidId(req.params.id)
        ? await Project.findById(req.params.id)
        : null;

      if (!existingProject) {
        return res.status(404).json({
          message: "Project not found",
        });
      }

      if (
        req.user.role.toUpperCase() !== "ADMIN" &&
        String(existingProject.userId) !== req.user.userId
      ) {
        return res.status(403).json({
          message: "You can only update your own project",
        });
      }

      // Participants cannot change the project status directly.
      if (
        req.user.role.toUpperCase() !== "ADMIN" &&
        status !== undefined
      ) {
        return res.status(403).json({
          message: "Only an admin can change project status",
        });
      }

      const project = await Project.findByIdAndUpdate(
        req.params.id,
        {
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          ...(repositoryUrl !== undefined && { repositoryUrl }),
          ...(demoUrl !== undefined && { demoUrl }),
          ...(status !== undefined &&
            req.user.role.toUpperCase() === "ADMIN" && { status }),
        },
        { returnDocument: "after", runValidators: true }
      );

      return res.status(200).json({
        message: "Project updated successfully",
        project,
      });
    } catch (error) {
      console.error("Update project error:", error);

      return res.status(500).json({
        message: "Failed to update project",
      });
    }
  }
);

// 5. Delete a project
// Admin can delete any project; participants can delete their own.
router.delete(
  "/:id",
  authenticateToken,
  authorizeRole("PARTICIPANT", "ADMIN"),
  async (req, res) => {
    try {
      const project = isValidId(req.params.id)
        ? await Project.findById(req.params.id)
        : null;

      if (!project) {
        return res.status(404).json({
          message: "Project not found",
        });
      }

      if (
        req.user.role.toUpperCase() !== "ADMIN" &&
        String(project.userId) !== req.user.userId
      ) {
        return res.status(403).json({
          message: "You can only delete your own project",
        });
      }

      await project.deleteOne();

      return res.status(200).json({
        message: "Project deleted successfully",
      });
    } catch (error) {
      console.error("Delete project error:", error);

      return res.status(500).json({
        message: "Failed to delete project",
      });
    }
  }
);

module.exports = router;
