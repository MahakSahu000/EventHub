import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import AuthLayout from "../components/AuthLayout";

function Register() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    username: "",
    gender: "",
  });
  const [usernameMsg, setUsernameMsg] = useState("");
  const [usernameOk, setUsernameOk] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function handleChange(e) {
    let value = e.target.value;
    if (e.target.name === "username") value = value.toLowerCase().trim();
    setForm({ ...form, [e.target.name]: value });
  }

  // check user 
  useEffect(() => {
    if (!form.username) {
      setUsernameMsg("");
      setUsernameOk(false);
      return;
    }
    setUsernameMsg("Checking...");
    const timer = setTimeout(async () => {
      const res = await api("/auth/check-username?username=" + encodeURIComponent(form.username));
      if (res.ok) {
        setUsernameMsg(res.message);
        setUsernameOk(res.data.available);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.username]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.name || !form.email || !form.password || !form.gender || !form.username) {
      setError("Please fill all fields");
      return;
    }
    if (!usernameOk) {
      setError("Please choose an available username");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    // same rule as backend
    const strong = form.password.length >= 8 && /[A-Z]/.test(form.password) && /[0-9]/.test(form.password) && /[^A-Za-z0-9]/.test(form.password);
    if (!strong) {
      setError("Password must have 8 chars, 1 uppercase, 1 number and 1 special character");
      return;
    }

    setLoading(true);
    const res = await api("/auth/register", "POST", {
      name: form.name,
      email: form.email,
      password: form.password,
      username: form.username,
      gender: form.gender,
    });
    setLoading(false);

    if (res.ok) {
      navigate("/verify?email=" + encodeURIComponent(form.email));
    } else {
      setError(res.message);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Join hackathons, build teams and compete.">
      <form onSubmit={handleSubmit}>
        <label>Full Name</label>
        <input name="name" autoComplete="name" placeholder="Jane Doe" value={form.name} onChange={handleChange} />

        <label>Email</label>
        <input name="email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={handleChange} />

        <div className="form-cols">
          <div>
            <label>Password</label>
            <input name="password" type="password" autoComplete="new-password" placeholder="••••••••" value={form.password} onChange={handleChange} />
          </div>
          <div>
            <label>Confirm Password</label>
            <input name="confirmPassword" type="password" autoComplete="new-password" placeholder="••••••••" value={form.confirmPassword} onChange={handleChange} />
          </div>
        </div>
        <p className="hint">At least 8 characters with an uppercase letter, a number and a symbol.</p>

        <label>Username</label>
        <input name="username" autoComplete="username" placeholder="janedoe" value={form.username} onChange={handleChange} />
        {usernameMsg && <p className={usernameOk ? "success small" : "error small"}>{usernameMsg}</p>}

        <label>Gender</label>
        <select name="gender" value={form.gender} onChange={handleChange}>
          <option value="">Select gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? <><span className="spinner small" /> Creating account...</> : "Create account"}
        </button>
      </form>
      <p className="auth-footer">
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  );
}

export default Register;
