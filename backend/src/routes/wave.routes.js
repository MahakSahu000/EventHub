const express = require("express");
const router = express.Router();
const { Hackathon, Wave, Submission, Team } = require("../models");
const authenticateToken = require("../middleware/auth.middleware");
const authorizeRole = require("../middleware/authorizeRole");
const { isValidId } = require("../utils/objectId");
const { sendOk, sendError } = require("../utils/response");
const { logAudit } = require("../utils/audit");
const { emitAll } = require("../utils/socket");
const { getPhase, findUserTeamMember } = require("../utils/hackathon");

const FIELD_TYPES = ["text", "textarea", "url", "file"];

function isUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// checks and cleans wave data sent by admin. returns { error } or { data }
function validateWave(body, isUpdate) {
  const data = {};

  if (body.title !== undefined || !isUpdate) {
    if (typeof body.title !== "string" || !body.title.trim()) return { error: "title is required" };
    data.title = body.title.trim();
  }
  if (body.instructions !== undefined) {
    data.instructions = String(body.instructions);
  }

  if (body.fields !== undefined || !isUpdate) {
    if (!Array.isArray(body.fields) || body.fields.length === 0) {
      return { error: "At least one field is required" };
    }
    const keys = [];
    data.fields = [];
    for (const f of body.fields) {
      if (!f || typeof f.label !== "string" || !f.label.trim()) {
        return { error: "Every field needs a label" };
      }
      const type = FIELD_TYPES.includes(f.type) ? f.type : "text";
      // make key from label if not given e.g. "Github Link" -> github_link
      let key = typeof f.key === "string" && f.key.trim() ? f.key.trim() : f.label;
      key = key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (!key || keys.includes(key)) return { error: "Field keys must be unique" };
      keys.push(key);
      data.fields.push({ key: key, label: f.label.trim(), type: type, required: !!f.required });
    }
  }

  if (body.allowedFileTypes !== undefined) {
    let types = body.allowedFileTypes;
    if (typeof types === "string") types = types.split(",");
    if (!Array.isArray(types)) return { error: "allowedFileTypes must be a list" };
    data.allowedFileTypes = types
      .map((t) => String(t).trim().toLowerCase().replace(".", ""))
      .filter((t) => t);
  }

  for (const field of ["startTime", "endTime"]) {
    if (body[field] !== undefined || !isUpdate) {
      const d = new Date(body[field]);
      if (!body[field] || Number.isNaN(d.getTime())) return { error: field + " must be a valid date" };
      data[field] = d;
    }
  }

  return { data: data };
}

// ========================================
// GET /waves?hackathonId=...
// ========================================
router.get("/", authenticateToken, async (req, res) => {
  try {
    if (!isValidId(req.query.hackathonId)) return sendError(res, 400, "Valid hackathonId is required");
    const waves = await Wave.find({ hackathonId: req.query.hackathonId }).sort({ startTime: 1 });
    return sendOk(res, 200, "Waves fetched successfully", waves);
  } catch (error) {
    console.error("Get waves error:", error);
    return sendError(res, 500, "Failed to fetch waves");
  }
});

// ========================================
// GET /waves/:id
// ========================================
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const wave = isValidId(req.params.id) ? await Wave.findById(req.params.id) : null;
    if (!wave) return sendError(res, 404, "Wave not found");
    return sendOk(res, 200, "Wave fetched successfully", wave);
  } catch (error) {
    console.error("Get wave error:", error);
    return sendError(res, 500, "Failed to fetch wave");
  }
});

// ========================================
// POST /waves  (admin)
// ========================================
router.post("/", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const { hackathonId } = req.body;
    const hackathon = isValidId(hackathonId) ? await Hackathon.findById(hackathonId) : null;
    if (!hackathon) return sendError(res, 404, "Hackathon not found");

    const result = validateWave(req.body, false);
    if (result.error) return sendError(res, 400, result.error);
    if (result.data.endTime <= result.data.startTime) {
      return sendError(res, 400, "End time must be after start time");
    }

    const wave = await Wave.create({ ...result.data, hackathonId, createdById: req.user.userId });

    await logAudit(req.user.userId, "WAVE_CREATE", "Wave", wave.id, { title: wave.title });
    emitAll("wave:update", { hackathonId: hackathonId });

    return sendOk(res, 201, "Wave created successfully", wave);
  } catch (error) {
    console.error("Create wave error:", error);
    return sendError(res, 500, "Failed to create wave");
  }
});

