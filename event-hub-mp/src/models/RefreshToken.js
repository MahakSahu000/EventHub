const crypto = require("crypto");
const mongoose = require("mongoose");
const { createSchema, refExists } = require("./_shared");

const refreshTokenSchema = createSchema(
  {
    token: { type: String, required: true, unique: true },
    // database already has a unique index on tokenHash (from older code),
    // so we must always fill it, otherwise 2nd login fails with duplicate null
    tokenHash: { type: String },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      validate: refExists("User"),
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

refreshTokenSchema.pre("validate", function () {
  if (this.token && !this.tokenHash) {
    this.tokenHash = crypto.createHash("sha256").update(this.token).digest("hex");
  }
});

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
