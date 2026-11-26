require("dotenv").config();

const mongoose = require("mongoose");
const User = require("./src/models/User");

// usage: node make-judge.js someone@example.com
const email = (process.argv[2] || "").trim().toLowerCase();

async function main() {
  if (!email) {
    console.log("Please give an email. Example: node make-judge.js someone@example.com");
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const result = await User.updateOne(
      { email: email },
      { $set: { role: "JUDGE" } }
    );

    console.log("Judge role update result:", result);

    if (result.matchedCount === 0) {
      console.log("User not found. Please register first and check the email.");
    } else {
      console.log("Judge role updated successfully! Log out and log in again.");
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
