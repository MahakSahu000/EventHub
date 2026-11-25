const mongoose = require("mongoose");
const { createSchema } = require("./_shared");

const userSchema = createSchema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    // older accounts don't have a username, so it's sparse
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    gender: { type: String, default: null },
    role: { type: String, default: "PARTICIPANT" },

    isEmailVerified: { type: Boolean, default: false },
    emailOtpHash: { type: String, default: null },
    emailOtpExpiresAt: { type: Date, default: null },

    passwordResetOtpHash: { type: String, default: null },
    passwordResetOtpExpiresAt: { type: Date, default: null },
    // increase this to kill all access tokens of the user (force logout)
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// onDelete: Cascade (was a Postgres FK rule).
// Runs for `userDoc.deleteOne()`.
userSchema.pre("deleteOne", { document: true, query: false }, async function () {
  const RefreshToken = mongoose.model("RefreshToken");
  const Team = mongoose.model("Team");
  const TeamMember = mongoose.model("TeamMember");
  const HackathonRegistration = mongoose.model("HackathonRegistration");
  const Project = mongoose.model("Project");

  await RefreshToken.deleteMany({ userId: this._id });

  // Teams created by this user (each team cascades to its own members)
  const teams = await Team.find({ createdById: this._id });
  for (const team of teams) {
    await team.deleteOne();
  }

  await TeamMember.deleteMany({ userId: this._id });
  await HackathonRegistration.deleteMany({ userId: this._id });
  await Project.deleteMany({ userId: this._id });
});

module.exports = mongoose.model("User", userSchema);
