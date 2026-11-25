const mongoose = require("mongoose");
const { createSchema, refExists } = require("./_shared");

const teamMemberSchema = createSchema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      validate: refExists("Team"),
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      validate: refExists("User"),
    },
    role: { type: String, default: "MEMBER" },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// @@unique([teamId, userId])
teamMemberSchema.index({ teamId: 1, userId: 1 }, { unique: true });

teamMemberSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("TeamMember", teamMemberSchema);
