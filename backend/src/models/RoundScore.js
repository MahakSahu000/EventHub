const mongoose = require("mongoose");
const { createSchema } = require("./_shared");

const roundScoreSchema = createSchema(
  {
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: "JudgingRound", required: true },
    hackathonId: { type: mongoose.Schema.Types.ObjectId, ref: "Hackathon", required: true },
    judgeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    // [{ criterion: "Innovation", score: 8 }]
    scores: {
      type: [new mongoose.Schema({ criterion: String, score: Number }, { _id: false })],
      default: [],
    },
    total: { type: Number, default: 0 },
    comments: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true }
);

roundScoreSchema.index({ roundId: 1, judgeId: 1, teamId: 1 }, { unique: true });

roundScoreSchema.virtual("judge", { ref: "User", localField: "judgeId", foreignField: "_id", justOne: true });

module.exports = mongoose.model("RoundScore", roundScoreSchema);
