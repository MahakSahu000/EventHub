const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const User = require("../models/User");
const Hackathon = require("../models/Hackathon");
const HackathonRegistration = require("../models/HackathonRegistration");
const Project = require("../models/Project");
const Judging = require("../models/Judging");

const authenticateToken = require("../middleware/auth.middleware");
const authorizeRole = require("../middleware/authorizeRole");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const TeamInvite = require("../models/TeamInvite");

// GET /dashboard
router.get("/", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "name email username gender role isEmailVerified createdAt"
    );
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found", data: null });
    }

    const memberships = await TeamMember.find({ userId: req.user.userId });
    const teams = [];
    for (const m of memberships) {
      const team = await Team.findById(m.teamId).populate([
        { path: "members", populate: { path: "user", select: "name username gender" } },
        { path: "hackathon", select: "title phase registrationOpen" },
      ]);
      if (!team) continue;
      teams.push({
        id: team.id,
        name: team.name,
        description: team.description,
        myRole: m.role,
        locked: team.locked,
        disqualified: team.disqualified,
        checkedIn: team.checkedIn,
        hackathon: team.hackathon,
        members: team.members.map((tm) => ({
          userId: String(tm.userId),
          role: tm.role,
          name: tm.user ? tm.user.name : null,
          username: tm.user ? tm.user.username : null,
          gender: tm.user ? tm.user.gender : null,
        })),
      });
    }

    const pendingInvites = await TeamInvite.countDocuments({
      userId: req.user.userId,
      status: "PENDING",
    });

    return res.status(200).json({
      status: true,
      message: "Dashboard fetched successfully",
      data: { user: user, teams: teams, pendingInvites: pendingInvites },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return res.status(500).json({ status: false, message: "Failed to fetch dashboard", data: null });
  }
});

// GET /dashboard/admin
router.get(
  "/admin",
  authenticateToken,
  authorizeRole("ADMIN"),
  async (req, res) => {
    try {
      const now = new Date();

      const [
        totalUsers,
        verifiedUsers,
        totalHackathons,
        totalRegistrations,
        participants,
        admins,
        judges,
      ] = await Promise.all([
        User.countDocuments().exec(),
        User.countDocuments({ isEmailVerified: true }).exec(),
        Hackathon.countDocuments().exec(),
        HackathonRegistration.countDocuments().exec(),
        User.countDocuments({ role: "PARTICIPANT" }).exec(),
        User.countDocuments({ role: "ADMIN" }).exec(),
        User.countDocuments({ role: "JUDGE" }).exec(),
      ]);

      const [totalTeams, lockedTeams, disqualifiedTeams, checkedInTeams, genderRows] =
        await Promise.all([
          Team.countDocuments(),
          Team.countDocuments({ locked: true }),
          Team.countDocuments({ disqualified: true }),
          Team.countDocuments({ checkedIn: true }),
          User.aggregate([{ $group: { _id: "$gender", count: { $sum: 1 } } }]),
        ]);

      const gender = {};
      genderRows.forEach((g) => {
        gender[g._id ? String(g._id).toLowerCase() : "not_set"] = g.count;
      });

      const hackathons = await Hackathon.find({})
        .select("startDate endDate")
        .lean()
        .exec();

      let upcomingHackathons = 0;
      let ongoingHackathons = 0;
      let completedHackathons = 0;

      for (const hackathon of hackathons) {
        const startDate = new Date(hackathon.startDate);
        const endDate = new Date(hackathon.endDate);

        if (startDate > now) {
          upcomingHackathons++;
        } else if (startDate <= now && endDate >= now) {
          ongoingHackathons++;
        } else if (endDate < now) {
          completedHackathons++;
        }
      }

      return res.status(200).json({
        status: true,
        message: "Admin dashboard data fetched successfully",
        data: {
          users: {
            total: totalUsers,
            verified: verifiedUsers,
            unverified: totalUsers - verifiedUsers,
            participants,
            admins,
            judges,
          },
          hackathons: {
            total: totalHackathons,
            upcoming: upcomingHackathons,
            ongoing: ongoingHackathons,
            completed: completedHackathons,
          },
          registrations: {
            total: totalRegistrations,
          },
          teams: {
            total: totalTeams,
            locked: lockedTeams,
            disqualified: disqualifiedTeams,
            checkedIn: checkedInTeams,
          },
          gender: gender,
        },
      });
    } catch (error) {
      console.error("Admin dashboard error:", error);

      return res.status(500).json({
        status: false,
        message: "Failed to fetch admin dashboard data",
        data: null,
      });
    }
  }
);

