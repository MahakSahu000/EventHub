import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { formatDate, getPhase } from "../utils";
import { Loader } from "../components/UI";

function firstLetter(name) {
  return name ? name.charAt(0).toUpperCase() : "?";
}

function Profile() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/dashboard").then((res) => {
      if (res.ok) setData(res.data);
      else setError(res.message);
    });
  }, []);

  if (!data) return error ? <p className="error">{error}</p> : <Loader text="Loading profile..." />;
  const me = data.user;
  const role = (me.role || "").toUpperCase();

  return (
    <div className="profile-page">
      {/* header with avatar */}
      <div className="profile-header">
        <div className="profile-avatar">{firstLetter(me.name)}</div>
        <div>
          <h2>{me.name}</h2>
          <div className="profile-sub">
            {me.username && <span>@{me.username}</span>}
            <span className="badge">{role}</span>
          </div>
        </div>
      </div>

      {data.pendingInvites > 0 && (
        <div className="notice">
          You have <b>{data.pendingInvites}</b> pending team invite(s).
          <Link to="/invites" className="btn btn-small">View Invites</Link>
        </div>
      )}

      {/* account details */}
      <div className="card">
        <h3>Account Details</h3>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Full Name</span>
            <span>{me.name}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Username</span>
            <span>{me.username ? "@" + me.username : "-"}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Email</span>
            <span>
              {me.email}
              {me.isEmailVerified && <span className="badge green">Verified</span>}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Gender</span>
            <span className="capitalize">{me.gender || "-"}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Role</span>
            <span className="capitalize">{role.toLowerCase().replace("_", " ")}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Member Since</span>
            <span>{formatDate(me.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* teams */}
      <h3>My Teams</h3>
      {data.teams.length === 0 && (
        <div className="card empty">
          <p className="muted">You are not part of any team yet.</p>
          {role === "PARTICIPANT" && <Link to="/" className="btn">Browse Hackathons</Link>}
        </div>
      )}

      <div className="grid">
        {data.teams.map((t) => (
          <div className="card team-card" key={t.id}>
            <div className="team-card-top">
              <div>
                <h3>
                  <Link to={"/teams/" + t.id}>{t.name}</Link>
                </h3>
                <p className="muted">
                  {t.hackathon ? t.hackathon.title : ""}
                  {t.hackathon && " · " + getPhase(t.hackathon).replace("_", " ")}
                </p>
              </div>
              <span className={t.myRole === "LEADER" ? "badge" : "badge grey"}>
                {t.myRole === "LEADER" ? "Leader" : "Member"}
              </span>
            </div>

            {t.description && <p className="team-desc">{t.description}</p>}

            <div className="badges">
              {t.locked ? <span className="badge">Locked</span> : <span className="badge grey">Open</span>}
              {t.checkedIn && <span className="badge green">Checked in</span>}
              {t.disqualified && <span className="badge red">Disqualified</span>}
            </div>

            <div className="member-list">
              <div className="info-label">Members ({t.members.length})</div>
              {t.members.map((m) => (
                <div className="member-row" key={m.userId}>
                  <span className="avatar small">{firstLetter(m.name)}</span>
                  <div className="member-info">
                    <span className="member-name">
                      {m.name}
                      {m.userId === me.id && <span className="muted"> (you)</span>}
                    </span>
                    <span className="muted small-text">
                      {m.username ? "@" + m.username : ""}
                      {m.gender && " · " + m.gender}
                    </span>
                  </div>
                  {m.role === "LEADER" && <span className="badge">Leader</span>}
                </div>
              ))}
            </div>

            <Link to={"/teams/" + t.id} className="btn btn-grey">Open Team</Link>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Profile;
