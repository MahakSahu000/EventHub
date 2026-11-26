const mongoose = require("mongoose");
const { createSchema, refExists } = require("./_shared");

const projectSchema = createSchema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    repositoryUrl: { type: String, default: null },
    demoUrl: { type: String, default: null },
    status: { type: String, default: "SUBMITTED" },
    userId: {
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
  },
  { timestamps: true }
);

projectSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

projectSchema.virtual("hackathon", {
  ref: "Hackathon",
  localField: "hackathonId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("Project", projectSchema);
