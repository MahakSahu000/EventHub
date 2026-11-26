const express = require("express");
const router = express.Router();
const {
  Hackathon,
  Team,
  User,
  Wave,
  Submission,
  JudgingRound,
  JudgeAssignment,
  RoundScore,
} = require("../models");
const authenticateToken = require("../middleware/auth.middleware");
const authorizeRole = require("../middleware/authorizeRole");
const { isValidId } = require("../utils/objectId");
const { sendOk, sendError } = require("../utils/response");
const { logAudit } = require("../utils/audit");
const { emitAll } = require("../utils/socket");
const { getPhase } = require("../utils/hackathon");

// criteria from admin: [{ name, maxScore }]
function validateCriteria(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return { error: "At least one criterion is required" };
  }
  const names = [];
  const list = [];
  for (const c of criteria) {
    const name = c && typeof c.name === "string" ? c.name.trim() : "";
    const maxScore = Number(c && c.maxScore !== undefined ? c.maxScore : 10);
    if (!name) return { error: "Every criterion needs a name" };
    if (names.includes(name.toLowerCase())) return { error: "Criteria names must be unique" };
    if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 100) {
      return { error: "maxScore must be between 1 and 100" };
    }
    names.push(name.toLowerCase());
    list.push({ name: name, maxScore: maxScore });
  }
  return { criteria: list };
}

// average score of every team in one round (only teams that got scored)
async function getRoundAverages(roundId) {
  const scores = await RoundScore.find({ roundId: roundId });
  const map = {};
  for (const s of scores) {
    const key = String(s.teamId);
    if (!map[key]) map[key] = { total: 0, count: 0 };
    map[key].total += s.total;
    map[key].count++;
  }
  const result = {};
  for (const key in map) {
    result[key] = {
      average: Number((map[key].total / map[key].count).toFixed(2)),
      judgeCount: map[key].count,
    };
  }
  return result;
}

// competition ranking 1,1,3...
function addRanks(list) {
  list.sort((a, b) => b.score - a.score);
  let rank = 0;
  let prev = null;
  list.forEach((item, i) => {
    if (item.score !== prev) {
      rank = i + 1;
      prev = item.score;
    }
    item.rank = rank;
  });
  return list;
}

// ========================================
// GET /rounds?hackathonId=...
// ========================================
router.get("/", authenticateToken, async (req, res) => {
  try {
    if (!isValidId(req.query.hackathonId)) return sendError(res, 400, "Valid hackathonId is required");
    const rounds = await JudgingRound.find({ hackathonId: req.query.hackathonId })
      .populate({ path: "wave", select: "title" })
      .sort({ createdAt: 1 });
    return sendOk(res, 200, "Rounds fetched successfully", rounds);
  } catch (error) {
    console.error("Get rounds error:", error);
    return sendError(res, 500, "Failed to fetch rounds");
  }
});

// ========================================
// GET /rounds/judge/my  (judge: my assigned teams)
// ========================================
router.get("/judge/my", authenticateToken, authorizeRole("JUDGE"), async (req, res) => {
  try {
    const assignments = await JudgeAssignment.find({ judgeId: req.user.userId })
      .populate([
        { path: "round", populate: { path: "wave" } },
        { path: "team", select: "name description disqualified hackathonId" },
      ])
      .sort({ createdAt: 1 });

    const list = [];
    for (const a of assignments) {
      if (!a.round || !a.team) continue;

      let submission = null;
      if (a.round.waveId) {
        submission = await Submission.findOne({ waveId: a.round.waveId, teamId: a.teamId });
      }
      const myScore = await RoundScore.findOne({
        roundId: a.roundId,
        judgeId: req.user.userId,
        teamId: a.teamId,
      });

      list.push({
        assignmentId: a.id,
        round: a.round,
        team: a.team,
        submission: submission,
        myScore: myScore,
      });
    }

    return sendOk(res, 200, "Assigned teams fetched successfully", list);
  } catch (error) {
    console.error("Get judge assignments error:", error);
    return sendError(res, 500, "Failed to fetch assigned teams");
  }
});

