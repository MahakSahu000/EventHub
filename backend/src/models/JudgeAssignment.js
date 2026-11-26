const mongoose = require("mongoose");
const { createSchema } = require("./_shared");

const judgeAssignmentSchema = createSchema(
  {
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: "JudgingRound", required: true },
    judgeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
  },
  { timestamps: true }
);

judgeAssignmentSchema.index({ roundId: 1, judgeId: 1, teamId: 1 }, { unique: true });

judgeAssignmentSchema.virtual("judge", { ref: "User", localField: "judgeId", foreignField: "_id", justOne: true });
judgeAssignmentSchema.virtual("team", { ref: "Team", localField: "teamId", foreignField: "_id", justOne: true });
judgeAssignmentSchema.virtual("round", { ref: "JudgingRound", localField: "roundId", foreignField: "_id", justOne: true });

module.exports = mongoose.model("JudgeAssignment", judgeAssignmentSchema);
