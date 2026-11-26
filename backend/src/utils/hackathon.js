const mongoose = require("mongoose");
const { Team, TeamMember } = require("../models");

const PHASES = ["REGISTRATION", "CHECK_IN", "HACKATHON", "RESULTS", "COMPLETED"];
const MIN_TEAM_SIZE = 3;
const MAX_TEAM_SIZE = 5;

function getPhase(hackathon) {
  return (hackathon.phase || "REGISTRATION").toUpperCase();
}

// teams can be created / changed only in this case
function isRegistrationOpen(hackathon) {
  return hackathon.registrationOpen !== false && getPhase(hackathon) === "REGISTRATION";
}

function getMaxTeamSize(hackathon) {
  const size = hackathon.maxTeamSize || MAX_TEAM_SIZE;
  return Math.min(size, MAX_TEAM_SIZE);
}

// returns the TeamMember row if user is in any team of this hackathon
async function findUserTeamMember(userId, hackathonId) {
  const teams = await Team.find({ hackathonId: hackathonId }).select("_id");
  const teamIds = teams.map((t) => t._id);
  if (teamIds.length === 0) return null;

  return TeamMember.findOne({
    userId: userId,
    teamId: mongoose.trusted({ $in: teamIds }),
  });
}

module.exports = {
  PHASES,
  MIN_TEAM_SIZE,
  MAX_TEAM_SIZE,
  getPhase,
  isRegistrationOpen,
  getMaxTeamSize,
  findUserTeamMember,
};
