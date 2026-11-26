// split panel used by login / register / otp / forgot password
function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <div className="auth-aside-inner">
          <span className="auth-kicker">EventHub</span>
          <h1>Build, ship and win — together.</h1>
          <p>Register for hackathons, form your dream team, submit your project and follow the leaderboard live.</p>
          <ul className="auth-points">
            <li>Form teams and invite friends</li>
            <li>Submit projects in waves</li>
            <li>Real-time scores and rankings</li>
          </ul>
        </div>
      </aside>
      <div className="auth-main">
        <div className="form-box">
          <h2>{title}</h2>
          {subtitle && <p className="muted auth-subtitle">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
