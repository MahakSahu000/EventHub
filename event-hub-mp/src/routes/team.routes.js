const express = require("express");
const router = express.Router();
const {
  Hackathon,
  Team,
  TeamMember,
  TeamInvite,
  User,
  HackathonRegistration,
} = require("../models");
const authenticateToken = require("../middleware/auth.middleware");
const authorizeRole = require("../middleware/authorizeRole");
const { isValidId } = require("../utils/objectId");
const { sendOk, sendError } = require("../utils/response");
const { logAudit } = require("../utils/audit");
const { emitToUser } = require("../utils/socket");
const {
  MIN_TEAM_SIZE,
  getPhase,
  isRegistrationOpen,
  getMaxTeamSize,
  findUserTeamMember,
} = require("../utils/hackathon");

// ---------- helpers ----------

function memberPopulate(fields) {
  return {
    path: "members",
    populate: { path: "user", select: fields },
  };
}

async function loadTeam(id, userFields = "name username gender") {
  // id can be a string or an ObjectId
  const teamId = id ? String(id) : "";
  if (!isValidId(teamId)) return null;
  return Team.findById(teamId).populate([
    memberPopulate(userFields),
    { path: "hackathon" },
  ]);
}

function isAdmin(req) {
  return (req.user.role || "").toUpperCase() === "ADMIN";
}

function getLeader(team) {
  return team.members.find((m) => m.role === "LEADER");
}

function isLeader(team, userId) {
  const leader = getLeader(team);
  return leader && String(leader.userId) === String(userId);
}

function isMember(team, userId) {
  return team.members.some((m) => String(m.userId) === String(userId));
}

function countWords(text) {
  return text.trim().split(/\s+/).filter((w) => w).length;
}

// leader/member changes are allowed only before lock and while registrations are open
function teamEditError(team) {
  if (team.disqualified) return "Team is disqualified";
  if (team.locked) return "Team is locked, members cannot be changed";
  if (!isRegistrationOpen(team.hackathon)) return "Registrations are closed";
  return null;
}

// register user for the hackathon if not already (joining a team = registering)
async function ensureRegistered(userId, hackathonId) {
  const exists = await HackathonRegistration.exists({ userId, hackathonId });
  if (!exists) {
    await HackathonRegistration.create({ userId, hackathonId });
  }
}

async function countPendingInvites(teamId) {
  return TeamInvite.countDocuments({ teamId: teamId, status: "PENDING" });
}

// validates a username for invite and returns the user (or an error message)
async function checkInvitee(username, hackathonId, inviterId) {
  const user = await User.findOne({ username: String(username).trim().toLowerCase() });
  if (!user) return { error: "User '" + username + "' not found" };
  if (String(user._id) === String(inviterId)) return { error: "You cannot invite yourself" };
  if (user.emailOtpHash && !user.isEmailVerified) {
    return { error: "User '" + username + "' has not verified email" };
  }
  if ((user.role || "").toUpperCase() !== "PARTICIPANT") {
    return { error: "Only participants can be invited" };
  }
  const inTeam = await findUserTeamMember(user._id, hackathonId);
  if (inTeam) return { error: "User '" + username + "' is already in a team" };
  return { user: user };
}

async function createInvite(team, user, invitedById) {
  // cancel older pending invite to same team (if any) so there is only one
  await TeamInvite.updateMany(
    { teamId: team._id, userId: user._id, status: "PENDING" },
    { status: "CANCELLED" }
  );
  const invite = await TeamInvite.create({
    teamId: team._id,
    hackathonId: team.hackathonId,
    userId: user._id,
    invitedById: invitedById,
  });
  emitToUser(user._id, "invite:new", { teamName: team.name, inviteId: invite.id });
  return invite;
}

