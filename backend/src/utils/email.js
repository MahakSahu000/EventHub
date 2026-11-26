
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

async function sendOtpEmail(email, otp) {
  return transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: email,
    subject: "EventHub Email Verification OTP",
    text: `Your EventHub verification OTP is ${otp}. It will expire in 10 minutes. Do not share this code with anyone.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto;">
        <h2>Welcome to EventHub!</h2>
        <p>Use the OTP below to verify your email address:</p>
        <h1 style="letter-spacing: 8px;">${otp}</h1>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendOtpEmail };
