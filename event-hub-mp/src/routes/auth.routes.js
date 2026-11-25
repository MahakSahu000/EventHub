const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { User, RefreshToken } = require("../models");
const authenticateToken = require("../middleware/auth.middleware");
const authorizeRole = require("../middleware/authorizeRole");
const { sendOtpEmail } = require("../utils/email");
const { isValidId } = require("../utils/objectId");
const { logAudit } = require("../utils/audit");

// lowercase letters, numbers and underscore, 3 to 20 chars
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

const router = express.Router();

// Generate access token
function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role, tv: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
}

// Generate refresh token
function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, type: "refresh" },
    process.env.JWT_SECRET,
    // random id so two tokens made in the same second are never identical
    { expiresIn: "7d", jwtid: crypto.randomUUID() }
  );
}

// Generate a secure 6-digit OTP
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

// Store only a hash of the OTP
function hashOtp(email, otp) {
  return crypto
    .createHash("sha256")
    .update(`${email}:${otp}`)
    .digest("hex");
}

// 1. REGISTER
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, gender } = req.body;
    const username =
      typeof req.body.username === "string"
        ? req.body.username.trim().toLowerCase()
        : "";

    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({
        status: false,
        message:
          "Username must be 3-20 characters (lowercase letters, numbers, underscore)",
        data: null,
      });
    }

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        status: false,
        message: "Name, email and password are required",
        data: null,
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Basic email format validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        status: false,
        message: "Please enter a valid email address",
        data: null,
      });
    }

    // Strong password validation
    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      return res.status(400).json({
        status: false,
        message:
          "Password must contain at least 8 characters, one uppercase letter, one number and one special character",
        data: null,
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing in .env");
    }

    if (
      gender !== undefined &&
      gender !== null &&
      typeof gender !== "string"
    ) {
      return res.status(400).json({
        status: false,
        message: "Gender must be a string",
        data: null,
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        status: false,
        message: "Email already registered",
        data: null,
      });
    }

    const usernameTaken = await User.findOne({ username: username });

    if (usernameTaken) {
      return res.status(409).json({
        status: false,
        message: "Username is already taken",
        data: null,
      });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(normalizedEmail, otp);
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      username: username,
      password: hashedPassword,
      gender:
        typeof gender === "string" && gender.trim()
          ? gender.trim()
          : null,
      role: "PARTICIPANT",
      isEmailVerified: false,
      emailOtpHash: otpHash,
      emailOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    try {
      await sendOtpEmail(normalizedEmail, otp);
    } catch (emailError) {
      console.error("OTP email sending failed:", emailError.message);

      return res.status(503).json({
        status: false,
        message:
          "Account created but OTP email could not be sent. Please contact support to resend the OTP.",
        data: null,
      });
    }

    return res.status(201).json({
      status: true,
      message: "Registration successful. Please verify your email using the OTP sent to you.",
      data: {
        userId: user.id,
        email: user.email,
        emailVerified: false,
      },
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      status: false,
      message: "Registration failed",
      data: null,
    });
  }
});

// RESEND EMAIL OTP
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        status: false,
        message: "Email is required",
        data: null,
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
        data: null,
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        status: false,
        message: "Email is already verified",
        data: null,
      });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(normalizedEmail, otp);

    await User.updateOne(
      { _id: user._id },
      {
        emailOtpHash: otpHash,
        emailOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      }
    );

    try {
      await sendOtpEmail(normalizedEmail, otp);
    } catch (emailError) {
      console.error("Resend OTP email error:", emailError.message);

      return res.status(503).json({
        status: false,
        message: "OTP email could not be sent. Please try again later.",
        data: null,
      });
    }

    return res.status(200).json({
      status: true,
      message: "A new OTP has been sent to your email",
      data: {
        email: normalizedEmail,
      },
    });
  } catch (error) {
    console.error("Resend OTP error:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to resend OTP",
      data: null,
    });
  }
});


// 2. VERIFY EMAIL USING OTP
router.post("/verify-email", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp)
    ) {
      return res.status(400).json({
        status: false,
        message: "A valid email and 6-digit OTP are required",
        data: null,
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(400).json({
        status: false,
        message: "Invalid email or OTP",
        data: null,
      });
    }

    if (user.isEmailVerified) {
      return res.status(200).json({
        status: true,
        message: "Email is already verified",
        data: null,
      });
    }

    if (
      !user.emailOtpHash ||
      !user.emailOtpExpiresAt ||
      user.emailOtpExpiresAt <= new Date()
    ) {
      return res.status(400).json({
        status: false,
        message: "OTP is invalid or expired. Please request a new OTP.",
        data: null,
      });
    }

    const suppliedHash = hashOtp(normalizedEmail, otp);

    if (suppliedHash !== user.emailOtpHash) {
      return res.status(400).json({
        status: false,
        message: "Invalid email or OTP",
        data: null,
      });
    }

    await User.updateOne(
      { _id: user._id },
      {
        isEmailVerified: true,
        emailOtpHash: null,
        emailOtpExpiresAt: null,
      }
    );

    return res.status(200).json({
      status: true,
      message: "Email verified successfully",
      data: {
        email: normalizedEmail,
        emailVerified: true,
      },
    });
  } catch (error) {
    console.error("Email verification error:", error);

    return res.status(500).json({
      status: false,
      message: "Email verification failed",
      data: null,
    });
  }
});