// ========================================
// GET /teams?hackathonId=...
// Public list of teams
// ========================================
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.hackathonId) {
      if (!isValidId(req.query.hackathonId)) return sendError(res, 400, "Invalid hackathon id");
      filter.hackathonId = req.query.hackathonId;
    }

    const teams = await Team.find(filter)
      .populate([memberPopulate("name username"), { path: "hackathon", select: "title" }])
      .sort({ createdAt: -1 });

    return sendOk(res, 200, "Teams fetched successfully", teams);
  } catch (error) {
    console.error("Get teams error:", error);
    return sendError(res, 500, "Failed to fetch teams");
  }
});

// ========================================
// GET /teams/my?hackathonId=...
// Team of the logged-in user for a hackathon
// ========================================
router.get("/my", authenticateToken, async (req, res) => {
  try {
    const { hackathonId } = req.query;
    if (!isValidId(hackathonId)) return sendError(res, 400, "Valid hackathonId is required");

    const member = await findUserTeamMember(req.user.userId, hackathonId);
    if (!member) return sendOk(res, 200, "You are not in any team", null);

    const team = await loadTeam(member.teamId);
    return sendOk(res, 200, "Team fetched successfully", team);
  } catch (error) {
    console.error("Get my team error:", error);
    return sendError(res, 500, "Failed to fetch team");
  }
});

// ========================================
// GET /teams/invites/me
// Pending invites of logged-in user
// ========================================
router.get("/invites/me", authenticateToken, async (req, res) => {
  try {
    const invites = await TeamInvite.find({ userId: req.user.userId, status: "PENDING" })
      .populate([
        { path: "team", select: "name description hackathonId", populate: { path: "hackathon", select: "title" } },
        { path: "invitedBy", select: "name username" },
      ])
      .sort({ createdAt: -1 });

    return sendOk(res, 200, "Invites fetched successfully", invites);
  } catch (error) {
    console.error("Get invites error:", error);
    return sendError(res, 500, "Failed to fetch invites");
  }
});

// ========================================
// POST /teams/invites/:inviteId/accept
// ========================================
router.post("/invites/:inviteId/accept", authenticateToken, async (req, res) => {
  try {
    const invite = isValidId(req.params.inviteId) ? await TeamInvite.findById(req.params.inviteId) : null;

    if (!invite || String(invite.userId) !== req.user.userId) {
      return sendError(res, 404, "Invite not found");
    }
    if (invite.status !== "PENDING") {
      return sendError(res, 400, "Invite is already " + invite.status.toLowerCase());
    }

    const team = await loadTeam(invite.teamId);
    if (!team) {
      invite.status = "CANCELLED";
      await invite.save();
      return sendError(res, 404, "Team no longer exists");
    }

    const editError = teamEditError(team);
    if (editError) return sendError(res, 400, editError);

    if (team.members.length >= getMaxTeamSize(team.hackathon)) {
      return sendError(res, 400, "Team is already full");
    }

    const alreadyInTeam = await findUserTeamMember(req.user.userId, team.hackathonId);
    if (alreadyInTeam) {
      return sendError(res, 400, "You are already in a team for this hackathon");
    }

    await TeamMember.create({ teamId: team._id, userId: req.user.userId, role: "MEMBER" });
    await ensureRegistered(req.user.userId, team.hackathonId);

    invite.status = "ACCEPTED";
    await invite.save();

    // user can be in one team only, so cancel other invites of same hackathon
    await TeamInvite.updateMany(
      { userId: req.user.userId, hackathonId: team.hackathonId, status: "PENDING" },
      { status: "CANCELLED" }
    );

    const leader = getLeader(team);
    if (leader) emitToUser(leader.userId, "team:update", { teamId: team.id });

    return sendOk(res, 200, "You joined team " + team.name, { teamId: team.id });
  } catch (error) {
    console.error("Accept invite error:", error);
    if (error.code === 11000) return sendError(res, 409, "You are already a member of this team");
    return sendError(res, 500, "Failed to accept invite");
  }
});

