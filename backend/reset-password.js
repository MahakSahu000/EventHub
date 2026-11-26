const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const { connectDB } = require("./src/config/database");
const { User } = require("./src/models");

async function main() {
  await connectDB();

  const email = "testuser101@example.com";
  const newPassword = "AdminPass123!";

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  const user = await User.findOneAndUpdate(
    { email },
    { password: hashedPassword },
    { returnDocument: "after" }
  ).select("email role");

  // Prisma's update() threw when no row matched; keep that behaviour
  if (!user) {
    throw new Error(`No user found with email ${email}`);
  }

  console.log("Password reset successful:");
  console.log(user.toJSON());
}

main()
  .catch((error) => {
    console.error("Password reset failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
