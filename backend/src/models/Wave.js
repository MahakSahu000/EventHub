const mongoose = require("mongoose");
const { createSchema } = require("./_shared");

// A submission wave. Admin decides which fields teams have to fill.
const fieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    // text / textarea / url / file (file = link to the file for now)
    type: { type: String, default: "text" },
    required: { type: Boolean, default: false },
  },
  { _id: false }
);

const waveSchema = createSchema(
  {
    hackathonId: { type: mongoose.Schema.Types.ObjectId, ref: "Hackathon", required: true },
    title: { type: String, required: true },
    instructions: { type: String, default: "" },
    fields: { type: [fieldSchema], default: [] },
    allowedFileTypes: { type: [String], default: [] },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

waveSchema.pre("deleteOne", { document: true, query: false }, async function () {
  await mongoose.model("Submission").deleteMany({ waveId: this._id });
});

module.exports = mongoose.model("Wave", waveSchema);