// GET /dashboard/leaderboard
router.get(
  "/leaderboard/:hackathonId",
  authenticateToken,
  async (req, res) => {
    try {
      const { hackathonId } = req.params;

      // Validate the MongoDB ObjectId
      if (!mongoose.isValidObjectId(hackathonId)) {
        return res.status(400).json({
          status: false,
          message: "Invalid hackathon ID",
          data: null,
        });
      }

      const hackathon = await Hackathon.findById(hackathonId).lean().exec();

      if (!hackathon) {
        return res.status(404).json({
          status: false,
          message: "Hackathon not found",
          data: null,
        });
      }

      const projects = await Project.find({
        hackathonId: hackathon._id,
        status: "SUBMITTED",
      })
        .select("title description userId hackathonId status")
        .populate("user", "name email")
        .lean()
        .exec();

      const judgingRecords = await Judging.find({
        hackathonId: hackathon._id,
      })
        .lean()
        .exec();

      const projectIdSet = new Set(
        projects.map((project) => project._id.toString())
      );

      const scoresByProject = new Map();

      for (const judging of judgingRecords) {
        const projectKey = judging.projectId.toString();

        if (!projectIdSet.has(projectKey)) {
          continue;
        }

        if (!scoresByProject.has(projectKey)) {
          scoresByProject.set(projectKey, {
            totalScore: 0,
            judgeCount: 0,
          });
        }

        const scoreData = scoresByProject.get(projectKey);

        const score =
          Number(judging.innovationScore) +
          Number(judging.technicalScore) +
          Number(judging.presentationScore) +
          Number(judging.usefulnessScore);

        scoreData.totalScore += score;
        scoreData.judgeCount++;
      }

      // Calculate each project's average score across its judges
      const leaderboard = projects.map((project) => {
        const scoreData = scoresByProject.get(project._id.toString());

        const totalScore = scoreData ? scoreData.totalScore : 0;
        const judgeCount = scoreData ? scoreData.judgeCount : 0;

        const averageScore =
          judgeCount > 0 ? totalScore / judgeCount : 0;

        return {
          projectId: project._id,
          title: project.title,
          description: project.description,
          status: project.status,
          participant: project.user
            ? {
                name: project.user.name,
                email: project.user.email,
              }
            : null,
          judgeCount,
          totalScore,
          averageScore: Number(averageScore.toFixed(2)),
        };
      });


      leaderboard.sort((a, b) => {
        if (b.averageScore !== a.averageScore) {
          return b.averageScore - a.averageScore;
        }

        return b.totalScore - a.totalScore;
      });

      let currentRank = 0;
      let previousAverageScore = null;

      leaderboard.forEach((project, index) => {
        if (project.averageScore !== previousAverageScore) {
          currentRank = index + 1;
          previousAverageScore = project.averageScore;
        }

        project.rank = currentRank;
      });

      return res.status(200).json({
        status: true,
        message: "Leaderboard fetched successfully",
        data: {
          hackathon: {
            id: hackathon._id,
            title: hackathon.title,
          },
          totalProjects: leaderboard.length,
          leaderboard,
        },
      });
    } catch (error) {
      console.error("Leaderboard error:", error);

      return res.status(500).json({
        status: false,
        message: "Failed to fetch leaderboard",
        data: null,
      });
    }
  }
);

module.exports = router;