// ========================================
// POST /teams/invites/:inviteId/reject
// ========================================
router.post("/invites/:inviteId/reject", authenticateToken, async (req, res) => {
  try {
    const invite = isValidId(req.params.inviteId) ? await TeamInvite.findById(req.params.inviteId) : null;

    if (!invite || String(invite.userId) !== req.user.userId) {
      return sendError(res, 404, "Invite not found");
    }
    if (invite.status !== "PENDING") {
      return sendError(res, 400, "Invite is already " + invite.status.toLowerCase());
    }

    invite.status = "REJECTED";
    await invite.save();

    emitToUser(invite.invitedById, "team:update", { teamId: String(invite.teamId) });

    return sendOk(res, 200, "Invite rejected", null);
  } catch (error) {
    console.error("Reject invite error:", error);
    return sendError(res, 500, "Failed to reject invite");
  }
});

// ========================================
// POST /teams
// Create team, creator becomes leader.
// Body: { name, description, hackathonId, memberUsernames: [] }
// ========================================
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { name, hackathonId } = req.body;
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
    const memberUsernames = Array.isArray(req.body.memberUsernames) ? req.body.memberUsernames : [];
    const userId = req.user.userId;

    if (typeof name !== "string" || !name.trim() || !hackathonId) {
      return sendError(res, 400, "name and hackathonId are required");
    }
    if (description && countWords(description) > 10) {
      return sendError(res, 400, "Description can have maximum 10 words");
    }
    if ((req.user.role || "").toUpperCase() !== "PARTICIPANT") {
      return sendError(res, 403, "Only participants can create teams");
    }

    const hackathon = isValidId(hackathonId) ? await Hackathon.findById(hackathonId) : null;
    if (!hackathon) return sendError(res, 404, "Hackathon not found");

    if (!isRegistrationOpen(hackathon)) {
      return sendError(res, 400, "Team creation is allowed only while registrations are open");
    }

    const alreadyInTeam = await findUserTeamMember(userId, hackathonId);
    if (alreadyInTeam) return sendError(res, 400, "You are already in a team for this hackathon");

    // remove duplicates / empty values
    const usernames = [...new Set(memberUsernames.map((u) => String(u).trim().toLowerCase()).filter((u) => u))];

    if (usernames.length + 1 > getMaxTeamSize(hackathon)) {
      return sendError(res, 400, "Team can have maximum " + getMaxTeamSize(hackathon) + " members");
    }

    // check all invitees first, so we dont create half team
    const invitees = [];
    for (const uname of usernames) {
      const result = await checkInvitee(uname, hackathonId, userId);
      if (result.error) return sendError(res, 400, result.error);
      invitees.push(result.user);
    }

    const team = await Team.create({
      name: name.trim(),
      description: description,
      hackathonId,
      createdById: userId,
    });

    try {
      await TeamMember.create({ teamId: team._id, userId: userId, role: "LEADER" });
    } catch (memberError) {
      await Team.deleteOne({ _id: team._id });
      throw memberError;
    }

    await ensureRegistered(userId, hackathonId);

    for (const invitee of invitees) {
      await createInvite(team, invitee, userId);
    }

    const fullTeam = await loadTeam(team._id);
    return sendOk(res, 201, "Team created successfully. Invites sent: " + invitees.length, fullTeam);
  } catch (error) {
    console.error("Create team error:", error);
    if (error.code === 11000) {
      return sendError(res, 409, "A team with this name already exists for this hackathon");
    }
    return sendError(res, 500, "Failed to create team");
  }
});

// ========================================
// GET /teams/:id
// ========================================
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const team = await loadTeam(req.params.id);
    if (!team) return sendError(res, 404, "Team not found");
    return sendOk(res, 200, "Team fetched successfully", team);
  } catch (error) {
    console.error("Get team error:", error);
    return sendError(res, 500, "Failed to fetch team");
  }
});

