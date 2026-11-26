require("dotenv").config();

const mongoose = require("mongoose");

mongoose.set("sanitizeFilter", true);

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is missing in .env");
  }

  await mongoose.connect(uri);

  console.log("MongoDB connected");

  return mongoose.connection;
}

module.exports = { connectDB };
