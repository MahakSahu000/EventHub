require("dotenv").config();

const mongoose = require("mongoose");
const User = require("./src/models/User");

const email = (process.argv[2] || "").trim().toLowerCase();

async function main() {
  if (!email) {
    console.log("Please give an email. Example: node make-admin.js someone@example.com");
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const result = await User.updateOne(
      { email: email },
      { $set: { role: "ADMIN" } }
    );

    console.log("Admin role update result:", result);

    if (result.matchedCount === 0) {
      console.log("User not found. Please register first and check the email.");
    } else {
      console.log("Admin role updated successfully! Log out and log in again.");
    }
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await mongoose.disconnect();
  }
}

main();