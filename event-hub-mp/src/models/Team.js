const mongoose = require("mongoose");
const { createSchema, refExists } = require("./_shared");

const teamSchema = createSchema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    locked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },
    disqualified: { type: Boolean, default: false },
    disqualifyReason: { type: String, default: null },
    checkedIn: { type: Boolean, default: false },
    checkedInAt: { type: Date, default: null },
    hackathonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon",
      required: true,
      validate: refExists("Hackathon"),
    },
    createdById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      validate: refExists("User"),
    },
  },
  { timestamps: true }
);

// @@unique([hackathonId, name])
teamSchema.index({ hackathonId: 1, name: 1 }, { unique: true });

// Relations (populate with .populate("members") / .populate("hackathon"))
teamSchema.virtual("members", {
  ref: "TeamMember",
  localField: "_id",
  foreignField: "teamId",
});

teamSchema.virtual("hackathon", {
  ref: "Hackathon",
  localField: "hackathonId",
  foreignField: "_id",
  justOne: true,
});

// onDelete: Cascade -> team members. Runs for `teamDoc.deleteOne()`.
teamSchema.pre("deleteOne", { document: true, query: false }, async function () {
  await mongoose.model("TeamMember").deleteMany({ teamId: this._id });
  await mongoose.model("TeamInvite").deleteMany({ teamId: this._id });
  await mongoose.model("Submission").deleteMany({ teamId: this._id });
  await mongoose.model("JudgeAssignment").deleteMany({ teamId: this._id });
  await mongoose.model("RoundScore").deleteMany({ teamId: this._id });
});

module.exports = mongoose.model("Team", teamSchema);