// ========================================
// GET /teams/:id/invites  (leader or admin)
// ========================================
router.get("/:id/invites", authenticateToken, async (req, res) => {
  try {
    const team = await loadTeam(req.params.id);
    if (!team) return sendError(res, 404, "Team not found");
    if (!isAdmin(req) && !isLeader(team, req.user.userId)) {
      return sendError(res, 403, "Only team leader can see invites");
    }

    const invites = await TeamInvite.find({ teamId: team._id })
      .populate({ path: "user", select: "name username" })
      .sort({ createdAt: -1 });

    return sendOk(res, 200, "Invites fetched successfully", invites);
  } catch (error) {
    console.error("Get team invites error:", error);
    return sendError(res, 500, "Failed to fetch invites");
  }
});

// ========================================
// POST /teams/:id/invites  { username }  (leader)
// ========================================
router.post("/:id/invites", authenticateToken, async (req, res) => {
  try {
    const { username } = req.body;
    if (typeof username !== "string" || !username.trim()) {
      return sendError(res, 400, "username is required");
    }

    const team = await loadTeam(req.params.id);
    if (!team) return sendError(res, 404, "Team not found");
    if (!isLeader(team, req.user.userId)) {
      return sendError(res, 403, "Only team leader can invite members");
    }

    const editError = teamEditError(team);
    if (editError) return sendError(res, 400, editError);

    const pending = await countPendingInvites(team._id);
    if (team.members.length + pending >= getMaxTeamSize(team.hackathon)) {
      return sendError(res, 400, "Team is full (members + pending invites)");
    }

    const result = await checkInvitee(username, team.hackathonId, req.user.userId);
    if (result.error) return sendError(res, 400, result.error);

    const invite = await createInvite(team, result.user, req.user.userId);
    return sendOk(res, 201, "Invite sent to " + result.user.username, invite);
  } catch (error) {
    console.error("Send invite error:", error);
    return sendError(res, 500, "Failed to send invite");
  }
});

// ========================================
// DELETE /teams/:id/invites/:inviteId  (leader cancels invite)
// ========================================
router.delete("/:id/invites/:inviteId", authenticateToken, async (req, res) => {
  try {
    const team = await loadTeam(req.params.id);
    if (!team) return sendError(res, 404, "Team not found");
    if (!isAdmin(req) && !isLeader(team, req.user.userId)) {
      return sendError(res, 403, "Only team leader can cancel invites");
    }

    const invite = isValidId(req.params.inviteId) ? await TeamInvite.findById(req.params.inviteId) : null;
    if (!invite || String(invite.teamId) !== team.id) return sendError(res, 404, "Invite not found");
    if (invite.status !== "PENDING") return sendError(res, 400, "Only pending invites can be cancelled");

    invite.status = "CANCELLED";
    await invite.save();
    emitToUser(invite.userId, "invite:cancelled", { inviteId: invite.id });

    return sendOk(res, 200, "Invite cancelled", null);
  } catch (error) {
    console.error("Cancel invite error:", error);
    return sendError(res, 500, "Failed to cancel invite");
  }
});

// ========================================
// POST /teams/:id/leave  (members only, leader cannot leave)
// ========================================
router.post("/:id/leave", authenticateToken, async (req, res) => {
  try {
    const team = await loadTeam(req.params.id);
    if (!team) return sendError(res, 404, "Team not found");
    if (!isMember(team, req.user.userId)) return sendError(res, 400, "You are not in this team");
    if (isLeader(team, req.user.userId)) {
      return sendError(res, 400, "Team leader cannot leave the team");
    }

    const editError = teamEditError(team);
    if (editError) return sendError(res, 400, editError);

    await TeamMember.deleteOne({ teamId: team._id, userId: req.user.userId });

    const leader = getLeader(team);
    if (leader) emitToUser(leader.userId, "team:update", { teamId: team.id });

    return sendOk(res, 200, "You left the team", null);
  } catch (error) {
    console.error("Leave team error:", error);
    return sendError(res, 500, "Failed to leave team");
  }
});

