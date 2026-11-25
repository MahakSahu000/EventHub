require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const app = require("./app");
const { connectDB } = require("./config/database");
const { initSocket } = require("./utils/socket");
const { User } = require("./models");
const { logAudit } = require("./utils/audit");

const PORT = process.env.PORT || 4000;

// delete accounts which did not verify email within 7 days
async function removeUnverifiedUsers() {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await User.deleteMany({
      isEmailVerified: false,
      emailOtpHash: mongoose.trusted({ $ne: null }),
      createdAt: mongoose.trusted({ $lt: sevenDaysAgo }),
    });
    if (result.deletedCount > 0) {
      console.log("Removed unverified users:", result.deletedCount);
      await logAudit(null, "CLEANUP_UNVERIFIED_USERS", "User", null, { count: result.deletedCount });
    }
  } catch (error) {
    console.error("Cleanup job error:", error.message);
  }
}

connectDB()
  .then(() => {
    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, () => {
      console.log(`Hackathon backend running on port ${PORT}`);
    });

    removeUnverifiedUsers();
    setInterval(removeUnverifiedUsers, 60 * 60 * 1000);
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });
