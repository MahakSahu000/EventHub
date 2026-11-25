
require("dotenv").config();

const { sendOtpEmail } = require("./src/utils/email");

async function testEmail() {
  try {
    await sendOtpEmail(
      process.env.EMAIL_USER,
      "123456"
    );

    console.log("Email sent successfully!");
  } catch (error) {
    console.error("Email sending failed:", error.message);
  }
}

testEmail();