/*  FORGOT PASSWORD
    POST /auth/forgot-password
*/
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        status: false,
        message: "Email is required",
        data: null,
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    // Do not reveal whether an account exists.
    if (!user || !user.isEmailVerified) {
      return res.status(200).json({
        status: true,
        message:
          "If a verified account exists, password reset instructions will be sent to its email.",
        data: null,
      });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(normalizedEmail, otp);

    await User.updateOne(
      { _id: user._id },
      {
        passwordResetOtpHash: otpHash,
        passwordResetOtpExpiresAt: new Date(
          Date.now() + 10 * 60 * 1000
        ),
      }
    );

    try {
      await sendOtpEmail(normalizedEmail, otp);
    } catch (emailError) {
      console.error(
        "Password reset email error:",
        emailError.message
      );

      // Clear the OTP if delivery fails.
      await User.updateOne(
        { _id: user._id },
        {
          passwordResetOtpHash: null,
          passwordResetOtpExpiresAt: null,
        }
      );

      return res.status(503).json({
        status: false,
        message: "Unable to send reset OTP. Please try again later.",
        data: null,
      });
    }

    return res.status(200).json({
      status: true,
      message:
        "If a verified account exists, password reset instructions will be sent to its email.",
      data: null,
    });
  } catch (error) {
    console.error("Forgot password error:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to process password reset request",
      data: null,
    });
  }
});

/*  RESET PASSWORD
    POST /auth/reset-password
*/
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp) ||
      typeof newPassword !== "string"
    ) {
      return res.status(400).json({
        status: false,
        message: "Valid email, 6-digit OTP and new password are required",
        data: null,
      });
    }

    if (
      newPassword.length < 8 ||
      !/[A-Z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword) ||
      !/[^A-Za-z0-9]/.test(newPassword)
    ) {
      return res.status(400).json({
        status: false,
        message:
          "Password must contain at least 8 characters, one uppercase letter, one number and one special character",
        data: null,
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.isEmailVerified) {
      return res.status(400).json({
        status: false,
        message: "Invalid or expired password reset OTP",
        data: null,
      });
    }

    if (
      !user.passwordResetOtpHash ||
      !user.passwordResetOtpExpiresAt ||
      user.passwordResetOtpExpiresAt <= new Date()
    ) {
      return res.status(400).json({
        status: false,
        message: "Invalid or expired password reset OTP",
        data: null,
      });
    }

    const suppliedHash = hashOtp(normalizedEmail, otp);

    if (suppliedHash !== user.passwordResetOtpHash) {
      return res.status(400).json({
        status: false,
        message: "Invalid or expired password reset OTP",
        data: null,
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Revoke existing refresh tokens, change password and consume the OTP.
    // (Tokens are revoked first: if the second step ever fails, the OTP is
    // still valid and the user can simply retry.)
    await RefreshToken.deleteMany({ userId: user._id });

    await User.updateOne(
      { _id: user._id },
      {
        password: hashedPassword,
        tokenVersion: (user.tokenVersion || 0) + 1,
        passwordResetOtpHash: null,
        passwordResetOtpExpiresAt: null,
      }
    );

    return res.status(200).json({
      status: true,
      message:
        "Password reset successful. Please log in with your new password.",
      data: null,
    });
  } catch (error) {
    console.error("Reset password error:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to reset password",
      data: null,
    });
  }
});


// 3. LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        status: false,
        message: "Email and password are required",
        data: null,
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing in .env");
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({
        status: false,
        message: "Invalid email or password",
        data: null,
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        status: false,
        message: "Invalid email or password",
        data: null,
      });
    }

    // Pending registrations must verify their email first.
    // Legacy accounts without an OTP hash remain usable.
    if (!user.isEmailVerified && user.emailOtpHash) {
      return res.status(403).json({
        status: false,
        message: "EMAIL_NOT_VERIFIED",
        data: null,
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await RefreshToken.create({
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return res.status(200).json({
      status: true,
      message: "Login successful",
      data: {
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        expiresIn: "15m",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          gender: user.gender,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      status: false,
      message: "Login failed",
      data: null,
    });
  }
});

// 4. GET LOGGED-IN USER
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = isValidId(req.user.userId)
      ? await User.findById(req.user.userId).select(
          "name email username gender role isEmailVerified createdAt"
        )
      : null;

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
        data: null,
      });
    }

    return res.status(200).json({
      status: true,
      message: "User profile fetched successfully",
      data: user,
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to fetch user profile",
      data: null,
    });
  }
});

