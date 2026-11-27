import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

function Navbar() {
  const { user, role, logout, inviteCount } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const initial = user && user.name ? user.name.charAt(0).toUpperCase() : "?";

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="logo">
          <span className="logo-mark">E</span>
          EventHub
        </Link>
        {user ? (
          <div className="nav-links">
            <NavLink to="/" end>Hackathons</NavLink>
            {role === "PARTICIPANT" && (
              <NavLink to="/invites">
                Invites {inviteCount > 0 && <span className="count">{inviteCount}</span>}
              </NavLink>
            )}
            {role === "JUDGE" && <NavLink to="/judging">Judging</NavLink>}
            {(role === "VOLUNTEER" || role === "ADMIN") && (
              <NavLink to="/check-in">Check-in</NavLink>
            )}
            {role === "ADMIN" && <NavLink to="/admin">Admin</NavLink>}
            <span className="nav-divider" />
            <NavLink to="/profile" className="nav-user">
              <span className="avatar">{initial}</span>
              <span className="user-name">{user.name}</span>
            </NavLink>
            <button className="btn-small btn-ghost" onClick={handleLogout}>
              Logout
            </button>
          </div>
        ) : (
          <div className="nav-links">
            <NavLink to="/login">Login</NavLink>
            <NavLink to="/register">Register</NavLink>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