// ========================================
// GET /rounds/leaderboard/global?hackathonId=...
// sum of team's average score in every round
// ========================================
router.get("/leaderboard/global", authenticateToken, async (req, res) => {
  try {
    const { hackathonId } = req.query;
    const hackathon = isValidId(hackathonId) ? await Hackathon.findById(hackathonId) : null;
    if (!hackathon) return sendError(res, 404, "Hackathon not found");

    const rounds = await JudgingRound.find({ hackathonId: hackathonId }).sort({ createdAt: 1 });
    const teams = await Team.find({ hackathonId: hackathonId, disqualified: false }).select("name");

    const roundAverages = [];
    for (const r of rounds) {
      roundAverages.push(await getRoundAverages(r._id));
    }

    const list = teams.map((t) => {
      const perRound = rounds.map((r, i) => {
        const avg = roundAverages[i][t.id];
        return { roundId: r.id, roundName: r.name, score: avg ? avg.average : 0 };
      });
      const total = perRound.reduce((sum, r) => sum + r.score, 0);
      return { teamId: t.id, teamName: t.name, rounds: perRound, score: Number(total.toFixed(2)) };
    });

    return sendOk(res, 200, "Global leaderboard fetched successfully", {
      hackathon: { id: hackathon.id, title: hackathon.title },
      rounds: rounds.map((r) => ({ id: r.id, name: r.name })),
      leaderboard: addRanks(list),
    });
  } catch (error) {
    console.error("Global leaderboard error:", error);
    return sendError(res, 500, "Failed to fetch leaderboard");
  }
});

// ========================================
// POST /rounds  (admin)  { hackathonId, name, waveId, criteria }
// ========================================
router.post("/", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const { hackathonId, name, waveId } = req.body;
    const hackathon = isValidId(hackathonId) ? await Hackathon.findById(hackathonId) : null;
    if (!hackathon) return sendError(res, 404, "Hackathon not found");
    if (typeof name !== "string" || !name.trim()) return sendError(res, 400, "name is required");

    if (waveId) {
      const wave = isValidId(waveId) ? await Wave.findById(waveId) : null;
      if (!wave || String(wave.hackathonId) !== hackathonId) {
        return sendError(res, 400, "Wave not found in this hackathon");
      }
    }

    const result = validateCriteria(req.body.criteria);
    if (result.error) return sendError(res, 400, result.error);

    const round = await JudgingRound.create({
      hackathonId,
      name: name.trim(),
      waveId: waveId || null,
      criteria: result.criteria,
      createdById: req.user.userId,
    });

    await logAudit(req.user.userId, "ROUND_CREATE", "JudgingRound", round.id, { name: round.name });

    return sendOk(res, 201, "Judging round created", round);
  } catch (error) {
    console.error("Create round error:", error);
    return sendError(res, 500, "Failed to create round");
  }
});

// ========================================
// PUT /rounds/:id  (admin)  { name, isOpen, criteria }
// ========================================
router.put("/:id", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const round = isValidId(req.params.id) ? await JudgingRound.findById(req.params.id) : null;
    if (!round) return sendError(res, 404, "Round not found");

    if (req.body.name !== undefined) {
      if (typeof req.body.name !== "string" || !req.body.name.trim()) {
        return sendError(res, 400, "name cannot be empty");
      }
      round.name = req.body.name.trim();
    }
    if (req.body.isOpen !== undefined) round.isOpen = !!req.body.isOpen;

    if (req.body.criteria !== undefined) {
      const scored = await RoundScore.exists({ roundId: round._id });
      if (scored) return sendError(res, 400, "Criteria cannot be changed after scoring started");
      const result = validateCriteria(req.body.criteria);
      if (result.error) return sendError(res, 400, result.error);
      round.criteria = result.criteria;
    }

    await round.save();
    await logAudit(req.user.userId, "ROUND_UPDATE", "JudgingRound", round.id, {
      name: round.name,
      isOpen: round.isOpen,
    });

    return sendOk(res, 200, "Round updated", round);
  } catch (error) {
    console.error("Update round error:", error);
    return sendError(res, 500, "Failed to update round");
  }
});

