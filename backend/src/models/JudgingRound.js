const mongoose = require("mongoose");
const { createSchema } = require("./_shared");

const criterionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    maxScore: { type: Number, default: 10 },
  },
  { _id: false }
);

const judgingRoundSchema = createSchema(
  {
    hackathonId: { type: mongoose.Schema.Types.ObjectId, ref: "Hackathon", required: true },
    name: { type: String, required: true },
    // which wave's submissions the judges will look at (optional)
    waveId: { type: mongoose.Schema.Types.ObjectId, ref: "Wave", default: null },
    criteria: { type: [criterionSchema], default: [] },
    isOpen: { type: Boolean, default: true },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

judgingRoundSchema.virtual("wave", { ref: "Wave", localField: "waveId", foreignField: "_id", justOne: true });

judgingRoundSchema.pre("deleteOne", { document: true, query: false }, async function () {
  await mongoose.model("JudgeAssignment").deleteMany({ roundId: this._id });
  await mongoose.model("RoundScore").deleteMany({ roundId: this._id });
});

module.exports = mongoose.model("JudgingRound", judgingRoundSchema);