// ========================================
// DELETE /teams/:id/members/:userId
// Leader removes member before lock, Admin can force remove anytime
// ========================================
router.delete("/:id/members/:userId", authenticateToken, async (req, res) => {
  try {
    const team = await loadTeam(req.params.id);
    if (!team) return sendError(res, 404, "Team not found");

    const admin = isAdmin(req);
    if (!admin && !isLeader(team, req.user.userId)) {
      return sendError(res, 403, "Only team leader or admin can remove members");
    }

    const member = team.members.find((m) => String(m.userId) === req.params.userId);
    if (!member) return sendError(res, 404, "User is not in this team");
    if (member.role === "LEADER") {
      return sendError(res, 400, "Leader cannot be removed. Admin must change leader first");
    }

    if (!admin) {
      const editError = teamEditError(team);
      if (editError) return sendError(res, 400, editError);
    }

    await TeamMember.deleteOne({ _id: member._id });
    emitToUser(member.userId, "team:update", { teamId: team.id, removed: true });

    if (admin) {
      await logAudit(req.user.userId, "TEAM_FORCE_REMOVE_MEMBER", "Team", team.id, {
        teamName: team.name,
        removedUserId: String(member.userId),
      });
    }

    return sendOk(res, 200, "Member removed from team", null);
  } catch (error) {
    console.error("Remove member error:", error);
    return sendError(res, 500, "Failed to remove member");
  }
});

// ========================================
// POST /teams/:id/lock
// Leader locks (needs min members), Admin force locks
// ========================================
router.post("/:id/lock", authenticateToken, async (req, res) => {
  try {
    const team = await loadTeam(req.params.id);
    if (!team) return sendError(res, 404, "Team not found");

    const admin = isAdmin(req);
    if (!admin && !isLeader(team, req.user.userId)) {
      return sendError(res, 403, "Only team leader or admin can lock the team");
    }
    if (team.locked) return sendError(res, 400, "Team is already locked");

    if (!admin && team.members.length < MIN_TEAM_SIZE) {
      return sendError(res, 400, "Team needs at least " + MIN_TEAM_SIZE + " members to lock");
    }

    team.locked = true;
    team.lockedAt = new Date();
    await team.save();

    // pending invites are useless after lock
    await TeamInvite.updateMany({ teamId: team._id, status: "PENDING" }, { status: "CANCELLED" });

    if (admin) {
      await logAudit(req.user.userId, "TEAM_FORCE_LOCK", "Team", team.id, { teamName: team.name });
    }

    team.members.forEach((m) => emitToUser(m.userId, "team:update", { teamId: team.id }));

    return sendOk(res, 200, "Team locked", null);
  } catch (error) {
    console.error("Lock team error:", error);
    return sendError(res, 500, "Failed to lock team");
  }
});

// ========================================
// POST /teams/:id/disqualify { reason }  (admin)
// POST /teams/:id/requalify              (admin)
// ========================================
router.post("/:id/disqualify", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const team = await loadTeam(req.params.id);
    if (!team) return sendError(res, 404, "Team not found");
    if (team.disqualified) return sendError(res, 400, "Team is already disqualified");

    team.disqualified = true;
    team.disqualifyReason = typeof req.body.reason === "string" ? req.body.reason.trim() : null;
    await team.save();

    await logAudit(req.user.userId, "TEAM_DISQUALIFY", "Team", team.id, {
      teamName: team.name,
      reason: team.disqualifyReason,
    });
    team.members.forEach((m) => emitToUser(m.userId, "team:update", { teamId: team.id }));

    return sendOk(res, 200, "Team disqualified", null);
  } catch (error) {
    console.error("Disqualify error:", error);
    return sendError(res, 500, "Failed to disqualify team");
  }
});

