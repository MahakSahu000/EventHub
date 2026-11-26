import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import AuthLayout from "../components/AuthLayout";

function ForgotPassword() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function sendOtp(e) {
    e.preventDefault();
    setError("");
    const res = await api("/auth/forgot-password", "POST", { email });
    if (res.ok) {
      setMsg(res.message);
      setStep(2);
    } else {
      setError(res.message);
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    setError("");
    setMsg("");
    const res = await api("/auth/reset-password", "POST", { email, otp, newPassword });
    if (res.ok) {
      setMsg(res.message);
      setStep(3);
    } else {
      setError(res.message);
    }
  }

  return (
    <AuthLayout
      title={step === 3 ? "All set" : "Reset your password"}
      subtitle={
        step === 1
          ? "Enter your account email and we'll send you a reset code."
          : step === 2
          ? "Enter the code from your email and choose a new password."
          : "Your password has been updated. You can log in now."
      }
    >
      {step === 1 && (
        <form onSubmit={sendOtp}>
          <label>Email</label>
          <input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit">Send reset code</button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={resetPassword}>
          <label>Verification code</label>
          <input className="otp-input" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" value={otp} maxLength={6} onChange={(e) => setOtp(e.target.value)} />
          <label>New Password</label>
          <input type="password" autoComplete="new-password" placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <button type="submit">Reset Password</button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
      {msg && <p className="success">{msg}</p>}
      <p className="auth-footer">
        <Link to="/login">← Back to login</Link>
      </p>
    </AuthLayout>
  );
}

export default ForgotPassword;