// ========================================
// DELETE /rounds/:id  (admin)
// ========================================
router.delete("/:id", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const round = isValidId(req.params.id) ? await JudgingRound.findById(req.params.id) : null;
    if (!round) return sendError(res, 404, "Round not found");

    await round.deleteOne();
    await logAudit(req.user.userId, "ROUND_DELETE", "JudgingRound", round.id, { name: round.name });
    emitAll("leaderboard:update", { hackathonId: String(round.hackathonId) });

    return sendOk(res, 200, "Round deleted", null);
  } catch (error) {
    console.error("Delete round error:", error);
    return sendError(res, 500, "Failed to delete round");
  }
});

// ========================================
// GET /rounds/:id/assignments  (admin)
// ========================================
router.get("/:id/assignments", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return sendError(res, 400, "Invalid round id");
    const assignments = await JudgeAssignment.find({ roundId: req.params.id }).populate([
      { path: "judge", select: "name email" },
      { path: "team", select: "name" },
    ]);
    return sendOk(res, 200, "Assignments fetched successfully", assignments);
  } catch (error) {
    console.error("Get assignments error:", error);
    return sendError(res, 500, "Failed to fetch assignments");
  }
});

// ========================================
// POST /rounds/:id/assignments  (admin)  { judgeId, teamIds: [] }
// ========================================
router.post("/:id/assignments", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const { judgeId, teamIds } = req.body;
    const round = isValidId(req.params.id) ? await JudgingRound.findById(req.params.id) : null;
    if (!round) return sendError(res, 404, "Round not found");

    const judge = isValidId(judgeId) ? await User.findById(judgeId) : null;
    if (!judge || (judge.role || "").toUpperCase() !== "JUDGE") {
      return sendError(res, 400, "Selected user is not a judge");
    }
    if (!Array.isArray(teamIds) || teamIds.length === 0) {
      return sendError(res, 400, "Select at least one team");
    }

    let added = 0;
    for (const teamId of teamIds) {
      const team = isValidId(teamId) ? await Team.findById(teamId) : null;
      if (!team || String(team.hackathonId) !== String(round.hackathonId)) continue;

      const exists = await JudgeAssignment.exists({ roundId: round._id, judgeId: judge._id, teamId: team._id });
      if (exists) continue;

      await JudgeAssignment.create({ roundId: round._id, judgeId: judge._id, teamId: team._id });
      added++;
    }

    await logAudit(req.user.userId, "JUDGE_ASSIGN", "JudgingRound", round.id, {
      judgeId: judge.id,
      added: added,
    });

    return sendOk(res, 201, added + " team(s) assigned to " + judge.name, null);
  } catch (error) {
    console.error("Assign judge error:", error);
    return sendError(res, 500, "Failed to assign judge");
  }
});

// ========================================
// DELETE /rounds/:id/assignments/:assignmentId  (admin)
// ========================================
router.delete("/:id/assignments/:assignmentId", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const a = isValidId(req.params.assignmentId) ? await JudgeAssignment.findById(req.params.assignmentId) : null;
    if (!a || String(a.roundId) !== req.params.id) return sendError(res, 404, "Assignment not found");

    await a.deleteOne();
    return sendOk(res, 200, "Assignment removed", null);
  } catch (error) {
    console.error("Remove assignment error:", error);
    return sendError(res, 500, "Failed to remove assignment");
  }
});

