const express = require("express");
const bcrypt = require("bcrypt");
const { User } = require("../models");
const authenticateToken = require("../middleware/auth.middleware");
const authorizeRole = require("../middleware/authorizeRole");

const router = express.Router();

// Create a new user securely
// (admin only - normal users should use /auth/register)
router.post("/", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const { name, email, password, gender } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        status: false,
        message: "Name, email and password are required",
        data: null,
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        status: false,
        message: "Email already exists",
        data: null,
      });
    }

    // Hash the password before saving it
    const hashedPassword = await bcrypt.hash(password, 12);

    const created = await User.create({
      name,
      email,
      password: hashedPassword,
      gender: gender || null,
    });

    // Never expose the password hash
    const user = {
      id: created.id,
      name: created.name,
      email: created.email,
      gender: created.gender,
      role: created.role,
      createdAt: created.createdAt,
    };

    return res.status(201).json({
      status: true,
      message: "User created successfully",
      data: user,
    });
  } catch (error) {
    console.error("Create user error:", error.message);

    return res.status(500).json({
      status: false,
      message: "Failed to create user",
      data: null,
    });
  }
});

// Get all users without exposing passwords
// Admin only. Optional filter: /users?role=JUDGE
router.get("/", authenticateToken, authorizeRole("ADMIN"), async (req, res) => {
  try {
    const filter = {};
    // some old users have lowercase roles, so match ignoring case
    if (typeof req.query.role === "string" && /^[A-Za-z_]+$/.test(req.query.role)) {
      filter.role = new RegExp("^" + req.query.role + "$", "i");
    }

    const users = await User.find(filter)
      .select("name email username gender role isEmailVerified createdAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: true,
      message: "Users fetched successfully",
      data: users,
    });
  } catch (error) {
    console.error("Fetch users error:", error.message);

    return res.status(500).json({
      status: false,
      message: "Failed to fetch users",
      data: null,
    });
  }
});

module.exports = router;
