const mongoose = require("mongoose");
const { createSchema } = require("./_shared");

// status: PENDING / ACCEPTED / REJECTED / CANCELLED
const teamInviteSchema = createSchema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    hackathonId: { type: mongoose.Schema.Types.ObjectId, ref: "Hackathon", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    invitedById: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, default: "PENDING" },
  },
  { timestamps: true }
);

teamInviteSchema.virtual("team", { ref: "Team", localField: "teamId", foreignField: "_id", justOne: true });
teamInviteSchema.virtual("user", { ref: "User", localField: "userId", foreignField: "_id", justOne: true });
teamInviteSchema.virtual("invitedBy", { ref: "User", localField: "invitedById", foreignField: "_id", justOne: true });

module.exports = mongoose.model("TeamInvite", teamInviteSchema);
