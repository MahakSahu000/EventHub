const mongoose = require("mongoose");
const { createSchema, refExists } = require("./_shared");

const hackathonRegistrationSchema = createSchema(
  {
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
    status: { type: String, default: "REGISTERED" },
    registeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ([userId, hackathonId])
hackathonRegistrationSchema.index({ userId: 1, hackathonId: 1 }, { unique: true });

hackathonRegistrationSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("HackathonRegistration", hackathonRegistrationSchema);