// ========================================
// PUT /waves/:id  (admin)
// ========================================
router.put("/:id", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const wave = isValidId(req.params.id) ? await Wave.findById(req.params.id) : null;
    if (!wave) return sendError(res, 404, "Wave not found");

    const result = validateWave(req.body, true);
    if (result.error) return sendError(res, 400, result.error);

    Object.assign(wave, result.data);
    if (wave.endTime <= wave.startTime) return sendError(res, 400, "End time must be after start time");
    await wave.save();

    await logAudit(req.user.userId, "WAVE_UPDATE", "Wave", wave.id, { title: wave.title });
    emitAll("wave:update", { hackathonId: String(wave.hackathonId) });

    return sendOk(res, 200, "Wave updated successfully", wave);
  } catch (error) {
    console.error("Update wave error:", error);
    return sendError(res, 500, "Failed to update wave");
  }
});

// ========================================
// DELETE /waves/:id  (admin, also deletes submissions)
// ========================================
router.delete("/:id", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const wave = isValidId(req.params.id) ? await Wave.findById(req.params.id) : null;
    if (!wave) return sendError(res, 404, "Wave not found");

    await wave.deleteOne();

    await logAudit(req.user.userId, "WAVE_DELETE", "Wave", wave.id, { title: wave.title });
    emitAll("wave:update", { hackathonId: String(wave.hackathonId) });

    return sendOk(res, 200, "Wave deleted successfully", null);
  } catch (error) {
    console.error("Delete wave error:", error);
    return sendError(res, 500, "Failed to delete wave");
  }
});

// ========================================
// POST /waves/:id/submit  { answers: { key: value } }
// Any member of a locked team, inside the wave time window
// ========================================
router.post("/:id/submit", authenticateToken, async (req, res) => {
  try {
    const wave = isValidId(req.params.id) ? await Wave.findById(req.params.id) : null;
    if (!wave) return sendError(res, 404, "Wave not found");

    const hackathon = await Hackathon.findById(wave.hackathonId);
    if (!hackathon || getPhase(hackathon) !== "HACKATHON") {
      return sendError(res, 400, "Submissions are allowed only during HACKATHON phase");
    }

    const now = new Date();
    if (now < wave.startTime) return sendError(res, 400, "This wave has not started yet");
    if (now > wave.endTime) return sendError(res, 400, "This wave is closed");

    const member = await findUserTeamMember(req.user.userId, wave.hackathonId);
    if (!member) return sendError(res, 403, "You are not in any team");

    const team = await Team.findById(member.teamId);
    if (team.disqualified) return sendError(res, 403, "Your team is disqualified");
    if (!team.locked) return sendError(res, 400, "Team must be locked before submitting");

    const answers = req.body.answers && typeof req.body.answers === "object" ? req.body.answers : {};
    const clean = {};

    for (const field of wave.fields) {
      let value = answers[field.key];
      value = value === undefined || value === null ? "" : String(value).trim();

      if (field.required && !value) return sendError(res, 400, field.label + " is required");
      if (value && (field.type === "url" || field.type === "file") && !isUrl(value)) {
        return sendError(res, 400, field.label + " must be a valid link (http/https)");
      }
      if (value.length > 5000) return sendError(res, 400, field.label + " is too long");
      clean[field.key] = value;
    }

    const submission = await Submission.findOneAndUpdate(
      { waveId: wave._id, teamId: team._id },
      {
        $set: {
          waveId: wave._id,
          teamId: team._id,
          hackathonId: wave.hackathonId,
          answers: clean,
          submittedById: req.user.userId,
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true }
    );

    return sendOk(res, 200, "Submission saved", submission);
  } catch (error) {
    console.error("Submit wave error:", error);
    return sendError(res, 500, "Failed to save submission");
  }
});

// ========================================
// GET /waves/:id/my-submission
// ========================================
router.get("/:id/my-submission", authenticateToken, async (req, res) => {
  try {
    const wave = isValidId(req.params.id) ? await Wave.findById(req.params.id) : null;
    if (!wave) return sendError(res, 404, "Wave not found");

    const member = await findUserTeamMember(req.user.userId, wave.hackathonId);
    if (!member) return sendOk(res, 200, "You are not in any team", null);

    const submission = await Submission.findOne({ waveId: wave._id, teamId: member.teamId }).populate({
      path: "submittedBy",
      select: "name username",
    });

    return sendOk(res, 200, submission ? "Submission found" : "Not submitted yet", submission);
  } catch (error) {
    console.error("Get my submission error:", error);
    return sendError(res, 500, "Failed to fetch submission");
  }
});

// ========================================
// GET /waves/:id/submissions  (admin)
// ========================================
router.get("/:id/submissions", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const wave = isValidId(req.params.id) ? await Wave.findById(req.params.id) : null;
    if (!wave) return sendError(res, 404, "Wave not found");

    const submissions = await Submission.find({ waveId: wave._id })
      .populate([
        { path: "team", select: "name disqualified" },
        { path: "submittedBy", select: "name username" },
      ])
      .sort({ updatedAt: -1 });

    return sendOk(res, 200, "Submissions fetched successfully", submissions);
  } catch (error) {
    console.error("Get submissions error:", error);
    return sendError(res, 500, "Failed to fetch submissions");
  }
});

module.exports = router;
