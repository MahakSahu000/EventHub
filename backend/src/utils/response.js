// small helpers so every new route sends { status, message, data }
function sendOk(res, code, message, data = null) {
  return res.status(code).json({ status: true, message: message, data: data });
}

function sendError(res, code, message) {
  return res.status(code).json({ status: false, message: message, data: null });
}

module.exports = { sendOk, sendError };
