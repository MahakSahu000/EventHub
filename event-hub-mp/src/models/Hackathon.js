const mongoose = require("mongoose");
const { createSchema } = require("./_shared");

const hackathonSchema = createSchema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    theme: { type: String, default: null },
    location: { type: String, default: null },
    mode: { type: String, default: "ONLINE" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    regDeadline: { type: Date, required: true },
    status: { type: String, default: "UPCOMING" },
    maxTeamSize: { type: Number, default: 4 },
    // REGISTRATION -> CHECK_IN -> HACKATHON -> RESULTS -> COMPLETED
    phase: { type: String, default: "REGISTRATION" },
    registrationOpen: { type: Boolean, default: true },
  },
  { timestamps: true }
);

hackathonSchema.pre("deleteOne", { document: true, query: false }, async function () {
  const Team = mongoose.model("Team");
  const HackathonRegistration = mongoose.model("HackathonRegistration");
  const Project = mongoose.model("Project");

  const teams = await Team.find({ hackathonId: this._id });
  for (const team of teams) {
    await team.deleteOne();
  }

  await HackathonRegistration.deleteMany({ hackathonId: this._id });
  await Project.deleteMany({ hackathonId: this._id });
  const waves = await mongoose.model("Wave").find({ hackathonId: this._id });
  for (const wave of waves) {
    await wave.deleteOne();
  }
  const rounds = await mongoose.model("JudgingRound").find({ hackathonId: this._id });
  for (const round of rounds) {
    await round.deleteOne();
  }
  await mongoose.model("Announcement").deleteMany({ hackathonId: this._id });
});

module.exports = mongoose.model("Hackathon", hackathonSchema);