// ========================================
// POST /rounds/:id/scores  (judge)
// { teamId, scores: { "Innovation": 8, ... }, comments }
// ========================================
router.post("/:id/scores", authenticateToken, authorizeRole("JUDGE"), async (req, res) => {
  try {
    const { teamId } = req.body;
    const round = isValidId(req.params.id) ? await JudgingRound.findById(req.params.id) : null;
    if (!round) return sendError(res, 404, "Round not found");
    if (!round.isOpen) return sendError(res, 400, "This round is closed for scoring");

    const hackathon = await Hackathon.findById(round.hackathonId);
    const phase = getPhase(hackathon);
    if (phase !== "HACKATHON" && phase !== "RESULTS") {
      return sendError(res, 400, "Scoring is allowed only in HACKATHON or RESULTS phase");
    }

    const assigned = isValidId(teamId)
      ? await JudgeAssignment.exists({ roundId: round._id, judgeId: req.user.userId, teamId: teamId })
      : null;
    if (!assigned) return sendError(res, 403, "This team is not assigned to you");

    const team = await Team.findById(teamId);
    if (!team || team.disqualified) return sendError(res, 400, "Team is disqualified");

    const input = req.body.scores && typeof req.body.scores === "object" ? req.body.scores : {};
    const scores = [];
    let total = 0;
    for (const c of round.criteria) {
      const value = Number(input[c.name]);
      if (input[c.name] === undefined || input[c.name] === "" || !Number.isFinite(value) || value < 0 || value > c.maxScore) {
        return sendError(res, 400, c.name + " score must be between 0 and " + c.maxScore);
      }
      scores.push({ criterion: c.name, score: value });
      total += value;
    }

    const comments = typeof req.body.comments === "string" ? req.body.comments.trim() : "";
    if (comments.length > 1000) return sendError(res, 400, "Comments can be max 1000 characters");

    const saved = await RoundScore.findOneAndUpdate(
      { roundId: round._id, judgeId: req.user.userId, teamId: team._id },
      {
        $set: {
          roundId: round._id,
          hackathonId: round.hackathonId,
          judgeId: req.user.userId,
          teamId: team._id,
          scores: scores,
          total: total,
          comments: comments,
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true }
    );

    emitAll("leaderboard:update", { hackathonId: String(round.hackathonId) });

    return sendOk(res, 200, "Score saved. Total: " + total, saved);
  } catch (error) {
    console.error("Save score error:", error);
    return sendError(res, 500, "Failed to save score");
  }
});

// ========================================
// GET /rounds/:id/scores  (admin: every judge's score)
// ========================================
router.get("/:id/scores", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return sendError(res, 400, "Invalid round id");
    const scores = await RoundScore.find({ roundId: req.params.id })
      .populate([
        { path: "judge", select: "name" },
        { path: "teamId", select: "name" },
      ])
      .sort({ updatedAt: -1 });
    return sendOk(res, 200, "Scores fetched successfully", scores);
  } catch (error) {
    console.error("Get scores error:", error);
    return sendError(res, 500, "Failed to fetch scores");
  }
});

// ========================================
// GET /rounds/:id/leaderboard  (round / wave-wise leaderboard)
// ========================================
router.get("/:id/leaderboard", authenticateToken, async (req, res) => {
  try {
    const round = isValidId(req.params.id) ? await JudgingRound.findById(req.params.id) : null;
    if (!round) return sendError(res, 404, "Round not found");

    const averages = await getRoundAverages(round._id);
    const teams = await Team.find({ hackathonId: round.hackathonId, disqualified: false }).select("name");

    const list = teams.map((t) => ({
      teamId: t.id,
      teamName: t.name,
      judgeCount: averages[t.id] ? averages[t.id].judgeCount : 0,
      score: averages[t.id] ? averages[t.id].average : 0,
    }));

    const maxScore = round.criteria.reduce((sum, c) => sum + c.maxScore, 0);

    return sendOk(res, 200, "Round leaderboard fetched successfully", {
      round: { id: round.id, name: round.name, maxScore: maxScore },
      leaderboard: addRanks(list),
    });
  } catch (error) {
    console.error("Round leaderboard error:", error);
    return sendError(res, 500, "Failed to fetch leaderboard");
  }
});

module.exports = router;
