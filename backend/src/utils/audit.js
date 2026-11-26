const { AuditLog } = require("../models");

// save an audit log entry, never crash the request if this fails
async function logAudit(actorId, action, targetType, targetId, details) {
  try {
    await AuditLog.create({
      actorId: actorId || null,
      action: action,
      targetType: targetType || null,
      targetId: targetId ? String(targetId) : null,
      details: details || null,
    });
  } catch (err) {
    console.error("Audit log failed:", err.message);
  }
}

module.exports = { logAudit };
