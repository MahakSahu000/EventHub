import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import AuthLayout from "../components/AuthLayout";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // page user wanted before being sent to login
  const from = (location.state && location.state.from) || "/";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Please fill all fields");
      return;
    }
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);

    if (res.ok) {
      navigate(from, { replace: true });
    } else if (res.message === "EMAIL_NOT_VERIFIED") {
      // send user to otp page
      navigate("/verify?email=" + encodeURIComponent(email));
    } else {
      setError(res.message);
    }
  }

  if (!authLoading && user) return <Navigate to={from} replace />;

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to continue to your hackathons.">
      <form onSubmit={handleSubmit}>
        <label>Email</label>
        <input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="label-row">
          <label>Password</label>
          <Link to="/forgot-password" className="small-link">Forgot password?</Link>
        </div>
        <input type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? <><span className="spinner small" /> Signing in...</> : "Log in"}
        </button>
      </form>
      <p className="auth-footer">
        Don't have an account? <Link to="/register">Create one</Link>
      </p>
    </AuthLayout>
  );
}

export default Login;
