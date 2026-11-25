const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");

const userRoutes = require("./routes/user.routes");
const authRoutes = require("./routes/auth.routes");
const hackathonRoutes = require("./routes/hackathon.routes");
const teamRoutes = require("./routes/team.routes");
const registrationRoutes = require("./routes/registration.routes");
const projectRoutes = require("./routes/project.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const judgingRoutes = require("./routes/judging.routes");
const waveRoutes = require("./routes/wave.routes");
const roundRoutes = require("./routes/round.routes");
const announcementRoutes = require("./routes/announcement.routes");
const auditRoutes = require("./routes/audit.routes");

const app = express();


app.use(helmet());


app.use(cors());


app.use(express.json());

// API routes
app.use("/users", userRoutes);
app.use("/auth", authRoutes);
app.use("/hackathons", hackathonRoutes);
app.use("/teams", teamRoutes);
app.use("/", registrationRoutes);
app.use("/projects", projectRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/judging", judgingRoutes);
app.use("/waves", waveRoutes);
app.use("/rounds", roundRoutes);
app.use("/announcements", announcementRoutes);
app.use("/audit-logs", auditRoutes);


app.get("/", (req, res) => {
  res.status(200).json({
    status: true,
    message: "Hackathon Management System API is running",
    data: {
      service: "backend",
    },
  });
});


app.get("/health", (req, res) => {
  res.status(200).json({
    status: true,
    message: "Server is healthy",
    data: null,
  });
});


app.get("/db-test", async (req, res) => {
  try {
    await mongoose.connection.db.admin().ping();

    res.status(200).json({
      status: true,
      message: "Database connection successful",
      data: {
        database: "MongoDB",
        connected: true,
      },
    });
  } catch (error) {
    console.error("Database connection error:", error.message);

    res.status(500).json({
      status: false,
      message: "Database connection failed",
      data: null,
    });
  }
});

module.exports = app;