const mongoose = require("mongoose");
const { createSchema } = require("./_shared");

const announcementSchema = createSchema(
  {
    hackathonId: { type: mongoose.Schema.Types.ObjectId, ref: "Hackathon", required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

announcementSchema.virtual("createdBy", { ref: "User", localField: "createdById", foreignField: "_id", justOne: true });

module.exports = mongoose.model("Announcement", announcementSchema);
