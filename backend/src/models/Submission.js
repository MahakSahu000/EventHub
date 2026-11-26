const mongoose = require("mongoose");
const { createSchema } = require("./_shared");

const submissionSchema = createSchema(
  {
    waveId: { type: mongoose.Schema.Types.ObjectId, ref: "Wave", required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    hackathonId: { type: mongoose.Schema.Types.ObjectId, ref: "Hackathon", required: true },
    // { fieldKey: value }
    answers: { type: Map, of: String, default: {} },
    submittedById: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// one submission per team per wave (can be updated till wave ends)
submissionSchema.index({ waveId: 1, teamId: 1 }, { unique: true });

submissionSchema.virtual("team", { ref: "Team", localField: "teamId", foreignField: "_id", justOne: true });
submissionSchema.virtual("submittedBy", { ref: "User", localField: "submittedById", foreignField: "_id", justOne: true });

module.exports = mongoose.model("Submission", submissionSchema);