router.post("/:id/requalify", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const team = await loadTeam(req.params.id);
    if (!team) return sendError(res, 404, "Team not found");
    if (!team.disqualified) return sendError(res, 400, "Team is not disqualified");

    team.disqualified = false;
    team.disqualifyReason = null;
    await team.save();

    await logAudit(req.user.userId, "TEAM_REQUALIFY", "Team", team.id, { teamName: team.name });

    return sendOk(res, 200, "Team qualified again", null);
  } catch (error) {
    console.error("Requalify error:", error);
    return sendError(res, 500, "Failed to update team");
  }
});

// ========================================
// PUT /teams/:id/leader { userId }  (admin changes leader)
// ========================================
router.put("/:id/leader", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const { userId } = req.body;
    const team = await loadTeam(req.params.id);
    if (!team) return sendError(res, 404, "Team not found");

    const newLeader = team.members.find((m) => String(m.userId) === String(userId));
    if (!newLeader) return sendError(res, 400, "New leader must be a member of the team");
    if (newLeader.role === "LEADER") return sendError(res, 400, "User is already the leader");

    const oldLeader = getLeader(team);
    if (oldLeader) {
      await TeamMember.updateOne({ _id: oldLeader._id }, { role: "MEMBER" });
    }
    await TeamMember.updateOne({ _id: newLeader._id }, { role: "LEADER" });
    team.createdById = newLeader.userId;
    await team.save();

    await logAudit(req.user.userId, "TEAM_CHANGE_LEADER", "Team", team.id, {
      teamName: team.name,
      oldLeaderId: oldLeader ? String(oldLeader.userId) : null,
      newLeaderId: String(newLeader.userId),
    });
    team.members.forEach((m) => emitToUser(m.userId, "team:update", { teamId: team.id }));

    return sendOk(res, 200, "Team leader changed", null);
  } catch (error) {
    console.error("Change leader error:", error);
    return sendError(res, 500, "Failed to change leader");
  }
});

// ========================================
// POST /teams/:id/check-in  (volunteer / admin, during CHECK_IN phase)
// ========================================
router.post("/:id/check-in", authenticateToken, authorizeRole("VOLUNTEER", "ADMIN"), async (req, res) => {
  try {
    const team = await loadTeam(req.params.id);
    if (!team) return sendError(res, 404, "Team not found");

    if (getPhase(team.hackathon) !== "CHECK_IN") {
      return sendError(res, 400, "Check-in is allowed only in CHECK_IN phase");
    }
    if (team.disqualified) return sendError(res, 400, "Team is disqualified");
    if (!team.locked) return sendError(res, 400, "Team is not locked");
    if (team.checkedIn) return sendError(res, 400, "Team is already checked in");

    team.checkedIn = true;
    team.checkedInAt = new Date();
    await team.save();

    await logAudit(req.user.userId, "TEAM_CHECK_IN", "Team", team.id, { teamName: team.name });

    return sendOk(res, 200, team.name + " checked in", null);
  } catch (error) {
    console.error("Check-in error:", error);
    return sendError(res, 500, "Failed to check in team");
  }
});

// ========================================
// DELETE /teams/:id
// Leader (before lock, registration open) or Admin (anytime)
// ========================================
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const team = await loadTeam(req.params.id);
    if (!team) return sendError(res, 404, "Team not found");

    const admin = isAdmin(req);
    if (!admin && !isLeader(team, req.user.userId)) {
      return sendError(res, 403, "Only the team leader or Admin can delete this team");
    }
    if (!admin) {
      const editError = teamEditError(team);
      if (editError) return sendError(res, 400, editError);
    }

    const memberIds = team.members.map((m) => m.userId);
    // also removes members, invites, submissions and scores
    await team.deleteOne();

    if (admin) {
      await logAudit(req.user.userId, "TEAM_DELETE", "Team", team.id, { teamName: team.name });
    }
    memberIds.forEach((id) => emitToUser(id, "team:update", { teamId: team.id, deleted: true }));

    return sendOk(res, 200, "Team deleted successfully", null);
  } catch (error) {
    console.error("Delete team error:", error);
    return sendError(res, 500, "Failed to delete team");
  }
});

module.exports = router;
