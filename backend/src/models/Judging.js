const mongoose = require("mongoose");
const { createSchema, refExists } = require("./_shared");

const judgingSchema = createSchema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      validate: refExists("Project"),
    },

    judgeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      validate: refExists("User"),
    },

    hackathonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon",
      required: true,
      validate: refExists("Hackathon"),
    },

    innovationScore: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
    },

    technicalScore: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
    },

    presentationScore: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
    },

    usefulnessScore: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
    },

    comments: {
      type: String,
      default: "",
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

judgingSchema.index(
  { projectId: 1, judgeId: 1 },
  { unique: true }
);

judgingSchema.virtual("totalScore").get(function () {
  return (
    this.innovationScore +
    this.technicalScore +
    this.presentationScore +
    this.usefulnessScore
  );
});

module.exports = mongoose.model("Judging", judgingSchema);