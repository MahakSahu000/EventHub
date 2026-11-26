const mongoose = require("mongoose");
const { createSchema } = require("./_shared");

// keeps record of important admin / system actions
const auditLogSchema = createSchema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, required: true },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.virtual("actor", { ref: "User", localField: "actorId", foreignField: "_id", justOne: true });

module.exports = mongoose.model("AuditLog", auditLogSchema);
