const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: "*" } });

  // client sends access token in handshake, we put the socket in its user room
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error("No token"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    socket.join("user:" + socket.userId);
  });

  return io;
}

// send event to everyone connected
function emitAll(event, data) {
  if (io) io.emit(event, data);
}

// send event to one user only
function emitToUser(userId, event, data) {
  if (io) io.to("user:" + String(userId)).emit(event, data);
}

module.exports = { initSocket, emitAll, emitToUser };