// 5. REFRESH ACCESS TOKEN
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (typeof refreshToken !== "string" || !refreshToken) {
      return res.status(400).json({
        status: false,
        message: "Refresh token is required",
        data: null,
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing in .env");
    }

    let decoded;

    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({
        status: false,
        message: "Invalid or expired refresh token",
        data: null,
      });
    }

    if (decoded.type !== "refresh" || !decoded.userId) {
      return res.status(401).json({
        status: false,
        message: "Invalid refresh token",
        data: null,
      });
    }

    const savedToken = await RefreshToken.findOne({ token: refreshToken });

    if (!savedToken || savedToken.expiresAt <= new Date()) {
      return res.status(401).json({
        status: false,
        message: "Refresh token is no longer valid",
        data: null,
      });
    }

    const user = isValidId(decoded.userId)
      ? await User.findById(decoded.userId)
      : null;

    if (!user) {
      await RefreshToken.deleteMany({ token: refreshToken });

      return res.status(401).json({
        status: false,
        message: "User not found",
        data: null,
      });
    }

    const accessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Rotate: the old token is single-use. deleteOne is atomic, so if two
    // requests race with the same token only one of them gets deletedCount = 1.
    const rotated = await RefreshToken.deleteOne({ token: refreshToken });

    if (rotated.deletedCount === 0) {
      return res.status(401).json({
        status: false,
        message: "Refresh token is no longer valid",
        data: null,
      });
    }

    await RefreshToken.create({
      token: newRefreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return res.status(200).json({
      status: true,
      message: "Access token refreshed successfully",
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        tokenType: "Bearer",
        expiresIn: "15m",
      },
    });
  } catch (error) {
    console.error("Refresh error:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to refresh access token",
      data: null,
    });
  }
});

// 6. LOGOUT
router.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (typeof refreshToken !== "string" || !refreshToken) {
      return res.status(400).json({
        status: false,
        message: "Refresh token is required",
        data: null,
      });
    }

    const result = await RefreshToken.deleteMany({ token: refreshToken });

    if (result.deletedCount === 0) {
      return res.status(401).json({
        status: false,
        message: "Refresh token is already invalid or revoked",
        data: null,
      });
    }

    return res.status(200).json({
      status: true,
      message: "Logout successful",
      data: null,
    });
  } catch (error) {
    console.error("Logout error:", error);

    return res.status(500).json({
      status: false,
      message: "Logout failed",
      data: null,
    });
  }
});

// CHECK USERNAME AVAILABILITY
// GET /auth/check-username?username=abc
router.get("/check-username", async (req, res) => {
  try {
    const username =
      typeof req.query.username === "string"
        ? req.query.username.trim().toLowerCase()
        : "";

    if (!USERNAME_REGEX.test(username)) {
      return res.status(200).json({
        status: true,
        message:
          "Username must be 3-20 characters (lowercase letters, numbers, underscore)",
        data: { username: username, valid: false, available: false },
      });
    }

    const exists = await User.exists({ username: username });

    return res.status(200).json({
      status: true,
      message: exists ? "Username is already taken" : "Username is available",
      data: { username: username, valid: true, available: !exists },
    });
  } catch (error) {
    console.error("Check username error:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to check username",
      data: null,
    });
  }
});

// FORCE LOGOUT A USER (ADMIN)
// POST /auth/force-logout/:userId
router.post(
  "/force-logout/:userId",
  authenticateToken,
  authorizeRole("ADMIN"),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = isValidId(userId) ? await User.findById(userId) : null;

      if (!user) {
        return res.status(404).json({
          status: false,
          message: "User not found",
          data: null,
        });
      }

      // delete refresh tokens + bump version so access tokens stop working too
      await RefreshToken.deleteMany({ userId: user._id });
      await User.updateOne(
        { _id: user._id },
        { tokenVersion: (user.tokenVersion || 0) + 1 }
      );

      await logAudit(req.user.userId, "FORCE_LOGOUT", "User", user.id, {
        email: user.email,
      });

      return res.status(200).json({
        status: true,
        message: "User has been logged out from all devices",
        data: null,
      });
    } catch (error) {
      console.error("Force logout error:", error);
      return res.status(500).json({
        status: false,
        message: "Failed to force logout user",
        data: null,
      });
    }
  }
);

// 7. ADMIN-ONLY TEST ROUTE
router.get(
  "/admin-test",
  authenticateToken,
  authorizeRole("ADMIN"),
  (req, res) => {
    return res.status(200).json({
      status: true,
      message: "Admin access granted",
      data: {
        userId: req.user.userId,
        role: req.user.role,
      },
    });
  }
);

module.exports = router;
