import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import AuthLayout from "../components/AuthLayout";

function VerifyOtp() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [otp, setOtp] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    setMsg("");
    if (otp.length !== 6) {
      setError("OTP should be 6 digits");
      return;
    }
    const res = await api("/auth/verify-email", "POST", { email, otp });
    if (res.ok) {
      setMsg("Email verified! Redirecting to login...");
      setTimeout(() => navigate("/login"), 1500);
    } else {
      setError(res.message);
    }
  }

  async function resend() {
    setError("");
    setMsg("");
    if (!email) {
      setError("Enter your email first");
      return;
    }
    const res = await api("/auth/resend-otp", "POST", { email });
    if (res.ok) setMsg(res.message);
    else setError(res.message);
  }

  return (
    <AuthLayout title="Verify your email" subtitle="We've sent a 6-digit code to your inbox. Enter it below to activate your account.">
      <form onSubmit={handleVerify}>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>Verification code</label>
        <input
          className="otp-input"
          inputMode="numeric"
          autoComplete="one-time-code"
         
          placeholder="000000"
          value={otp}
          maxLength={6}
          onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
        />
        {error && <p className="error">{error}</p>}
        {msg && <p className="success">{msg}</p>}
        <button type="submit">Verify email</button>
      </form>
      <p className="auth-footer">
        Didn't get it? <button className="btn-link" onClick={resend}>Resend code</button>
      </p>
    </AuthLayout>
  );
}

export default VerifyOtp;
