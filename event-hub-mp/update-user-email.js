require("dotenv").config();

const mongoose = require("mongoose");
const User = require("./src/models/User");

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const result = await User.updateOne(
      { email: "apna-email@example.com" },
      { $set: { email: "mahaksahu1112@gmail.com" } }
    );

    console.log("Update result:", result);
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await mongoose.disconnect();
  }
}

main();
